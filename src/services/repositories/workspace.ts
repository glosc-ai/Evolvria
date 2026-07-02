import { buildIndexes, createSeedEnvelope } from "@/domain/fixtures";
import { createWorkspacePackage } from "@/domain/package-verification";
import { invokeOptional } from "@/services/tauri";
import type { PackageVerificationReport } from "@/domain/package-verification";
import type { SaveEnvelope, WorkspaceMeta } from "@/types/domain";

const storageKey = "evolvria:workspace:active";
const secretPrefix = "evolvria:secret:";
const backupPrefix = "evolvria:workspace:backup:";

export interface SecretWriteResult {
  backend: "keychain" | "file_fallback" | "browser_local_storage";
  warning?: string;
}

export interface SecretDeleteResult {
  backend: "keychain" | "file_fallback" | "keychain_and_file" | "browser_local_storage" | "none";
  deleted: boolean;
  warning?: string;
}

export interface BackupMeta {
  id: string;
  workspaceId: string;
  reason: string;
  createdAt: string;
  path?: string;
  sizeBytes?: number;
}

export interface ExportResult {
  path: string;
  cancelled?: boolean;
  report?: PackageVerificationReport;
}

export async function loadWorkspace(): Promise<SaveEnvelope> {
  const metas = await invokeOptional<WorkspaceMeta[]>("workspace_list");
  if (metas?.length) {
    const latest = [...metas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const envelope = await invokeOptional<SaveEnvelope>("workspace_read", { workspaceId: latest.id });
    if (envelope) return normalizeEnvelope(envelope);
  }

  const local = localStorage.getItem(storageKey);
  if (local) {
    return normalizeEnvelope(JSON.parse(local) as SaveEnvelope);
  }

  const seed = createSeedEnvelope();
  await saveWorkspace(seed);
  return seed;
}

export async function saveWorkspace(envelope: SaveEnvelope): Promise<WorkspaceMeta> {
  const normalized = normalizeEnvelope(envelope);
  const meta = await invokeOptional<WorkspaceMeta>("workspace_write", {
    workspaceId: normalized.workspace.id,
    envelope: normalized,
  });
  if (!meta) {
    localStorage.setItem(storageKey, JSON.stringify(normalized));
  }
  return meta ?? {
    id: normalized.workspace.id,
    name: normalized.workspace.name,
    description: normalized.workspace.description,
    updatedAt: normalized.workspace.updatedAt,
    schemaVersion: normalized.schemaVersion,
  };
}

export async function backupWorkspace(envelope: SaveEnvelope, reason: string): Promise<BackupMeta> {
  const meta = await invokeOptional<BackupMeta>("workspace_backup", { workspaceId: envelope.workspace.id, reason });
  if (meta) return meta;

  const backupId = createBrowserBackupId(envelope.workspace.id);
  const fallback = {
    id: backupId,
    workspaceId: envelope.workspace.id,
    reason,
    createdAt: new Date().toISOString(),
    path: `browser_local_storage:${backupId}`,
    sizeBytes: JSON.stringify(envelope).length,
  };
  localStorage.setItem(backupStorageKey(envelope.workspace.id, backupId), JSON.stringify({
    meta: fallback,
    envelope,
  }));
  return fallback;
}

export async function listWorkspaceBackups(workspaceId: string): Promise<BackupMeta[]> {
  const native = await invokeOptional<BackupMeta[]>("workspace_list_backups", { workspaceId });
  if (native) return native;

  const prefix = backupStorageKey(workspaceId);
  const backups: BackupMeta[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "{}") as { meta?: BackupMeta };
      if (parsed.meta) backups.push(parsed.meta);
    } catch {
      // Ignore malformed browser-preview backup entries instead of blocking recovery.
    }
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreWorkspaceBackup(currentEnvelope: SaveEnvelope, backupId: string): Promise<SaveEnvelope> {
  const restored = await invokeOptional<SaveEnvelope>("workspace_restore_backup", {
    workspaceId: currentEnvelope.workspace.id,
    backupId,
  });
  if (restored) return normalizeEnvelope(restored);

  const raw = localStorage.getItem(backupStorageKey(currentEnvelope.workspace.id, backupId));
  if (!raw) throw new Error("backup_not_found");
  await backupWorkspace(currentEnvelope, "pre_restore");
  const parsed = JSON.parse(raw) as { envelope?: SaveEnvelope };
  if (!parsed.envelope) throw new Error("backup_invalid");
  const normalized = normalizeEnvelope(parsed.envelope);
  if (normalized.workspace.id !== currentEnvelope.workspace.id) throw new Error("backup_workspace_mismatch");
  await saveWorkspace(normalized);
  return normalized;
}

export async function exportWorkspace(envelope: SaveEnvelope): Promise<ExportResult> {
  const result = await invokeOptional<ExportResult>("workspace_export_zip", { workspaceId: envelope.workspace.id });
  if (result) return result;

  const workspacePackage = createWorkspacePackage(envelope);
  const blob = new Blob([JSON.stringify(workspacePackage, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${envelope.workspace.name.replace(/[^\w-]+/g, "-")}.evolvria.json`;
  link.click();
  URL.revokeObjectURL(url);
  return { path: link.download, cancelled: false };
}

export async function importWorkspaceZip(file: File): Promise<SaveEnvelope> {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const meta = await invokeOptional<WorkspaceMeta>("workspace_import_zip_bytes", { bytes });
  if (!meta) {
    throw new Error("zip_import_requires_tauri");
  }
  const envelope = await invokeOptional<SaveEnvelope>("workspace_read", { workspaceId: meta.id });
  if (!envelope) {
    throw new Error("zip_import_read_failed");
  }
  return normalizeEnvelope(envelope);
}

export async function verifyWorkspacePackageNative(workspaceId: string): Promise<PackageVerificationReport | undefined> {
  return invokeOptional<PackageVerificationReport>("content_package_verify", { workspaceId });
}

export async function resetWorkspace(): Promise<SaveEnvelope> {
  const seed = createSeedEnvelope();
  await saveWorkspace(seed);
  return seed;
}

export async function saveSecret(key: string, value: string): Promise<SecretWriteResult> {
  const result = await invokeOptional<SecretWriteResult>("secret_set", { key, value });
  if (result === undefined) {
    localStorage.setItem(`${secretPrefix}${key}`, value);
    return {
      backend: "browser_local_storage",
      warning: "Browser preview stores provider keys in localStorage. Use the Tauri app for system keychain storage.",
    };
  }
  return result;
}

export async function getSecret(key: string): Promise<string | undefined> {
  const result = await invokeOptional<string | null>("secret_get", { key });
  if (result !== undefined) return result ?? undefined;
  return localStorage.getItem(`${secretPrefix}${key}`) ?? undefined;
}

export async function deleteSecret(key: string): Promise<SecretDeleteResult> {
  const result = await invokeOptional<SecretDeleteResult>("secret_delete", { key });
  if (result !== undefined) return result;
  const browserKey = `${secretPrefix}${key}`;
  const deleted = localStorage.getItem(browserKey) !== null;
  localStorage.removeItem(browserKey);
  return {
    backend: "browser_local_storage",
    deleted,
    warning: "Browser preview provider key was cleared from localStorage. Tauri desktop keys live in the system keychain.",
  };
}

export function normalizeEnvelope(envelope: SaveEnvelope): SaveEnvelope {
  const seed = createSeedEnvelope();
  const entities = {
    ...seed.entities,
    ...envelope.entities,
    chatCheckpoints: envelope.entities.chatCheckpoints ?? {},
    fateChecks: envelope.entities.fateChecks ?? {},
    creditLedger: Object.fromEntries(
      Object.entries(envelope.entities.creditLedger ?? {}).map(([id, entry]) => [
        id,
        {
          ...entry,
          status: entry.status ?? "estimated",
          adjustmentIds: entry.adjustmentIds ?? [],
        },
      ]),
    ),
    creditAdjustments: envelope.entities.creditAdjustments ?? {},
    creatorEarnings: envelope.entities.creatorEarnings ?? {},
    mediaGenerationJobs: envelope.entities.mediaGenerationJobs ?? {},
    syncOperations: envelope.entities.syncOperations ?? {},
    syncConflicts: envelope.entities.syncConflicts ?? {},
  };
  const settings = {
    ...seed.settings,
    ...envelope.settings,
    provider: {
      ...seed.settings.provider,
      ...envelope.settings.provider,
    },
    budget: {
      ...seed.settings.budget,
      ...envelope.settings.budget,
    },
    sync: {
      ...seed.settings.sync,
      ...envelope.settings.sync,
    },
  };
  return {
    ...envelope,
    schemaVersion: "1.0.0",
    entities,
    settings,
    indexes: buildIndexes(entities),
  };
}

function backupStorageKey(workspaceId: string, backupId = ""): string {
  return `${backupPrefix}${workspaceId}:${backupId}`;
}

function createBrowserBackupId(workspaceId: string): string {
  const base = `backup_${Date.now().toString(36)}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = attempt === 0 ? base : `${base}_${attempt}`;
    if (!localStorage.getItem(backupStorageKey(workspaceId, id))) return id;
  }
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}
