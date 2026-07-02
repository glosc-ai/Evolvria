import { buildIndexes, createSeedEnvelope } from "@/domain/fixtures";
import { createWorkspacePackage, createWorkspacePackageManifest } from "@/domain/package-verification";
import { invokeOptional } from "@/services/tauri";
import type { PackageVerificationReport } from "@/domain/package-verification";
import type { Message, SaveEnvelope, WorkspaceMeta } from "@/types/domain";

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
  hasSqliteIndex?: boolean;
  sqlitePath?: string;
  sqliteSizeBytes?: number;
}

export interface ExportResult {
  path: string;
  cancelled?: boolean;
  report?: PackageVerificationReport;
}

export interface SQLiteIndexReport {
  workspaceId: string;
  path: string;
  indexedAt: string;
  itemCount: number;
  messageCount: number;
  sourceUpdatedAt?: string;
}

export interface SQLiteSearchHit {
  entityType: "storyline" | "character" | "scenario" | "media" | "message" | string;
  entityId: string;
  title: string;
  snippet: string;
  updatedAt?: string;
}

export interface SQLiteMessagePage {
  chatId: string;
  totalCount: number;
  offsetFromEnd: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
  hasOlder: boolean;
  hasNewer: boolean;
  nextOffsetFromEnd: number;
  messages: Message[];
}

export interface AssetInventoryStats {
  declaredAssets: number;
  referencedAssets: number;
  unreferencedAssets: number;
  browserOnlyAssets: number;
  missingPhysicalAssets: number;
  physicalFiles: number;
  untrackedFiles: number;
  declaredBytes: number;
  physicalBytes: number;
  untrackedBytes: number;
}

export interface AssetInventoryItem {
  id: string;
  kind: string;
  purpose: string;
  relativePath: string;
  sourceKind: string;
  referenced: boolean;
  physicalStatus: "present" | "missing" | "browser_only" | "placeholder" | "invalid_path" | "unknown" | string;
  declaredSizeBytes: number;
  physicalSizeBytes?: number;
  variantCount: number;
}

export interface PhysicalAssetFile {
  relativePath: string;
  sizeBytes: number;
  folder: string;
  supported: boolean;
  tracked: boolean;
  assetId?: string;
}

export interface WorkspaceAssetInventory {
  workspaceId: string;
  checkedAt: string;
  rootPath: string;
  stats: AssetInventoryStats;
  byFolder: Record<string, number>;
  assets: AssetInventoryItem[];
  untrackedFiles: PhysicalAssetFile[];
  missingAssetIds: string[];
}

export type AssetMaintenanceActionKind =
  | "restore_missing_asset"
  | "reimport_browser_asset"
  | "replace_placeholder_asset"
  | "review_unreferenced_asset"
  | "import_or_remove_untracked_file"
  | "compress_large_asset";

export type AssetMaintenanceSeverity = "error" | "warning" | "info";

export interface AssetMaintenanceAction {
  id: string;
  kind: AssetMaintenanceActionKind;
  severity: AssetMaintenanceSeverity;
  title: string;
  detail: string;
  assetId?: string;
  relativePath?: string;
  estimatedRecoverableBytes: number;
  publishBlocker: boolean;
}

export interface AssetMaintenancePlan {
  workspaceId: string;
  generatedAt: string;
  sourceCheckedAt: string;
  summary: {
    totalActions: number;
    publishBlockers: number;
    cleanupCandidates: number;
    compressionCandidates: number;
    estimatedRecoverableBytes: number;
  };
  actions: AssetMaintenanceAction[];
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
    hasSqliteIndex: false,
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

export async function rebuildNativeSearchIndex(workspaceId: string): Promise<SQLiteIndexReport | undefined> {
  return invokeOptional<SQLiteIndexReport>("workspace_rebuild_sqlite_index", { workspaceId });
}

export async function searchNativeSearchIndex(workspaceId: string, query: string, limit = 8): Promise<SQLiteSearchHit[] | undefined> {
  return invokeOptional<SQLiteSearchHit[]>("workspace_search_sqlite_index", { workspaceId, query, limit });
}

export async function queryNativeMessagePage(workspaceId: string, chatId: string, pageSize = 80, offsetFromEnd = 0): Promise<SQLiteMessagePage | undefined> {
  return invokeOptional<SQLiteMessagePage>("workspace_query_sqlite_messages", { workspaceId, chatId, pageSize, offsetFromEnd });
}

export async function getNativeAssetInventory(workspaceId: string): Promise<WorkspaceAssetInventory | undefined> {
  return invokeOptional<WorkspaceAssetInventory>("workspace_asset_inventory", { workspaceId });
}

export function buildBrowserAssetInventory(envelope: SaveEnvelope): WorkspaceAssetInventory {
  const manifest = createWorkspacePackageManifest(envelope);
  const referenced = new Set(manifest.assetRefs.referenced);
  const assets = Object.values(envelope.entities.mediaAssets).map((asset) => {
    const browserOnly = asset.relativePath.startsWith("browser://");
    const placeholder = !asset.relativePath.trim() && asset.source.kind === "placeholder" && asset.sizeBytes === 0;
    return {
      id: asset.id,
      kind: asset.kind,
      purpose: asset.purpose,
      relativePath: asset.relativePath,
      sourceKind: asset.source.kind,
      referenced: referenced.has(asset.id),
      physicalStatus: browserOnly ? "browser_only" : placeholder ? "placeholder" : "unknown",
      declaredSizeBytes: asset.sizeBytes,
      physicalSizeBytes: undefined,
      variantCount: asset.variants.length,
    } satisfies AssetInventoryItem;
  }).sort((a, b) => a.physicalStatus.localeCompare(b.physicalStatus) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const declaredBytes = assets.reduce((sum, asset) => sum + asset.declaredSizeBytes, 0);
  const browserOnlyAssets = assets.filter((asset) => asset.physicalStatus === "browser_only").length;
  return {
    workspaceId: envelope.workspace.id,
    checkedAt: new Date().toISOString(),
    rootPath: "browser_local_storage",
    stats: {
      declaredAssets: assets.length,
      referencedAssets: assets.filter((asset) => asset.referenced).length,
      unreferencedAssets: assets.filter((asset) => !asset.referenced).length,
      browserOnlyAssets,
      missingPhysicalAssets: 0,
      physicalFiles: 0,
      untrackedFiles: 0,
      declaredBytes,
      physicalBytes: 0,
      untrackedBytes: 0,
    },
    byFolder: {},
    assets,
    untrackedFiles: [],
    missingAssetIds: [...manifest.assetRefs.missing],
  };
}

export function buildBrowserMessagePage(envelope: SaveEnvelope, chatId: string, pageSize = 80, offsetFromEnd = 0): SQLiteMessagePage {
  const chat = envelope.entities.chats[chatId];
  const allMessages = chat
    ? chat.messageIds.map((id) => envelope.entities.messages[id]).filter((message): message is Message => Boolean(message))
    : [];
  const safePageSize = Math.min(200, Math.max(1, Math.round(pageSize)));
  const safeOffset = Math.min(allMessages.length, Math.max(0, Math.round(offsetFromEnd)));
  const endIndex = Math.max(0, allMessages.length - safeOffset);
  const startIndex = Math.max(0, endIndex - safePageSize);
  return {
    chatId,
    totalCount: allMessages.length,
    offsetFromEnd: safeOffset,
    pageSize: safePageSize,
    startIndex,
    endIndex,
    hasOlder: startIndex > 0,
    hasNewer: safeOffset > 0,
    nextOffsetFromEnd: Math.min(allMessages.length, safeOffset + (endIndex - startIndex)),
    messages: allMessages.slice(startIndex, endIndex),
  };
}

export function buildAssetMaintenancePlan(inventory: WorkspaceAssetInventory, largeAssetBytes = 25 * 1024 * 1024): AssetMaintenancePlan {
  const actions: AssetMaintenanceAction[] = [];

  for (const asset of inventory.assets) {
    if (asset.physicalStatus === "missing" || asset.physicalStatus === "invalid_path") {
      actions.push({
        id: `restore:${asset.id}`,
        kind: "restore_missing_asset",
        severity: "error",
        title: `Restore missing asset ${asset.id}`,
        detail: `${asset.relativePath || "empty path"} is declared in workspace metadata but is not available as a portable asset file.`,
        assetId: asset.id,
        relativePath: asset.relativePath,
        estimatedRecoverableBytes: 0,
        publishBlocker: true,
      });
    }

    if (asset.physicalStatus === "browser_only") {
      actions.push({
        id: `reimport:${asset.id}`,
        kind: "reimport_browser_asset",
        severity: "warning",
        title: `Reimport browser-only asset ${asset.id}`,
        detail: `${asset.relativePath} is only a browser preview reference. Reimport it in the Tauri app before publishing or packaging.`,
        assetId: asset.id,
        relativePath: asset.relativePath,
        estimatedRecoverableBytes: 0,
        publishBlocker: true,
      });
    }

    if (asset.physicalStatus === "placeholder" && asset.referenced) {
      actions.push({
        id: `placeholder:${asset.id}`,
        kind: "replace_placeholder_asset",
        severity: "warning",
        title: `Replace placeholder asset ${asset.id}`,
        detail: "Referenced placeholder covers are acceptable for MVP demos but should be replaced before a polished public package.",
        assetId: asset.id,
        relativePath: asset.relativePath,
        estimatedRecoverableBytes: 0,
        publishBlocker: false,
      });
    }

    if (!asset.referenced) {
      actions.push({
        id: `unreferenced:${asset.id}`,
        kind: "review_unreferenced_asset",
        severity: "info",
        title: `Review unreferenced asset ${asset.id}`,
        detail: "The asset is declared but not referenced by Storyline, Character, or SceneHint data. Keep it only if it is a draft reserve.",
        assetId: asset.id,
        relativePath: asset.relativePath,
        estimatedRecoverableBytes: asset.physicalSizeBytes ?? asset.declaredSizeBytes,
        publishBlocker: false,
      });
    }

    const sizeBytes = asset.physicalSizeBytes ?? asset.declaredSizeBytes;
    if (asset.physicalStatus === "present" && sizeBytes >= largeAssetBytes) {
      actions.push({
        id: `compress:${asset.id}`,
        kind: "compress_large_asset",
        severity: "info",
        title: `Compress large asset ${asset.id}`,
        detail: `${asset.relativePath} is ${formatBytesForPlan(sizeBytes)}. Consider thumbnail, preview, or lower bitrate variants before publishing.`,
        assetId: asset.id,
        relativePath: asset.relativePath,
        estimatedRecoverableBytes: Math.round(sizeBytes * 0.3),
        publishBlocker: false,
      });
    }
  }

  for (const file of inventory.untrackedFiles) {
    actions.push({
      id: `untracked:${file.relativePath}`,
      kind: "import_or_remove_untracked_file",
      severity: file.supported ? "warning" : "info",
      title: `Review untracked file ${file.relativePath}`,
      detail: file.supported
        ? "This file is inside assets/ but is not connected to any MediaAsset metadata. Import it or remove it from the package."
        : "This unsupported file is inside assets/ but is not package-tracked. Remove it unless it is intentionally reserved.",
      relativePath: file.relativePath,
      estimatedRecoverableBytes: file.sizeBytes,
      publishBlocker: false,
    });
  }

  actions.sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity)
    || Number(b.publishBlocker) - Number(a.publishBlocker)
    || b.estimatedRecoverableBytes - a.estimatedRecoverableBytes
    || a.id.localeCompare(b.id),
  );

  return {
    workspaceId: inventory.workspaceId,
    generatedAt: new Date().toISOString(),
    sourceCheckedAt: inventory.checkedAt,
    summary: {
      totalActions: actions.length,
      publishBlockers: actions.filter((action) => action.publishBlocker).length,
      cleanupCandidates: actions.filter((action) => action.kind === "review_unreferenced_asset" || action.kind === "import_or_remove_untracked_file").length,
      compressionCandidates: actions.filter((action) => action.kind === "compress_large_asset").length,
      estimatedRecoverableBytes: actions.reduce((sum, action) => sum + action.estimatedRecoverableBytes, 0),
    },
    actions,
  };
}

function severityRank(severity: AssetMaintenanceSeverity): number {
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}

function formatBytesForPlan(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
    creatorPayoutRequests: envelope.entities.creatorPayoutRequests ?? {},
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
