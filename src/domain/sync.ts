import type { SaveEnvelope, SyncConflict, SyncOperation, SyncOperationEntity, SyncOperationKind, SyncSettings } from "@/types/domain";

export type ConflictResolution = "local" | "remote" | "copy";
export type SyncLogFormat = "evolvria_sync_operation_log";

export interface SyncDeviceSnapshot {
  workspaceId: string;
  workspaceName: string;
  deviceId: string;
  generatedAt: string;
  syncEnabled: boolean;
  syncStatus: SyncSettings["status"];
  endpoint?: string;
  lastSyncAt?: string;
  pendingOperationCount: number;
  openConflictCount: number;
  ackedOperationCount: number;
  failedOperationCount: number;
  latestOperationAt?: string;
  entityCounts: Record<string, number>;
  privacy: {
    includesWorkspaceContent: false;
    includesChats: false;
    includesApiKeys: false;
    note: string;
  };
}

export interface SyncOperationLogPackage {
  format: SyncLogFormat;
  schemaVersion: "1.0.0";
  workspaceId: string;
  workspaceName: string;
  exportedAt: string;
  deviceId: string;
  endpoint?: string;
  operations: SyncOperation[];
  conflicts: SyncConflict[];
  summary: {
    operationCount: number;
    conflictCount: number;
    queuedOperationCount: number;
    ackedOperationCount: number;
    openConflictCount: number;
    latestOperationAt?: string;
  };
  privacy: {
    includesApiKeys: false;
    mayIncludeEntityPatches: true;
    note: string;
  };
}

export interface SyncOperationLogImportResult {
  importedOperations: number;
  skippedOperations: number;
  importedConflicts: number;
  skippedConflicts: number;
}

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
  if (resolution === "local") return "已保留本地字段值，并将远端操作标记为已确认。";
  if (resolution === "remote") return "已接受云端字段值并写入本地工作区。";
  return "已创建本地副本，使两个版本可独立继续。";
}

export function buildSyncDeviceSnapshot(envelope: SaveEnvelope, generatedAt: string): SyncDeviceSnapshot {
  const operations = Object.values(envelope.entities.syncOperations);
  const latestOperationAt = latestSyncOperationAt(operations);
  return {
    workspaceId: envelope.workspace.id,
    workspaceName: envelope.workspace.name,
    deviceId: syncDeviceId(envelope),
    generatedAt,
    syncEnabled: envelope.settings.sync.enabled,
    syncStatus: envelope.settings.sync.status,
    endpoint: envelope.settings.sync.endpoint,
    lastSyncAt: envelope.settings.sync.lastSyncAt,
    pendingOperationCount: operations.filter((operation) =>
      operation.status === "queued" || operation.status === "pushed" || operation.status === "conflicted",
    ).length,
    openConflictCount: countOpenSyncConflicts(envelope),
    ackedOperationCount: operations.filter((operation) => operation.status === "acked").length,
    failedOperationCount: operations.filter((operation) => operation.status === "failed").length,
    latestOperationAt,
    entityCounts: Object.fromEntries(
      Object.entries(envelope.entities).map(([key, value]) => [key, Object.keys(value as Record<string, unknown>).length]),
    ),
    privacy: {
      includesWorkspaceContent: false,
      includesChats: false,
      includesApiKeys: false,
      note: "快照仅包含计数和同步元数据，并刻意排除玩家档案、聊天正文、媒体文件和提供方密钥。",
    },
  };
}

export function createSyncOperationLogPackage(envelope: SaveEnvelope, exportedAt: string): SyncOperationLogPackage {
  const operations = Object.values(envelope.entities.syncOperations).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const conflicts = Object.values(envelope.entities.syncConflicts).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return {
    format: "evolvria_sync_operation_log",
    schemaVersion: "1.0.0",
    workspaceId: envelope.workspace.id,
    workspaceName: envelope.workspace.name,
    exportedAt,
    deviceId: syncDeviceId(envelope),
    endpoint: envelope.settings.sync.endpoint,
    operations,
    conflicts,
    summary: {
      operationCount: operations.length,
      conflictCount: conflicts.length,
      queuedOperationCount: operations.filter((operation) => operation.status === "queued" || operation.status === "pushed").length,
      ackedOperationCount: operations.filter((operation) => operation.status === "acked").length,
      openConflictCount: conflicts.filter((conflict) => conflict.status === "open").length,
      latestOperationAt: latestSyncOperationAt(operations),
    },
    privacy: {
      includesApiKeys: false,
      mayIncludeEntityPatches: true,
      note: "操作补丁可包含标题或审核元数据，但绝不包含提供方 API key。请勿将其作为公开用户内容包。",
    },
  };
}

export function importSyncOperationLogPackage(
  envelope: SaveEnvelope,
  input: unknown,
  importedAt: string,
): SyncOperationLogImportResult {
  const operationLog = readSyncOperationLogPackage(input);
  if (operationLog.workspaceId !== envelope.workspace.id) {
    throw new Error("sync_log_workspace_mismatch");
  }

  let importedOperations = 0;
  let skippedOperations = 0;
  for (const operation of operationLog.operations) {
    if (envelope.entities.syncOperations[operation.id]) {
      skippedOperations += 1;
      continue;
    }
    envelope.entities.syncOperations[operation.id] = {
      ...operation,
      workspaceId: envelope.workspace.id,
    };
    importedOperations += 1;
  }

  let importedConflicts = 0;
  let skippedConflicts = 0;
  for (const conflict of operationLog.conflicts) {
    if (envelope.entities.syncConflicts[conflict.id]) {
      skippedConflicts += 1;
      continue;
    }
    envelope.entities.syncConflicts[conflict.id] = conflict;
    importedConflicts += 1;
  }

  envelope.settings.sync = {
    ...envelope.settings.sync,
    enabled: true,
    endpoint: envelope.settings.sync.endpoint ?? operationLog.endpoint,
    lastSyncAt: importedAt,
    status: countOpenSyncConflicts(envelope) ? "conflict" : "ready",
    conflictCount: countOpenSyncConflicts(envelope),
  };

  return {
    importedOperations,
    skippedOperations,
    importedConflicts,
    skippedConflicts,
  };
}

export function disableSyncRetainingLocalData(envelope: SaveEnvelope): SyncSettings {
  envelope.settings.sync = {
    ...envelope.settings.sync,
    enabled: false,
    status: "local_only",
    conflictCount: countOpenSyncConflicts(envelope),
  };
  return envelope.settings.sync;
}

function readSyncOperationLogPackage(input: unknown): SyncOperationLogPackage {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("sync_log_invalid");
  const record = input as Partial<SyncOperationLogPackage>;
  if (record.format !== "evolvria_sync_operation_log") throw new Error("sync_log_invalid_format");
  if (record.schemaVersion !== "1.0.0") throw new Error("sync_log_unsupported_schema");
  if (typeof record.workspaceId !== "string" || !record.workspaceId.trim()) throw new Error("sync_log_missing_workspace");
  if (!Array.isArray(record.operations)) throw new Error("sync_log_missing_operations");
  if (!Array.isArray(record.conflicts)) throw new Error("sync_log_missing_conflicts");
  return record as SyncOperationLogPackage;
}

function syncDeviceId(envelope: SaveEnvelope): string {
  return envelope.settings.cloudAccount?.id ?? "local-device";
}

function latestSyncOperationAt(operations: SyncOperation[]): string | undefined {
  return operations
    .map((operation) => operation.completedAt ?? operation.createdAt)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0];
}
