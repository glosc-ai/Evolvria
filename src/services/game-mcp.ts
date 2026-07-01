import { createInitialPayload, validatePayloadSchema } from "@/domain/world";
import { saveAiCheckpoint } from "@/services/save";
import { nowIso } from "@/services/text";
import { buildWorldWorkspaceFiles } from "@/services/world-workspace";
import type { Character, SavePayload, WorldSeed } from "@/types/domain";

export interface GameMcpResult {
  status: "ok";
  summary: string;
  warnings: string[];
}

export interface WorkspaceFileReadResult extends GameMcpResult {
  path: string;
  content: string;
}

export interface WorkspaceFileEditResult extends GameMcpResult {
  path: string;
  content?: string;
  payload?: SavePayload;
  persisted: false;
}

export interface ModifyCharacterDataInput {
  character_id: string;
  updates: CharacterDataUpdates;
}

export interface CharacterDataUpdates {
  description?: string;
  personality?: string[];
  goals?: string[];
  secrets?: string[];
  current_location_id?: string;
  status?: string;
  traits?: string[];
  memory_summary?: string;
  player_notes?: string;
  appearance_description?: string;
  portrait_prompt?: string;
  portrait_image_url?: string;
  action_tendency?: string;
  companion?: boolean;
  visibility?: "met" | "heard" | "hidden";
}

export function gameMcpCapabilityManifest(): GameMcpResult & {
  server_script: string;
  permissions: Array<{ name: string; risk: "read" | "write" | "destructive"; scope: string }>;
} {
  return {
    status: "ok",
    summary: "Evolvria 游戏 MCP 已限制在世界工作区、schema v1 payload、存档备份和受控角色字段内。",
    warnings: ["不要把 Glosc token、settings.json 或任意系统路径交给 MCP。", "写入 state/payload.json 前必须通过 schema v1 校验。"],
    server_script: "scripts/evolvria-mcp.mjs",
    permissions: [
      { name: "read-workspace-file", risk: "read", scope: "active_world 工作区文件" },
      { name: "edit-workspace-file", risk: "write", scope: "active_world 文本文件和 state/payload.json" },
      { name: "backup-save", risk: "write", scope: "backups/ai_before_request 或 MCP 备份目录" },
      { name: "create-world", risk: "write", scope: "新的 schema v1 SavePayload" },
      { name: "modify-character-data", risk: "write", scope: "角色非姓名字段和玩家笔记" },
    ],
  };
}

export function createWorldViaGameMcp(seed: WorldSeed): SavePayload {
  return createInitialPayload(seed);
}

export async function backupSaveViaGameMcp(payload: SavePayload, reason = "AI MCP 操作前备份"): Promise<GameMcpResult & { backup_kind: "ai_checkpoint" }> {
  requirePayload(payload);
  await saveAiCheckpoint(payload);
  return {
    status: "ok",
    summary: `已创建 AI checkpoint 备份：${reason}`,
    warnings: [],
    backup_kind: "ai_checkpoint",
  };
}

export function listWorkspaceFilesViaGameMcp(payload: SavePayload): GameMcpResult & { files: string[] } {
  requirePayload(payload);
  return {
    status: "ok",
    summary: "已列出当前 payload 可生成的工作区文件。",
    warnings: [],
    files: buildWorldWorkspaceFiles(payload).map((file) => file.path),
  };
}

export function readWorkspaceFileViaGameMcp(payload: SavePayload, path: string): WorkspaceFileReadResult {
  requirePayload(payload);
  const normalized = normalizeWorkspacePath(path);
  const file = buildWorldWorkspaceFiles(payload).find((item) => item.path === normalized);
  if (!file) throw new Error(`工作区文件不存在或未加载：${normalized}`);
  return {
    status: "ok",
    summary: `已读取工作区文件：${normalized}`,
    warnings: normalized === "state/payload.json" ? ["state/payload.json 是权威机器状态，修改前必须备份并重新校验 schema v1。"] : [],
    path: normalized,
    content: file.content,
  };
}

export function editWorkspaceFileViaGameMcp(payload: SavePayload, path: string, content: string): WorkspaceFileEditResult {
  requirePayload(payload);
  const normalized = normalizeWorkspacePath(path);
  if (!isEditableTextWorkspacePath(normalized)) {
    throw new Error("只允许编辑工作区内的 Markdown、JSON 和文本文件。");
  }
  if (normalized === "state/payload.json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("state/payload.json 不是合法 JSON。");
    }
    if (!validatePayloadSchema(parsed)) throw new Error("state/payload.json 不符合 Evolvria schema v1。");
    return {
      status: "ok",
      summary: "payload JSON 已通过 schema v1 校验，可由调用方保存。",
      warnings: [],
      path: normalized,
      payload: parsed,
      persisted: false,
    };
  }
  return {
    status: "ok",
    summary: `已准备工作区文本文件编辑：${normalized}`,
    warnings: ["Markdown 工作区文件通常由 payload 派生；若要长期生效，请优先修改 state/payload.json 或使用专用数据 tool。"],
    path: normalized,
    content,
    persisted: false,
  };
}

export function modifyCharacterDataViaGameMcp(payload: SavePayload, input: ModifyCharacterDataInput): SavePayload {
  requirePayload(payload);
  const characterId = input.character_id.trim();
  if (!characterId) throw new Error("缺少 character_id。");
  const updates = input.updates;
  if (!updates || Object.keys(updates).length === 0) throw new Error("缺少角色更新字段。");
  const next = JSON.parse(JSON.stringify(payload)) as SavePayload;
  const character = next.characters.find((item) => item.id === characterId);
  if (!character) throw new Error(`角色不存在：${characterId}`);

  if (updates.current_location_id !== undefined && !next.locations.some((location) => location.id === updates.current_location_id)) {
    throw new Error(`角色目标地点不存在：${updates.current_location_id}`);
  }

  assignTrimmed(character, "description", updates.description);
  assignArray(character, "personality", updates.personality);
  assignArray(character, "goals", updates.goals);
  assignArray(character, "secrets", updates.secrets);
  assignTrimmed(character, "current_location_id", updates.current_location_id);
  assignTrimmed(character, "status", updates.status);
  assignArray(character, "traits", updates.traits);
  assignTrimmed(character, "memory_summary", updates.memory_summary);
  assignTrimmed(character, "appearance_description", updates.appearance_description);
  assignTrimmed(character, "portrait_prompt", updates.portrait_prompt);
  assignTrimmed(character, "action_tendency", updates.action_tendency);
  if (updates.companion !== undefined) character.companion = updates.companion;
  if (updates.visibility !== undefined) character.visibility = updates.visibility;
  if (updates.player_notes !== undefined) {
    character.player_notes = updates.player_notes.trim();
    character.player_notes_updated_at = nowIso();
  }
  if (updates.portrait_image_url !== undefined) {
    character.portrait_image_url = updates.portrait_image_url;
    character.portrait_updated_at = nowIso();
  }
  next.updated_at = nowIso();
  return next;
}

function requirePayload(payload: SavePayload): void {
  if (!validatePayloadSchema(payload)) throw new Error("缺少有效的 SavePayload，无法使用 Evolvria MCP 权限。");
}

function normalizeWorkspacePath(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) throw new Error("缺少工作区文件路径。");
  if (normalized.split("/").some((part) => part === ".." || part === "")) throw new Error("工作区路径不能包含空段或上级目录。");
  if (/^(settings\.json|\.env|secrets?\/)/i.test(normalized)) throw new Error("禁止通过游戏 MCP 读取或编辑密钥与设置文件。");
  return normalized;
}

function isEditableTextWorkspacePath(path: string): boolean {
  return /\.(md|markdown|json|txt)$/i.test(path) || path === "AGENTS.md";
}

function assignTrimmed<T extends keyof Character>(character: Character, key: T, value: string | undefined): void {
  if (value !== undefined) {
    (character as unknown as Record<string, unknown>)[key as string] = value.trim();
  }
}

function assignArray<T extends keyof Character>(character: Character, key: T, value: string[] | undefined): void {
  if (value !== undefined) {
    (character as unknown as Record<string, unknown>)[key as string] = value.map((item) => item.trim()).filter(Boolean);
  }
}
