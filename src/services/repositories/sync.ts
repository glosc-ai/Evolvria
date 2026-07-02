import {
  buildSyncDeviceSnapshot,
  countOpenSyncConflicts,
  createFieldConflict,
  createSyncOperation,
  createSyncOperationLogPackage,
  disableSyncRetainingLocalData,
  importSyncOperationLogPackage,
  resolveConflictRecord,
  type ConflictResolution,
  type SyncDeviceSnapshot,
  type SyncOperationLogImportResult,
  type SyncOperationLogPackage,
} from "@/domain/sync";
import { createId, nowIso } from "@/domain/ids";
import type { SaveEnvelope, SyncOperation, SyncOperationEntity, SyncOperationKind, SyncSettings } from "@/types/domain";

export interface SyncStatusSnapshot extends SyncSettings {
  pendingOperationCount: number;
  openConflictCount: number;
}

export interface SyncQueueInput {
  entityType: SyncOperationEntity;
  entityId: string;
  op?: SyncOperationKind;
  patch?: unknown;
}

export interface SyncPushResult {
  pushedCount: number;
  operationIds: string[];
  status: SyncStatusSnapshot;
}

export interface SyncConflictResult {
  operationId: string;
  conflictId: string;
  status: SyncStatusSnapshot;
}

export interface SyncResolveResult {
  resolved: boolean;
  status: SyncStatusSnapshot;
}

export interface SyncImportLogResult extends SyncOperationLogImportResult {
  status: SyncStatusSnapshot;
  snapshot: SyncDeviceSnapshot;
}

export interface SyncRuntime {
  now(): string;
  id(prefix: string): string;
}

export interface SyncRepository {
  status(envelope: SaveEnvelope): SyncStatusSnapshot;
  updateSettings(envelope: SaveEnvelope, input: { enabled: boolean; endpoint?: string }): SyncStatusSnapshot;
  queueOperation(envelope: SaveEnvelope, input: SyncQueueInput): SyncOperation;
  push(envelope: SaveEnvelope): SyncPushResult;
  snapshot(envelope: SaveEnvelope): SyncDeviceSnapshot;
  exportOperationLog(envelope: SaveEnvelope): SyncOperationLogPackage;
  importOperationLog(envelope: SaveEnvelope, input: unknown): SyncImportLogResult;
  disableRetainingLocalData(envelope: SaveEnvelope): SyncStatusSnapshot;
  createStorylineConflict(envelope: SaveEnvelope, storylineId: string): SyncConflictResult;
  resolveConflict(envelope: SaveEnvelope, conflictId: string, resolution: ConflictResolution): SyncResolveResult;
}

const defaultRuntime: SyncRuntime = {
  now: nowIso,
  id: createId,
};

export class LocalSyncRepository implements SyncRepository {
  constructor(private readonly runtime: SyncRuntime = defaultRuntime) {}

  status(envelope: SaveEnvelope): SyncStatusSnapshot {
    const openConflictCount = countOpenSyncConflicts(envelope);
    const pendingOperationCount = Object.values(envelope.entities.syncOperations).filter((operation) =>
      operation.status === "queued" || operation.status === "pushed" || operation.status === "conflicted",
    ).length;
    return {
      ...envelope.settings.sync,
      conflictCount: openConflictCount,
      openConflictCount,
      pendingOperationCount,
    };
  }

  updateSettings(envelope: SaveEnvelope, input: { enabled: boolean; endpoint?: string }): SyncStatusSnapshot {
    envelope.settings.sync = {
      ...envelope.settings.sync,
      enabled: input.enabled,
      endpoint: input.endpoint,
      status: input.enabled ? "ready" : "local_only",
      conflictCount: countOpenSyncConflicts(envelope),
    };
    return this.status(envelope);
  }

  queueOperation(envelope: SaveEnvelope, input: SyncQueueInput): SyncOperation {
    const operation = createSyncOperation({
      id: this.runtime.id("syncop"),
      workspaceId: envelope.workspace.id,
      entityType: input.entityType,
      entityId: input.entityId,
      op: input.op,
      patch: input.patch,
      createdAt: this.runtime.now(),
    });
    envelope.entities.syncOperations[operation.id] = operation;
    envelope.settings.sync = {
      ...envelope.settings.sync,
      enabled: true,
      status: countOpenSyncConflicts(envelope) ? "conflict" : "ready",
      conflictCount: countOpenSyncConflicts(envelope),
    };
    return operation;
  }

  push(envelope: SaveEnvelope): SyncPushResult {
    const completedAt = this.runtime.now();
    const operationIds: string[] = [];
    for (const operation of Object.values(envelope.entities.syncOperations)) {
      if (operation.status === "queued" || operation.status === "pushed") {
        envelope.entities.syncOperations[operation.id] = {
          ...operation,
          status: "acked",
          completedAt,
          error: undefined,
        };
        operationIds.push(operation.id);
      }
    }
    envelope.settings.sync = {
      ...envelope.settings.sync,
      enabled: true,
      lastSyncAt: completedAt,
      status: countOpenSyncConflicts(envelope) ? "conflict" : "ready",
      conflictCount: countOpenSyncConflicts(envelope),
    };
    return {
      pushedCount: operationIds.length,
      operationIds,
      status: this.status(envelope),
    };
  }

  snapshot(envelope: SaveEnvelope): SyncDeviceSnapshot {
    return buildSyncDeviceSnapshot(envelope, this.runtime.now());
  }

  exportOperationLog(envelope: SaveEnvelope): SyncOperationLogPackage {
    return createSyncOperationLogPackage(envelope, this.runtime.now());
  }

  importOperationLog(envelope: SaveEnvelope, input: unknown): SyncImportLogResult {
    const imported = importSyncOperationLogPackage(envelope, input, this.runtime.now());
    return {
      ...imported,
      status: this.status(envelope),
      snapshot: this.snapshot(envelope),
    };
  }

  disableRetainingLocalData(envelope: SaveEnvelope): SyncStatusSnapshot {
    disableSyncRetainingLocalData(envelope);
    return this.status(envelope);
  }

  createStorylineConflict(envelope: SaveEnvelope, storylineId: string): SyncConflictResult {
    const storyline = envelope.entities.storylines[storylineId];
    if (!storyline) throw new Error("storyline_not_found");
    const operationId = this.runtime.id("syncop");
    const conflictId = this.runtime.id("conflict");
    const createdAt = this.runtime.now();
    envelope.entities.syncOperations[operationId] = createSyncOperation({
      id: operationId,
      workspaceId: envelope.workspace.id,
      entityType: "storylines",
      entityId: storylineId,
      op: "update",
      patch: { title: storyline.title, updatedAt: storyline.updatedAt },
      status: "conflicted",
      error: "remote_field_changed",
      createdAt,
    });
    envelope.entities.syncConflicts[conflictId] = createFieldConflict({
      id: conflictId,
      operationId,
      entityType: "storylines",
      entityId: storylineId,
      field: "title",
      localValue: storyline.title,
      remoteValue: `${storyline.title} - Cloud Revision`,
      createdAt,
    });
    envelope.settings.sync = {
      ...envelope.settings.sync,
      enabled: true,
      status: "conflict",
      conflictCount: countOpenSyncConflicts(envelope),
    };
    return {
      operationId,
      conflictId,
      status: this.status(envelope),
    };
  }

  resolveConflict(envelope: SaveEnvelope, conflictId: string, resolution: ConflictResolution): SyncResolveResult {
    const conflict = envelope.entities.syncConflicts[conflictId];
    if (!conflict || conflict.status !== "open") {
      return { resolved: false, status: this.status(envelope) };
    }
    const resolvedAt = this.runtime.now();
    if (resolution === "remote") {
      applyRemoteConflictValue(envelope, conflict.entityType, conflict.entityId, conflict.field, conflict.remoteValue, resolvedAt);
    }
    if (resolution === "copy") {
      duplicateStorylineFromConflict(envelope, conflict.entityId, conflict.localValue, this.runtime, resolvedAt);
    }
    envelope.entities.syncConflicts[conflictId] = resolveConflictRecord(conflict, resolution, resolvedAt);
    const operation = envelope.entities.syncOperations[conflict.operationId];
    if (operation) {
      envelope.entities.syncOperations[operation.id] = {
        ...operation,
        status: "acked",
        completedAt: resolvedAt,
        error: undefined,
      };
    }
    envelope.settings.sync = {
      ...envelope.settings.sync,
      status: countOpenSyncConflicts(envelope) ? "conflict" : "ready",
      conflictCount: countOpenSyncConflicts(envelope),
      lastSyncAt: resolvedAt,
    };
    return { resolved: true, status: this.status(envelope) };
  }
}

export const localSyncRepository = new LocalSyncRepository();

function applyRemoteConflictValue(
  envelope: SaveEnvelope,
  entityType: SyncOperationEntity,
  entityId: string,
  field: string,
  remoteValue: unknown,
  updatedAt: string,
) {
  const collection = envelope.entities[entityType] as Record<string, unknown>;
  const entity = collection[entityId];
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) return;
  collection[entityId] = {
    ...(entity as Record<string, unknown>),
    [field]: remoteValue,
    updatedAt,
  };
}

function duplicateStorylineFromConflict(
  envelope: SaveEnvelope,
  storylineId: string,
  localValue: unknown,
  runtime: SyncRuntime,
  createdAt: string,
) {
  const storyline = envelope.entities.storylines[storylineId];
  if (!storyline) return;
  const id = runtime.id("story");
  envelope.entities.storylines[id] = {
    ...storyline,
    id,
    title: typeof localValue === "string" ? `${localValue} (Local Copy)` : `${storyline.title} (Local Copy)`,
    visibility: "private",
    moderation: { ...storyline.moderation, state: "draft" },
    version: {
      ...storyline.version,
      version: `${storyline.version.version}+local-copy`,
      status: "draft",
      changelog: "Created from a sync conflict copy resolution.",
      baseVersionId: storyline.version.version,
    },
    createdAt,
    updatedAt: createdAt,
  };
}
