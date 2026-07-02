import type { Character, EntityStore, MediaAsset, SaveEnvelope, Scenario, Storyline } from "@/types/domain";

export type PackageIssueSeverity = "error" | "warning" | "info";

export interface PackageVerificationIssue {
  severity: PackageIssueSeverity;
  field: string;
  message: string;
}

export interface WorkspacePackageManifest {
  format: "evolvria_workspace_package";
  schemaVersion: SaveEnvelope["schemaVersion"];
  workspaceId: string;
  workspaceName: string;
  exportedAt: string;
  entityCounts: Record<keyof EntityStore, number>;
  assetRefs: {
    declared: string[];
    referenced: string[];
    missing: string[];
    browserOnly: string[];
  };
}

export interface BrowserWorkspacePackage {
  format: "evolvria_workspace_package";
  manifest: WorkspacePackageManifest;
  save: SaveEnvelope;
}

export interface PackageVerificationReport {
  ok: boolean;
  checkedAt: string;
  format: "evolvria_workspace_package" | "legacy_save_json" | "tauri_workspace_dir" | "unknown";
  workspaceId?: string;
  workspaceName?: string;
  schemaVersion?: string;
  entityCounts: Partial<Record<keyof EntityStore, number>>;
  assetRefs: WorkspacePackageManifest["assetRefs"];
  issues: PackageVerificationIssue[];
}

const entityKeys: Array<keyof EntityStore> = [
  "characters",
  "storylines",
  "scenarios",
  "mediaAssets",
  "personas",
  "chats",
  "chatCheckpoints",
  "messages",
  "summaryChapters",
  "arcs",
  "dungeonMindConfigs",
  "fateChecks",
  "creditLedger",
  "creditAdjustments",
  "moderationCases",
  "creatorEarnings",
  "creatorPayoutRequests",
  "engagementStats",
  "syncOperations",
  "syncConflicts",
];

export function createWorkspacePackage(envelope: SaveEnvelope, exportedAt = new Date().toISOString()): BrowserWorkspacePackage {
  const manifest = createWorkspacePackageManifest(envelope, exportedAt);
  return {
    format: "evolvria_workspace_package",
    manifest,
    save: envelope,
  };
}

export function createStorylineWorkspacePackage(envelope: SaveEnvelope, storylineId: string, exportedAt = new Date().toISOString()): BrowserWorkspacePackage {
  return createWorkspacePackage(createStorylinePackageEnvelope(envelope, storylineId), exportedAt);
}

export function createStorylinePackageEnvelope(envelope: SaveEnvelope, storylineId: string): SaveEnvelope {
  const storyline = envelope.entities.storylines[storylineId];
  if (!storyline) throw new Error("storyline_not_found");
  const characterIds = new Set(storyline.cast.map((cast) => cast.characterId));
  const scenarioIds = new Set(storyline.scenarioIds);
  const mediaIds = new Set(storyline.mediaIds);
  const characters = Object.fromEntries(
    [...characterIds]
      .map((id) => envelope.entities.characters[id])
      .filter((character): character is Character => Boolean(character))
      .map((character) => {
        for (const mediaId of character.mediaIds) mediaIds.add(mediaId);
        if (character.voice.referenceAssetId) mediaIds.add(character.voice.referenceAssetId);
        return [character.id, character];
      }),
  );
  const scenarios = Object.fromEntries(
    [...scenarioIds]
      .map((id) => envelope.entities.scenarios[id])
      .filter((scenario): scenario is Scenario => Boolean(scenario))
      .map((scenario) => [scenario.id, scenario]),
  );
  const mediaAssets = Object.fromEntries(
    [...mediaIds]
      .map((id) => envelope.entities.mediaAssets[id])
      .filter((asset): asset is MediaAsset => Boolean(asset))
      .map((asset) => [asset.id, asset]),
  );
  const dungeonMindConfigs = storyline.dungeonMindConfigId && envelope.entities.dungeonMindConfigs[storyline.dungeonMindConfigId]
    ? { [storyline.dungeonMindConfigId]: envelope.entities.dungeonMindConfigs[storyline.dungeonMindConfigId] }
    : {};
  const entities: SaveEnvelope["entities"] = {
    characters,
    storylines: { [storyline.id]: storyline },
    scenarios,
    mediaAssets,
    personas: {},
    chats: {},
    chatCheckpoints: {},
    messages: {},
    summaryChapters: {},
    arcs: {},
    dungeonMindConfigs,
    fateChecks: {},
    creditLedger: {},
    creditAdjustments: {},
    moderationCases: {},
    creatorEarnings: {},
    creatorPayoutRequests: {},
    engagementStats: {},
    mediaGenerationJobs: {},
    syncOperations: {},
    syncConflicts: {},
  };
  return {
    ...envelope,
    workspace: {
      ...envelope.workspace,
      id: `${envelope.workspace.id}_${storyline.id}_package`,
      name: `${storyline.title} 内容包`,
    },
    entities,
  };
}

export function createWorkspacePackageManifest(envelope: SaveEnvelope, exportedAt = new Date().toISOString()): WorkspacePackageManifest {
  const assetRefs = collectAssetRefs(envelope);
  return {
    format: "evolvria_workspace_package",
    schemaVersion: envelope.schemaVersion,
    workspaceId: envelope.workspace.id,
    workspaceName: envelope.workspace.name,
    exportedAt,
    entityCounts: countEntities(envelope.entities) as Record<keyof EntityStore, number>,
    assetRefs,
  };
}

export function readWorkspacePackage(value: unknown): {
  envelope?: SaveEnvelope;
  manifest?: WorkspacePackageManifest;
  format: PackageVerificationReport["format"];
} {
  if (isRecord(value) && value.format === "evolvria_workspace_package" && isRecord(value.save)) {
    return {
      envelope: value.save as unknown as SaveEnvelope,
      manifest: isRecord(value.manifest) ? value.manifest as unknown as WorkspacePackageManifest : undefined,
      format: "evolvria_workspace_package",
    };
  }
  if (isRecord(value) && isRecord(value.workspace) && isRecord(value.entities)) {
    return {
      envelope: value as unknown as SaveEnvelope,
      format: "legacy_save_json",
    };
  }
  return { format: "unknown" };
}

export function verifyWorkspacePackage(input: SaveEnvelope | BrowserWorkspacePackage): PackageVerificationReport {
  const packageInput = readWorkspacePackage(input);
  const envelope = packageInput.envelope ?? input as SaveEnvelope;
  const manifest = packageInput.manifest;
  const format = packageInput.format === "unknown" && isSaveEnvelopeLike(envelope) ? "legacy_save_json" : packageInput.format;
  const issues: PackageVerificationIssue[] = [];

  if (!isSaveEnvelopeLike(envelope)) {
    issues.push({ severity: "error", field: "save", message: "内容包不包含可读取的存档信封。" });
    return emptyReport(format, issues);
  }

  if (envelope.schemaVersion !== "1.0.0") {
    issues.push({ severity: "error", field: "schemaVersion", message: `不支持的 schema 版本：${String(envelope.schemaVersion)}。` });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(envelope.workspace.id)) {
    issues.push({ severity: "error", field: "workspace.id", message: "工作区 ID 必须是安全的单段路径。" });
  }

  const entityCounts = countEntities(envelope.entities);
  for (const key of entityKeys) {
    if (!isRecord(envelope.entities[key])) {
      issues.push({ severity: "error", field: `entities.${key}`, message: `${key} 必须是对象映射。` });
    }
  }

  const assetRefs = collectAssetRefs(envelope);
  for (const id of assetRefs.missing) {
    issues.push({ severity: "error", field: `assets.${id}`, message: `被引用的媒体素材 ${id} 不存在于 mediaAssets。` });
  }
  for (const asset of Object.values(envelope.entities.mediaAssets ?? {})) {
    for (const issue of verifyAsset(asset)) issues.push(issue);
  }
  for (const id of assetRefs.browserOnly) {
    issues.push({ severity: "warning", field: `assets.${id}`, message: `浏览器临时素材 ${id} 需要在 Tauri 应用中重新导入后才可移植。` });
  }

  if (manifest) {
    if (manifest.schemaVersion !== envelope.schemaVersion) {
      issues.push({ severity: "error", field: "manifest.schemaVersion", message: "清单 schemaVersion 与 save.json 不匹配。" });
    }
    if (manifest.workspaceId !== envelope.workspace.id) {
      issues.push({ severity: "error", field: "manifest.workspaceId", message: "清单 workspaceId 与 save.json 不匹配。" });
    }
    const manifestMissing = manifest.assetRefs?.missing ?? [];
    if (manifestMissing.length) {
      issues.push({ severity: "error", field: "manifest.assetRefs.missing", message: "清单导出时存在缺失的素材引用。" });
    }
  } else if (format === "evolvria_workspace_package") {
    issues.push({ severity: "error", field: "manifest", message: "内容包缺少清单。" });
  } else {
    issues.push({ severity: "info", field: "manifest", message: "旧版 JSON 导入没有清单；下次导出时会自动升级。" });
  }

  if (secretPattern.test(JSON.stringify(envelope))) {
    issues.push({ severity: "error", field: "secrets", message: "内容包似乎包含 API key 或 bearer token。" });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    checkedAt: new Date().toISOString(),
    format,
    workspaceId: envelope.workspace.id,
    workspaceName: envelope.workspace.name,
    schemaVersion: envelope.schemaVersion,
    entityCounts,
    assetRefs,
    issues,
  };
}

function emptyReport(format: PackageVerificationReport["format"], issues: PackageVerificationIssue[]): PackageVerificationReport {
  return {
    ok: false,
    checkedAt: new Date().toISOString(),
    format,
    entityCounts: {},
    assetRefs: { declared: [], referenced: [], missing: [], browserOnly: [] },
    issues,
  };
}

function countEntities(entities: EntityStore): Partial<Record<keyof EntityStore, number>> {
  const counts: Partial<Record<keyof EntityStore, number>> = {};
  for (const key of entityKeys) {
    counts[key] = Object.keys(entities[key] ?? {}).length;
  }
  return counts;
}

function collectAssetRefs(envelope: SaveEnvelope): WorkspacePackageManifest["assetRefs"] {
  const declared = new Set(Object.keys(envelope.entities.mediaAssets ?? {}));
  const referenced = new Set<string>();

  for (const story of Object.values(envelope.entities.storylines ?? {})) {
    for (const id of story.mediaIds ?? []) referenced.add(id);
  }
  for (const character of Object.values(envelope.entities.characters ?? {})) {
    for (const id of character.mediaIds ?? []) referenced.add(id);
  }
  for (const message of Object.values(envelope.entities.messages ?? {})) {
    for (const hint of message.sceneHints ?? []) {
      if (hint.backgroundAssetId) referenced.add(hint.backgroundAssetId);
      if (hint.musicAssetId) referenced.add(hint.musicAssetId);
      for (const sprite of hint.characterSprites ?? []) {
        if (sprite.mediaAssetId) referenced.add(sprite.mediaAssetId);
      }
      for (const voice of hint.voice ?? []) {
        if (voice.assetId) referenced.add(voice.assetId);
      }
    }
  }

  const missing = [...referenced].filter((id) => !declared.has(id)).sort();
  const browserOnly = Object.values(envelope.entities.mediaAssets ?? {})
    .filter((asset) => asset.relativePath.startsWith("browser://"))
    .map((asset) => asset.id)
    .sort();

  return {
    declared: [...declared].sort(),
    referenced: [...referenced].sort(),
    missing,
    browserOnly,
  };
}

function verifyAsset(asset: MediaAsset): PackageVerificationIssue[] {
  const issues: PackageVerificationIssue[] = [];
  if (!asset.relativePath.trim()) {
    issues.push({
      severity: asset.source.kind === "placeholder" && asset.sizeBytes === 0 ? "warning" : "error",
      field: `assets.${asset.id}.relativePath`,
      message: asset.source.kind === "placeholder" ? "占位素材在内容包中没有实体文件。" : "素材 relativePath 为必填。",
    });
  }
  if (asset.relativePath.startsWith("/") || asset.relativePath.includes("..")) {
    issues.push({ severity: "error", field: `assets.${asset.id}.relativePath`, message: "素材 relativePath 必须位于工作区内容包内。" });
  }
  if (asset.relativePath && !asset.relativePath.startsWith("assets/") && !asset.relativePath.startsWith("browser://")) {
    issues.push({ severity: "warning", field: `assets.${asset.id}.relativePath`, message: "为保证内容包可移植，素材路径应位于 assets/ 下。" });
  }
  if (!asset.mimeType.trim()) {
    issues.push({ severity: "error", field: `assets.${asset.id}.mimeType`, message: "素材 MIME type 为必填。" });
  }
  if (!asset.altText.trim()) {
    issues.push({ severity: "warning", field: `assets.${asset.id}.altText`, message: "素材缺少替代文本。" });
  }
  return issues;
}

function isSaveEnvelopeLike(value: unknown): value is SaveEnvelope {
  return isRecord(value) && isRecord(value.workspace) && isRecord(value.entities) && typeof value.schemaVersion === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const secretPattern = /\b(sk-[a-zA-Z0-9_-]{12,}|OPENAI_API_KEY|Bearer\s+[a-zA-Z0-9._-]{12,})\b/;
