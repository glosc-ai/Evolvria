import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { mockPlayerAction } from "@/domain/fixtures";
import { addEvent, createInitialPayload, recordAiLog, validatePayloadSchema } from "@/domain/world";
import {
  backupSaveViaGameMcp,
  createWorldViaGameMcp,
  editWorkspaceFileViaGameMcp,
  gameMcpCapabilityManifest,
  listWorkspaceFilesViaGameMcp,
  modifyCharacterDataViaGameMcp,
  readWorkspaceFileViaGameMcp,
} from "@/services/game-mcp";
import { makeId } from "@/services/ids";
import { splitTags } from "@/services/text";
import type { AIUsage, AIPurpose, Character, PlayerActionResult, SavePayload, World, WorldSeed, WorldTime } from "@/types/domain";

export type EvolvriaSkillName = string;
type EvolvriaSkillToolName = string;

const worldSeedSchema: z.ZodType<WorldSeed> = z.object({
  world_name: z.string(),
  genre: z.string(),
  tone: z.string(),
  limits: z.string(),
  narrative_detail: z.string(),
  npc_autonomy_frequency: z.string(),
  hero: z.object({
    name: z.string(),
    gender: z.string(),
    description: z.string(),
    goal: z.string(),
    ability: z.string(),
    weakness: z.string(),
    appearance_description: z.string().optional(),
  }),
  key_characters: z.array(
    z.object({
      name: z.string(),
      gender: z.string(),
      role: z.string(),
      relationship: z.string(),
      personality: z.string(),
      goal: z.string(),
      secret: z.string(),
      action_tendency: z.string(),
      description: z.string(),
      appearance_description: z.string().optional(),
    }),
  ),
});

// Tool input schemas must be representable as JSON Schema for the AI SDK.
// The actual SavePayload check still happens at execution time in requirePayload().
const payloadSchema = z.unknown();
const worldTimeSchema: z.ZodType<WorldTime> = z.object({
  day: z.number(),
  hour: z.number(),
  calendar_label: z.string().optional(),
});
const usageSchema: z.ZodType<AIUsage> = z.object({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  total_tokens: z.number().optional(),
  cost_estimate: z.number().nullable().optional(),
});

const eventInputSchema = z.object({
  type: z.string().default("world_event"),
  title: z.string(),
  description: z.string(),
  world_time: worldTimeSchema.optional(),
  location_id: z.string().optional(),
  participant_ids: z.array(z.string()).default([]),
  cause_event_ids: z.array(z.string()).default([]),
  effects: z.array(z.string()).default([]),
  importance: z.number().min(0).max(1).default(0.5),
  visibility: z.string().default("known_to_player"),
  outcome: z.string().optional(),
  outcome_reason: z.string().optional(),
  consequence: z.string().optional(),
});

const generateCharacterInputSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  gender: z.string().default("未指定"),
  role: z.string(),
  description: z.string(),
  personality: z.string().default(""),
  goals: z.string().default(""),
  secrets: z.string().default(""),
  current_location_id: z.string().default("loc_start"),
  visibility: z.enum(["met", "heard", "hidden"]).default("heard"),
  companion: z.boolean().default(false),
});
const textListSchema = z.union([z.string(), z.array(z.string())]).optional();
const createCharacterCardInputSchema = z.object({
  name: z.string().default("未命名角色"),
  gender: z.string().default("其他"),
  role: z.string().default("角色"),
  description: z.string().default(""),
  appearance_description: z.string().default(""),
  personality: textListSchema,
  traits: textListSchema,
  goals: textListSchema,
  world_name: z.string().default("未命名世界"),
  genre: z.string().default("奇幻"),
  tone: textListSchema,
  content_limits: z.string().default(""),
});
const workspaceSaveFormatInputSchema = z.object({
  topic: z.enum(["overview", "paths", "ai-context", "browser", "native", "export-import", "tests", "all"]).default("overview"),
});
const backupSaveInputSchema = z.object({
  payload: payloadSchema.optional(),
  reason: z.string().default("AI MCP 操作前备份"),
});
const readWorkspaceFileInputSchema = z.object({
  payload: payloadSchema.optional(),
  path: z.string().optional(),
});
const editWorkspaceFileInputSchema = z.object({
  payload: payloadSchema.optional(),
  path: z.string(),
  content: z.string(),
});
const characterDataUpdatesSchema = z
  .object({
    description: z.string().optional(),
    personality: z.array(z.string()).optional(),
    goals: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
    current_location_id: z.string().optional(),
    status: z.string().optional(),
    traits: z.array(z.string()).optional(),
    memory_summary: z.string().optional(),
    player_notes: z.string().optional(),
    appearance_description: z.string().optional(),
    portrait_prompt: z.string().optional(),
    portrait_image_url: z.string().optional(),
    action_tendency: z.string().optional(),
    companion: z.boolean().optional(),
    visibility: z.enum(["met", "heard", "hidden"]).optional(),
  })
  .strict();
const modifyCharacterDataInputSchema = z.object({
  payload: payloadSchema.optional(),
  character_id: z.string(),
  updates: characterDataUpdatesSchema,
});

type RecordEventInput = z.infer<typeof eventInputSchema>;
type GenerateCharacterInput = z.infer<typeof generateCharacterInputSchema>;
type CreateCharacterCardInput = z.infer<typeof createCharacterCardInputSchema>;
type WorkspaceSaveFormatInput = z.infer<typeof workspaceSaveFormatInputSchema>;

export interface AdvanceWorldProgressInput {
  minutes?: number;
  title?: string;
  description: string;
  location_id?: string;
  participant_ids?: string[];
  visibility?: string;
}

export interface LogEventInput {
  purpose: string;
  status?: "ok" | "error";
  summary: string;
  usage?: AIUsage;
  raw?: string;
}

export interface CreateCharacterCardResult {
  appearance_description: string;
  portrait_prompt: string;
  card_notes: string[];
  warnings: string[];
}

export interface EvolvriaSkillRuntimeContext {
  purpose?: AIPurpose;
  seed?: WorldSeed;
  payload?: SavePayload;
  action?: string;
  actionContext?: unknown;
}

export interface PublicSkillDefinition {
  name: EvolvriaSkillName;
  tool_name: EvolvriaSkillToolName;
  path: string;
  title: string;
  description: string;
  runtime_context: string;
  content: string;
}

interface PublicSkillManifestEntry {
  name: EvolvriaSkillName;
  tool_name?: EvolvriaSkillToolName;
  path: string;
}

interface PublicSkillManifest {
  skills?: Array<string | Partial<PublicSkillManifestEntry>>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let publicSkillCache: PublicSkillDefinition[] | null = null;

export function createEvolvriaSkillRuntime(purpose: AIPurpose, payload: unknown): EvolvriaSkillRuntimeContext {
  const record = readRecord(payload);
  const seedResult = worldSeedSchema.safeParse(record?.seed);
  const action = typeof record?.action === "string" ? record.action : undefined;
  return {
    purpose,
    ...(seedResult.success ? { seed: seedResult.data } : {}),
    ...(validatePayloadSchema(payload) ? { payload } : {}),
    ...(record && validatePayloadSchema(record.payload) ? { payload: record.payload } : {}),
    ...(action ? { action } : {}),
    ...(record && "context" in record ? { actionContext: record.context } : {}),
  };
}

export function initializeWorldSkill(seed: WorldSeed): SavePayload {
  return createInitialPayload(seed);
}

export function advanceWorldProgressSkill(payload: SavePayload, input: AdvanceWorldProgressInput): SavePayload {
  const world = payload.world as World;
  const minutes = Math.max(0, input.minutes ?? 60);
  const current = advanceTime(world.current_time, minutes);
  return addEvent(payload, {
    type: "world_progress",
    title: input.title || "世界进度",
    description: input.description,
    world_time: current,
    location_id: input.location_id || payload.locations[0]?.id || "loc_start",
    participant_ids: input.participant_ids ?? [],
    cause_event_ids: [],
    effects: [`时间推进 ${minutes} 分钟。`],
    importance: 0.5,
    visibility: input.visibility || "known_to_player",
  });
}

export function triggerPlayerActionSkill(action: string, context: unknown): PlayerActionResult {
  return mockPlayerAction(action, context);
}

export function recordEventSkill(payload: SavePayload, event: RecordEventInput): SavePayload {
  const world = payload.world as World;
  return addEvent(payload, {
    ...event,
    world_time: event.world_time ?? world.current_time ?? { day: 1, hour: 8 },
    location_id: event.location_id || payload.locations[0]?.id || "loc_start",
  });
}

export function logEventSkill(payload: SavePayload, input: LogEventInput): SavePayload {
  return recordAiLog(
    payload,
    input.purpose,
    input.status ?? "ok",
    input.summary,
    input.usage ?? { input_tokens: 0, output_tokens: 0 },
    input.raw ?? "",
  );
}

export function generateCharacterSkill(input: GenerateCharacterInput): Character {
  const gender = input.gender || "未指定";
  const personality = input.personality ?? "";
  const goals = input.goals ?? "";
  const secrets = input.secrets ?? "";
  const currentLocationId = input.current_location_id || "loc_start";
  const visibility = input.visibility ?? "heard";
  return {
    id: input.id?.trim() || makeId("char"),
    name: input.name,
    gender,
    role: input.role,
    description: input.description,
    personality: splitTags(personality),
    goals: splitTags(goals),
    secrets: splitTags(secrets),
    current_location_id: currentLocationId,
    status: "active",
    traits: splitTags(personality),
    relationships: {},
    memory_summary: "",
    known_event_ids: [],
    player_notes: "",
    player_notes_updated_at: "",
    appearance_description: `${input.name}（${gender}）是一名${input.role}。${input.description}`,
    action_tendency: goals || "根据自身目标行动",
    companion: input.companion ?? false,
    visibility,
  };
}

export function createCharacterCardSkill(input: CreateCharacterCardInput): CreateCharacterCardResult {
  const name = cleanText(input.name) || "未命名角色";
  const gender = cleanText(input.gender) || "其他";
  const role = cleanText(input.role) || "角色";
  const description = cleanText(input.description) || "身份尚未完全公开。";
  const appearance = buildSkillAppearanceDescription({ ...input, name, gender, role, description });
  const tone = listText(input.tone) || "冒险";
  return {
    appearance_description: appearance,
    portrait_prompt: [
      "叙事游戏角色半身像，正面或三分之二视角。",
      `角色：${name}，性别：${gender}，身份：${role}。`,
      `世界：${input.world_name || "未命名世界"}，题材：${input.genre || "奇幻"}，基调：${tone}。`,
      `外貌：${appearance}`,
      "清晰面部、完整发型和上半身服装，背景简洁，情绪贴合人物目标。",
      "不要文字、水印、logo、边框、UI、额外人物、畸形手部或畸形面部。",
    ].join("\n"),
    card_notes: ["通过游戏内 create-character-card skill 生成。"],
    warnings: [],
  };
}

export function workspaceSaveFormatSkill(input: WorkspaceSaveFormatInput = { topic: "overview" }): string {
  const sections: Record<WorkspaceSaveFormatInput["topic"], string> = {
    overview:
      "Evolvria 存档是文件夹式 workspace。AGENTS.md 是 AI 入口；state/payload.json 是权威 SavePayload；world、memory、maps、characters、locations、history、threads 下的 Markdown 是面向 AI/人类的派生上下文。",
    paths:
      "Tauri 活跃存档路径：app_data_dir/saves/active_world/；权威 payload：app_data_dir/saves/active_world/state/payload.json；AI 请求前检查点：app_data_dir/saves/backups/ai_before_request/；滚动备份：app_data_dir/saves/backups/active_world_*/。旧 active_world.json 和备份 JSON 仍需可读。",
    "ai-context":
      "workspace_context 必须使用 workspace_format=evolvria_workspace_v1，instructions_path=AGENTS.md，并确保 loaded_files[0].path 是 AGENTS.md。玩家行动只加载 AGENTS.md、世界/规则、记忆、地图索引、当前地点、参与角色、线程和时间线索引，不要把完整 state/payload.json 塞进普通行动上下文。",
    browser:
      "浏览器 fallback 需要同时维护 evolvria.active_world、evolvria.active_workspace、evolvria.ai_checkpoint、evolvria.ai_checkpoint_workspace。导入可读取原始 SavePayload JSON，也可读取包含 files 数组的 workspace bundle。",
    native:
      "Rust/Tauri load_active_world 先读 active_world/state/payload.json，再回退 active_world.json。save_world 写入 workspace 文件夹并迁移旧 JSON。delete_save_entry 只能删除已知 active/checkpoint/backup 路径，避免任意路径删除。",
    "export-import":
      "导出 zip 应包含 AGENTS.md、manifest.json、state/payload.json、派生 Markdown 和受支持的 maps/ 资源。导入 zip 优先 state/payload.json，回退 legacy payload.json，并恢复 map 图片等资源。",
    tests:
      "改动存档格式时覆盖：workspace 生成包含 AGENTS.md 与 state/payload.json；AI context 首文件是 AGENTS.md；浏览器 workspace bundle 通过 state/payload.json 导入；Rust 保存列表、导入导出、检查点行为；public skill manifest 能解析 workspace-save-format。",
    all: "",
  };
  if (input.topic === "all") {
    return (Object.entries(sections) as Array<[WorkspaceSaveFormatInput["topic"], string]>)
      .filter(([topic]) => topic !== "all")
      .map(([topic, text]) => `## ${topic}\n${text}`)
      .join("\n\n");
  }
  return sections[input.topic];
}

export async function loadPublicSkillDefinitions(fetcher?: FetchLike): Promise<PublicSkillDefinition[]> {
  const useCache = !fetcher;
  const activeFetcher = fetcher ?? globalThis.fetch?.bind(globalThis);
  if (useCache && publicSkillCache) return publicSkillCache;
  if (!activeFetcher) return fallbackPublicSkillDefinitions();

  try {
    const manifest = await loadPublicSkillManifest(activeFetcher);
    const loaded = await Promise.all(
      manifest.map(async (entry) => {
        try {
          const content = await fetchSkillText(activeFetcher, entry.path);
          return parsePublicSkillMarkdown(entry.path, content, entry.name, entry.tool_name);
        } catch {
          return fallbackSkillDefinition(entry.name);
        }
      }),
    );
    const publicSkills = mergeWithFallbackSkills(loaded.filter((skill): skill is PublicSkillDefinition => Boolean(skill)));
    const definitions = publicSkills.length > 0 ? publicSkills : fallbackPublicSkillDefinitions();
    if (useCache) publicSkillCache = definitions;
    return definitions;
  } catch {
    return fallbackPublicSkillDefinitions();
  }
}

export function parsePublicSkillMarkdown(
  path: string,
  raw: string,
  fallbackName: EvolvriaSkillName,
  fallbackToolName?: EvolvriaSkillToolName,
): PublicSkillDefinition | null {
  const { frontmatter, body } = splitFrontmatter(raw);
  const folderName = normalizeSkillName(path.split("/")[0]);
  const declaredName = cleanText(frontmatter.name);
  if (declaredName && !/^[a-z0-9-]+$/.test(declaredName)) return null;
  if (declaredName && folderName && declaredName !== folderName) return null;
  const name = normalizeSkillName(declaredName || folderName) ?? fallbackName;
  const fallback = fallbackSkillDefinition(name);
  const content = body.trim() || raw.trim();
  const toolName = normalizeToolName(cleanText(frontmatter.tool_name)) ?? normalizeToolName(fallbackToolName) ?? fallback?.tool_name ?? toolNameForSkill(name);
  return {
    name,
    tool_name: toolName,
    path: normalizeSkillPath(path, name),
    title: cleanText(frontmatter.title) || fallback?.title || titleFromSkillName(name),
    description: cleanText(frontmatter.description) || firstMarkdownParagraph(content) || fallback?.description || titleFromSkillName(name),
    runtime_context: cleanText(frontmatter.runtime_context) || fallback?.runtime_context || "按该 skill 文档说明使用",
    content,
  };
}

export function createEvolvriaBuiltInSkills(runtime: EvolvriaSkillRuntimeContext = {}, publicSkills: PublicSkillDefinition[] = fallbackPublicSkillDefinitions()): ToolSet {
  const skills = {
    evolvriaGameMcp: tool({
      description: skillDescription(publicSkills, "evolvria-game-mcp"),
      inputSchema: z.object({}),
      execute: async () => gameMcpCapabilityManifest(),
    }),
    initializeWorld: tool({
      description: skillDescription(publicSkills, "initialize-world"),
      inputSchema: z.object({ seed: worldSeedSchema.optional() }),
      execute: async ({ seed }) => initializeWorldSkill(requireSeed(seed ?? runtime.seed)),
    }),
    createWorld: tool({
      description: skillDescription(publicSkills, "create-world"),
      inputSchema: z.object({ seed: worldSeedSchema.optional() }),
      execute: async ({ seed }) => createWorldViaGameMcp(requireSeed(seed ?? runtime.seed)),
    }),
    advanceWorldProgress: tool({
      description: skillDescription(publicSkills, "advance-world-progress"),
      inputSchema: z.object({
        payload: payloadSchema.optional(),
        minutes: z.number().min(0).default(60),
        title: z.string().default("世界进度"),
        description: z.string(),
        location_id: z.string().optional(),
        participant_ids: z.array(z.string()).default([]),
        visibility: z.string().default("known_to_player"),
      }),
      execute: async ({ payload, ...input }) => advanceWorldProgressSkill(requirePayload(payload ?? runtime.payload), input),
    }),
    triggerPlayerAction: tool({
      description: skillDescription(publicSkills, "trigger-player-action"),
      inputSchema: z.object({
        action: z.string().optional(),
        context: z.unknown().optional(),
      }),
      execute: async ({ action, context }): Promise<PlayerActionResult> =>
        triggerPlayerActionSkill(requireAction(action ?? runtime.action), context ?? runtime.actionContext),
    }),
    recordEvent: tool({
      description: skillDescription(publicSkills, "record-event"),
      inputSchema: z.object({
        payload: payloadSchema.optional(),
        event: eventInputSchema,
      }),
      execute: async ({ payload, event }) => recordEventSkill(requirePayload(payload ?? runtime.payload), event),
    }),
    logEvent: tool({
      description: skillDescription(publicSkills, "log-event"),
      inputSchema: z.object({
        payload: payloadSchema.optional(),
        purpose: z.string(),
        status: z.enum(["ok", "error"]).default("ok"),
        summary: z.string(),
        usage: usageSchema.default({ input_tokens: 0, output_tokens: 0 }),
        raw: z.string().default(""),
      }),
      execute: async ({ payload, ...input }) => logEventSkill(requirePayload(payload ?? runtime.payload), input),
    }),
    generateCharacter: tool({
      description: skillDescription(publicSkills, "generate-character"),
      inputSchema: generateCharacterInputSchema,
      execute: async (input): Promise<Character> => generateCharacterSkill(input),
    }),
    createCharacterCard: tool({
      description: skillDescription(publicSkills, "create-character-card"),
      inputSchema: createCharacterCardInputSchema,
      execute: async (input): Promise<CreateCharacterCardResult> => createCharacterCardSkill(input),
    }),
    backupSave: tool({
      description: skillDescription(publicSkills, "backup-save"),
      inputSchema: backupSaveInputSchema,
      execute: async ({ payload, reason }) => backupSaveViaGameMcp(requirePayload(payload ?? runtime.payload), reason),
    }),
    readWorkspaceFile: tool({
      description: skillDescription(publicSkills, "read-workspace-file"),
      inputSchema: readWorkspaceFileInputSchema,
      execute: async ({ payload, path }) => {
        const currentPayload = requirePayload(payload ?? runtime.payload);
        return path ? readWorkspaceFileViaGameMcp(currentPayload, path) : listWorkspaceFilesViaGameMcp(currentPayload);
      },
    }),
    editWorkspaceFile: tool({
      description: skillDescription(publicSkills, "edit-workspace-file"),
      inputSchema: editWorkspaceFileInputSchema,
      execute: async ({ payload, path, content }) => editWorkspaceFileViaGameMcp(requirePayload(payload ?? runtime.payload), path, content),
    }),
    modifyCharacterData: tool({
      description: skillDescription(publicSkills, "modify-character-data"),
      inputSchema: modifyCharacterDataInputSchema,
      execute: async ({ payload, character_id, updates }) =>
        modifyCharacterDataViaGameMcp(requirePayload(payload ?? runtime.payload), {
          character_id,
          updates,
        }),
    }),
    workspaceSaveFormat: tool({
      description: skillDescription(publicSkills, "workspace-save-format"),
      inputSchema: workspaceSaveFormatInputSchema,
      execute: async (input): Promise<string> => workspaceSaveFormatSkill(input),
    }),
  };

  const dynamicSkills: ToolSet = { ...skills };
  for (const publicSkill of publicSkills) {
    if (publicSkill.tool_name in dynamicSkills) continue;
    dynamicSkills[publicSkill.tool_name] = tool({
      description: publicSkill.description || `读取 ${publicSkill.name} skill 文档。`,
      inputSchema: z.object({}),
      execute: async () => ({
        name: publicSkill.name,
        title: publicSkill.title,
        description: publicSkill.description,
        runtime_context: publicSkill.runtime_context,
        content: publicSkill.content,
      }),
    });
  }

  return dynamicSkills;
}

export type EvolvriaBuiltInSkills = ReturnType<typeof createEvolvriaBuiltInSkills>;

export function skillManifest(publicSkills: PublicSkillDefinition[] = fallbackPublicSkillDefinitions()): PublicSkillDefinition[] {
  return mergeWithFallbackSkills(publicSkills);
}

function requireSeed(seed: WorldSeed | undefined): WorldSeed {
  const parsed = worldSeedSchema.safeParse(seed);
  if (!parsed.success) throw new Error("缺少有效的 WorldSeed，无法初始化世界。");
  return parsed.data;
}

function requirePayload(payload: unknown): SavePayload {
  if (!validatePayloadSchema(payload)) throw new Error("缺少有效的 SavePayload，无法执行该世界 skill。");
  return payload;
}

function requireAction(action: string | undefined): string {
  const trimmed = action?.trim();
  if (!trimmed) throw new Error("缺少玩家行动文本，无法触发玩家行为 skill。");
  return trimmed;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function buildSkillAppearanceDescription(input: CreateCharacterCardInput & { name: string; gender: string; role: string; description: string }): string {
  const userAppearance = cleanText(input.appearance_description);
  const traits = listText(input.personality) || listText(input.traits) || "沉稳、有辨识度";
  const goals = listText(input.goals);
  const genre = cleanText(input.genre) || "奇幻";
  const tone = listText(input.tone) || "冒险";
  const base = userAppearance
    ? `${userAppearance}。${input.name}的体态与眼神体现${traits}，服饰材质、配饰和主色贴合${genre}${tone}基调。`
    : `${input.name}（${input.gender}）是一名${input.role}，${input.description}外形以清晰五官、稳定发型和有身份线索的上半身服装为核心，体态体现${traits}${goals ? `，随身细节呼应目标：${goals}` : ""}。`;
  return clampText(base, 180);
}

function listText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean).join("、");
  return value?.trim() ?? "";
}

function clampText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}。` : trimmed;
}

function advanceTime(time: WorldTime | undefined, minutes: number): WorldTime {
  const source = time ?? { day: 1, hour: 8 };
  const totalHours = source.day * 24 + source.hour + Math.floor(minutes / 60);
  return { ...source, day: Math.floor(totalHours / 24), hour: totalHours % 24 };
}

async function loadPublicSkillManifest(fetcher: FetchLike): Promise<PublicSkillManifestEntry[]> {
  try {
    const response = await fetcher(publicSkillUrl("manifest.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = (await response.json()) as PublicSkillManifest;
    const entries = (manifest.skills ?? [])
      .map((entry) => {
        if (typeof entry === "string") return entryFromName(entry);
        if (!entry.name) return null;
        const name = normalizeSkillName(entry.name);
        if (!name) return null;
        return {
          name,
          tool_name: normalizeToolName(entry.tool_name) ?? toolNameForSkill(name),
          path: normalizeSkillPath(cleanText(entry.path) || defaultSkillPath(name), name),
        };
      })
      .filter((entry): entry is PublicSkillManifestEntry => Boolean(entry));
    return entries.length > 0 ? entries : fallbackPublicSkillManifestEntries();
  } catch {
    return fallbackPublicSkillManifestEntries();
  }
}

async function fetchSkillText(fetcher: FetchLike, path: string): Promise<string> {
  const response = await fetcher(publicSkillUrl(path));
  if (response.ok) return response.text();
  if (path.endsWith("/SKILL.md")) {
    const lowercase = await fetcher(publicSkillUrl(path.replace(/\/SKILL\.md$/, "/skills.md")));
    if (lowercase.ok) return lowercase.text();
  }
  throw new Error(`无法读取 public skill：${path}`);
}

function publicSkillUrl(path: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  return `${base}skills/${path.replace(/^\/+/, "")}`;
}

function entryFromName(value: string): PublicSkillManifestEntry | null {
  const name = normalizeSkillName(value);
  return name ? { name, tool_name: toolNameForSkill(name), path: defaultSkillPath(name) } : null;
}

function defaultSkillPath(name: EvolvriaSkillName): string {
  return `${name}/SKILL.md`;
}

function normalizeSkillName(value: unknown): EvolvriaSkillName | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value) ? value : null;
}

function normalizeSkillPath(path: string, name: EvolvriaSkillName): string {
  const cleaned = path.replace(/^\/+/, "");
  return cleaned.startsWith(`${name}/`) ? cleaned : defaultSkillPath(name);
}

function normalizeToolName(value: unknown): EvolvriaSkillToolName | null {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(value) ? value : null;
}

function splitFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { frontmatter: {}, body: raw };
  return {
    frontmatter: parseFrontmatter(match[1] ?? ""),
    body: raw.slice(match[0].length),
  };
}

function parseFrontmatter(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => {
        const index = line.indexOf(":");
        if (index < 0) return null;
        const key = line.slice(0, index).trim();
        const raw = line.slice(index + 1).trim();
        return key ? [key, raw.replace(/^['"]|['"]$/g, "")] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
}

function firstMarkdownParagraph(content: string): string {
  return (
    content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && !line.startsWith("-")) ?? ""
  );
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function skillDescription(publicSkills: PublicSkillDefinition[], name: EvolvriaSkillName): string {
  return publicSkills.find((skill) => skill.name === name)?.description || fallbackSkillDefinition(name)?.description || name;
}

function mergeWithFallbackSkills(publicSkills: PublicSkillDefinition[]): PublicSkillDefinition[] {
  const byName = new Map<string, PublicSkillDefinition>();
  for (const skill of publicSkills) {
    byName.set(skill.name, skill);
  }
  return [...byName.values()];
}

function fallbackPublicSkillDefinitions(): PublicSkillDefinition[] {
  return Object.keys(fallbackSkillDefinitions).map((name) => fallbackSkillDefinition(name)!);
}

function fallbackPublicSkillManifestEntries(): PublicSkillManifestEntry[] {
  return fallbackPublicSkillDefinitions().map(({ name, tool_name, path }) => ({ name, tool_name, path }));
}

function fallbackSkillDefinition(name: EvolvriaSkillName): PublicSkillDefinition | null {
  const fallback = fallbackSkillDefinitions[name];
  return fallback ? { name, path: defaultSkillPath(name), ...fallback } : null;
}

function titleFromSkillName(name: EvolvriaSkillName): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toolNameForSkill(name: EvolvriaSkillName): EvolvriaSkillToolName {
  return fallbackSkillDefinitions[name]?.tool_name ?? kebabToCamel(name);
}

function kebabToCamel(value: string): string {
  const camel = value.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase()).replace(/^[^A-Za-z]+/, "");
  return normalizeToolName(camel) ?? "publicSkill";
}

const fallbackSkillDefinitions: Record<string, Omit<PublicSkillDefinition, "name" | "path">> = {
    "evolvria-game-mcp": {
      tool_name: "evolvriaGameMcp",
      title: "Evolvria 游戏 MCP",
      description: "说明 Evolvria 游戏 MCP 的受限权限边界、可用工具和安全策略，用于 AI 需要读取或编辑工作区、备份存档、创建世界、修改角色数据时。",
      runtime_context: "可使用当前 SavePayload",
      content: "列出游戏 MCP 的权限、风险级别和应优先使用的受控工具。",
    },
    "initialize-world": {
      tool_name: "initializeWorld",
      title: "初始化世界",
      description: "初始化一个 Evolvria 世界，返回完整 schema v1 SavePayload。AI 调用时可省略 seed，程序会使用当前请求 seed。",
      runtime_context: "可使用当前 world_expand seed",
      content: "根据 WorldSeed 创建 schema v1 世界状态，保留玩家设定并写入开局事件。",
    },
    "create-world": {
      tool_name: "createWorld",
      title: "创建世界",
      description: "通过 Evolvria 游戏 MCP 根据 WorldSeed 创建完整 schema v1 SavePayload，可作为新游戏世界或导入前草稿。",
      runtime_context: "可使用当前 world_expand seed",
      content: "创建新世界时保留玩家种子、生成角色、地点、势力、开局事件、记忆和线索线程。",
    },
    "advance-world-progress": {
      tool_name: "advanceWorldProgress",
      title: "推进世界进度",
      description: "推进世界时间并生成一条世界进度事件，不直接覆盖玩家已确认事实。AI 调用时可省略 payload，程序会使用当前运行时 payload。",
      runtime_context: "可使用当前 SavePayload",
      content: "根据分钟数推进世界时间，记录世界进度事件，避免覆盖玩家已确认事实。",
    },
    "trigger-player-action": {
      tool_name: "triggerPlayerAction",
      title: "触发玩家行为",
      description: "根据玩家行动和当前上下文生成 PlayerActionResult。AI 调用时可省略 action/context，程序会使用当前请求值。",
      runtime_context: "可使用当前玩家行动和上下文",
      content: "解析玩家行动并生成叙事、事件、状态更新、记忆写入和推荐行动。",
    },
    "record-event": {
      tool_name: "recordEvent",
      title: "记录事件",
      description: "把叙事事件写入时间线，返回更新后的 SavePayload。AI 调用时可省略 payload，程序会使用当前运行时 payload。",
      runtime_context: "可使用当前 SavePayload",
      content: "将事件追加到时间线，补齐时间、地点、参与者、影响和可见性。",
    },
    "log-event": {
      tool_name: "logEvent",
      title: "记录日志",
      description: "记录一次 AI/skill 调用日志，只保存摘要和脱敏 raw_response。",
      runtime_context: "可使用当前 SavePayload",
      content: "记录 AI 或 skill 调用摘要、状态和 token 用量，禁止保存敏感 token。",
    },
    "generate-character": {
      tool_name: "generateCharacter",
      title: "生成角色",
      description: "生成一个符合 Evolvria schema 的角色对象，可用于新增 NPC、同伴或势力代表。",
      runtime_context: "无需运行时上下文",
      content: "根据姓名、身份、描述、目标和秘密生成符合 Character schema 的角色对象。",
    },
    "create-character-card": {
      tool_name: "createCharacterCard",
      title: "创建角色卡",
      description: "根据稀疏角色输入生成可保存的外貌描写和画像提示词，用于智能补全角色卡与后续形象生成。",
      runtime_context: "无需运行时上下文",
      content: "保留玩家明确外貌约束，补全发型、五官、服饰、配饰、体态、色彩和可复现的角色形象细节。",
    },
    "backup-save": {
      tool_name: "backupSave",
      title: "备份存档",
      description: "通过 Evolvria 游戏 MCP 在高风险 AI 操作前创建当前 SavePayload 的 AI checkpoint 备份。",
      runtime_context: "可使用当前 SavePayload",
      content: "执行编辑文件、覆盖 payload、创建世界或修改角色前先创建可恢复备份。",
    },
    "read-workspace-file": {
      tool_name: "readWorkspaceFile",
      title: "读取工作区文件",
      description: "通过 Evolvria 游戏 MCP 读取当前世界工作区文件；省略 path 时列出可读取文件。",
      runtime_context: "可使用当前 SavePayload",
      content: "读取 AGENTS.md、world、memory、maps、characters、locations、history、threads 或 state/payload.json。",
    },
    "edit-workspace-file": {
      tool_name: "editWorkspaceFile",
      title: "编辑工作区文件",
      description: "通过 Evolvria 游戏 MCP 校验并准备工作区文本文件编辑，特别是 state/payload.json 的 schema v1 校验。",
      runtime_context: "可使用当前 SavePayload",
      content: "只编辑 Markdown、JSON 或文本；payload 修改必须先备份并通过 schema 校验。",
    },
    "modify-character-data": {
      tool_name: "modifyCharacterData",
      title: "修改角色数据",
      description: "通过 Evolvria 游戏 MCP 修改角色非姓名字段、玩家笔记、位置、可见性、画像字段和行动倾向。",
      runtime_context: "可使用当前 SavePayload",
      content: "角色 name 不可修改；current_location_id 必须引用现有地点；更新后返回新的 SavePayload。",
    },
    "workspace-save-format": {
      tool_name: "workspaceSaveFormat",
      title: "工作区存档格式",
      description:
        "查询 Evolvria 文件夹式世界存档和 AI workspace_context 规则，用于维护 AGENTS.md 入口、state/payload.json、导入导出、备份、浏览器 fallback 与相关测试。",
      runtime_context: "无需运行时上下文",
      content: "说明 Evolvria workspace 存档布局、兼容规则、AI 上下文加载策略和必须覆盖的测试面。",
    },
};

export const evolvriaBuiltInSkills = createEvolvriaBuiltInSkills();
