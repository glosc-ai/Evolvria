import { tool } from "ai";
import { z } from "zod";
import { mockPlayerAction } from "@/domain/fixtures";
import { addEvent, createInitialPayload, recordAiLog, validatePayloadSchema } from "@/domain/world";
import { makeId } from "@/services/ids";
import { splitTags } from "@/services/text";
import type { AIUsage, AIPurpose, Character, PlayerActionResult, SavePayload, World, WorldSeed, WorldTime } from "@/types/domain";

export const publicSkillEntries = [
  { name: "initialize-world", tool_name: "initializeWorld", path: "initialize-world/SKILL.md" },
  { name: "advance-world-progress", tool_name: "advanceWorldProgress", path: "advance-world-progress/SKILL.md" },
  { name: "trigger-player-action", tool_name: "triggerPlayerAction", path: "trigger-player-action/SKILL.md" },
  { name: "record-event", tool_name: "recordEvent", path: "record-event/SKILL.md" },
  { name: "log-event", tool_name: "logEvent", path: "log-event/SKILL.md" },
  { name: "generate-character", tool_name: "generateCharacter", path: "generate-character/SKILL.md" },
  { name: "workspace-save-format", tool_name: "workspaceSaveFormat", path: "workspace-save-format/SKILL.md" },
] as const;

export type EvolvriaSkillName = (typeof publicSkillEntries)[number]["name"];
type EvolvriaSkillToolName = (typeof publicSkillEntries)[number]["tool_name"];

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

const payloadSchema = z.custom<SavePayload>(validatePayloadSchema, "必须是 Evolvria schema v1 SavePayload");
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
const workspaceSaveFormatInputSchema = z.object({
  topic: z.enum(["overview", "paths", "ai-context", "browser", "native", "export-import", "tests", "all"]).default("overview"),
});

type RecordEventInput = z.infer<typeof eventInputSchema>;
type GenerateCharacterInput = z.infer<typeof generateCharacterInputSchema>;
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
  tool_name: EvolvriaSkillToolName;
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

export async function loadPublicSkillDefinitions(fetcher: FetchLike | undefined = globalThis.fetch?.bind(globalThis)): Promise<PublicSkillDefinition[]> {
  if (publicSkillCache) return publicSkillCache;
  if (!fetcher) return fallbackPublicSkillDefinitions();

  try {
    const manifest = await loadPublicSkillManifest(fetcher);
    const loaded = await Promise.all(
      manifest.map(async (entry) => {
        const content = await fetchSkillText(fetcher, entry.path);
        return parsePublicSkillMarkdown(entry.path, content, entry.name);
      }),
    );
    publicSkillCache = mergeWithFallbackSkills(loaded.filter((skill): skill is PublicSkillDefinition => Boolean(skill)));
    return publicSkillCache;
  } catch {
    return fallbackPublicSkillDefinitions();
  }
}

export function parsePublicSkillMarkdown(path: string, raw: string, fallbackName: EvolvriaSkillName): PublicSkillDefinition | null {
  const { frontmatter, body } = splitFrontmatter(raw);
  const folderName = normalizeSkillName(path.split("/")[0]);
  const declaredName = cleanText(frontmatter.name);
  if (declaredName && !/^[a-z0-9-]+$/.test(declaredName)) return null;
  if (declaredName && folderName && declaredName !== folderName) return null;
  const name = normalizeSkillName(declaredName || folderName) ?? fallbackName;
  const fallback = fallbackSkillDefinition(name);
  if (!fallback) return null;
  const content = body.trim() || raw.trim();
  return {
    name,
    tool_name: toolNameForSkill(name),
    path,
    title: cleanText(frontmatter.title) || fallback.title || cleanText(frontmatter.name),
    description: cleanText(frontmatter.description) || firstMarkdownParagraph(content) || fallback.description,
    runtime_context: cleanText(frontmatter.runtime_context) || fallback.runtime_context,
    content,
  };
}

export function createEvolvriaBuiltInSkills(runtime: EvolvriaSkillRuntimeContext = {}, publicSkills: PublicSkillDefinition[] = fallbackPublicSkillDefinitions()) {
  return {
    initializeWorld: tool({
      description: skillDescription(publicSkills, "initialize-world"),
      inputSchema: z.object({ seed: worldSeedSchema.optional() }),
      execute: async ({ seed }) => initializeWorldSkill(requireSeed(seed ?? runtime.seed)),
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
    workspaceSaveFormat: tool({
      description: skillDescription(publicSkills, "workspace-save-format"),
      inputSchema: workspaceSaveFormatInputSchema,
      execute: async (input): Promise<string> => workspaceSaveFormatSkill(input),
    }),
  } as const;
}

export const evolvriaBuiltInSkills = createEvolvriaBuiltInSkills();
export type EvolvriaBuiltInSkills = ReturnType<typeof createEvolvriaBuiltInSkills>;

export function skillManifest(publicSkills: PublicSkillDefinition[] = fallbackPublicSkillDefinitions()): PublicSkillDefinition[] {
  return mergeWithFallbackSkills(publicSkills);
}

function requireSeed(seed: WorldSeed | undefined): WorldSeed {
  const parsed = worldSeedSchema.safeParse(seed);
  if (!parsed.success) throw new Error("缺少有效的 WorldSeed，无法初始化世界。");
  return parsed.data;
}

function requirePayload(payload: SavePayload | undefined): SavePayload {
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
        return { name, tool_name: toolNameForSkill(name), path: cleanText(entry.path) || defaultSkillPath(name) };
      })
      .filter((entry): entry is PublicSkillManifestEntry => Boolean(entry));
    return entries.length > 0 ? entries : [...publicSkillEntries];
  } catch {
    return [...publicSkillEntries];
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
  return publicSkillEntries.find((entry) => entry.name === name)?.path ?? `${name}/SKILL.md`;
}

function normalizeSkillName(value: unknown): EvolvriaSkillName | null {
  return typeof value === "string" && /^[a-z0-9-]+$/.test(value) && publicSkillEntries.some((entry) => entry.name === value) ? (value as EvolvriaSkillName) : null;
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
  const byName = new Map(publicSkills.map((skill) => [skill.name, skill]));
  return publicSkillEntries.map((entry) => byName.get(entry.name) ?? fallbackSkillDefinition(entry.name)!);
}

function fallbackPublicSkillDefinitions(): PublicSkillDefinition[] {
  return publicSkillEntries.map((entry) => fallbackSkillDefinition(entry.name)!);
}

function fallbackSkillDefinition(name: EvolvriaSkillName): PublicSkillDefinition | null {
  const fallback: Record<EvolvriaSkillName, Omit<PublicSkillDefinition, "name" | "path">> = {
    "initialize-world": {
      tool_name: "initializeWorld",
      title: "初始化世界",
      description: "初始化一个 Evolvria 世界，返回完整 schema v1 SavePayload。AI 调用时可省略 seed，程序会使用当前请求 seed。",
      runtime_context: "可使用当前 world_expand seed",
      content: "根据 WorldSeed 创建 schema v1 世界状态，保留玩家设定并写入开局事件。",
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
    "workspace-save-format": {
      tool_name: "workspaceSaveFormat",
      title: "工作区存档格式",
      description:
        "查询 Evolvria 文件夹式世界存档和 AI workspace_context 规则，用于维护 AGENTS.md 入口、state/payload.json、导入导出、备份、浏览器 fallback 与相关测试。",
      runtime_context: "无需运行时上下文",
      content: "说明 Evolvria workspace 存档布局、兼容规则、AI 上下文加载策略和必须覆盖的测试面。",
    },
  };
  const entry = publicSkillEntries.find((item) => item.name === name);
  return entry ? { name, path: entry.path, ...fallback[name] } : null;
}

function toolNameForSkill(name: EvolvriaSkillName): EvolvriaSkillToolName {
  return publicSkillEntries.find((entry) => entry.name === name)!.tool_name;
}
