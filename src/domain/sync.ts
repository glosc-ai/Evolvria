import type { SaveEnvelope, SyncConflict, SyncOperation, SyncOperationEntity, SyncOperationKind } from "@/types/domain";

export type ConflictResolution = "local" | "remote" | "copy";

export function countOpenSyncConflicts(envelope: SaveEnvelope): number {
  return Object.values(envelope.entities.syncConflicts).filter((conflict) => conflict.status === "open").length;
}

export function createSyncOperation(input: {
  id: string;
  workspaceId: string;
  entityType: SyncOperationEntity;
  entityId: string;
  op?: SyncOperationKind;
  patch?: unknown;
  clientId?: string;
  status?: SyncOperation["status"];
  error?: string;
  createdAt: string;
}): SyncOperation {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    entityType: input.entityType,
    entityId: input.entityId,
    op: input.op ?? "update",
    patch: input.patch ?? {},
    clientId: input.clientId ?? "local-device",
    status: input.status ?? "queued",
    error: input.error,
    createdAt: input.createdAt,
  };
}

export function createFieldConflict(input: {
  id: string;
  operationId: string;
  entityType: SyncOperationEntity;
  entityId: string;
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  createdAt: string;
}): SyncConflict {
  return {
    id: input.id,
    operationId: input.operationId,
    entityType: input.entityType,
    entityId: input.entityId,
    field: input.field,
    localValue: input.localValue,
    remoteValue: input.remoteValue,
    status: "open",
    createdAt: input.createdAt,
  };
}

export function resolveConflictRecord(conflict: SyncConflict, resolution: ConflictResolution, resolvedAt: string): SyncConflict {
  return {
    ...conflict,
    status: resolution === "local" ? "resolved_local" : resolution === "remote" ? "resolved_remote" : "copied",
    resolvedAt,
    resolutionNote: conflictResolutionNote(resolution),
  };
}

export function conflictResolutionNote(resolution: ConflictResolution): string {
  if (resolution === "local") return "Kept the local field value and marked the remote operation acknowledged.";
  if (resolution === "remote") return "Accepted the cloud field value into the local workspace.";
  return "Created a local copy so both versions can continue independently.";
}
