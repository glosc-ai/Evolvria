import { mockPlayerAction } from "@/domain/fixtures";
import { aiSdkJsonObjectSchema, callAiSdkJson, playerActionAiSchema } from "@/services/ai-sdk";
import { safeInvoke } from "@/services/tauri";
import { buildSeedWorkspaceAiContext } from "@/services/world-workspace";
import type { AIUsage, AIPurpose, PlayerActionResult, Settings, WorldSeed } from "@/types/domain";

export interface UsageEstimate {
  purpose: string;
  purpose_label: string;
  remote_enabled: boolean;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_estimate: null;
  billing_note: string;
  risk_level: "低" | "中" | "高";
  risk_reasons: string[];
  retry_note: string;
}

export interface GloscCallResult {
  status: "ok" | "error";
  content?: string;
  parsed?: unknown;
  error?: string;
  usage?: AIUsage;
}

export interface WorldExpansionResult {
  status: "ok" | "error";
  summary: string;
  openingTitle?: string;
  openingNarrative?: string;
  suggestedActions?: string[];
  usage: AIUsage;
  raw?: string;
}

export interface CharacterImageInput {
  name: string;
  gender?: string;
  role: string;
  description: string;
  appearance_description?: string;
  personality?: string[];
  traits?: string[];
  world_name?: string;
  genre?: string;
  tone?: string[];
}

export interface CharacterImageResult {
  status: "ok" | "error";
  image_url: string;
  prompt: string;
  appearance_description: string;
  card_notes: string[];
  warnings: string[];
  usage: AIUsage;
  error?: string;
}

interface CharacterCardResult {
  appearance_description: string;
  portrait_prompt: string;
  card_notes: string[];
  warnings: string[];
  usage: AIUsage;
  raw?: string;
}

const PURPOSE_LABELS: Record<string, string> = {
  world_expand: "世界扩写",
  player_action: "玩家行动",
  npc_simulation: "NPC 模拟",
  memory_extract: "记忆抽取",
  summary_update: "阶段摘要",
  consistency_check: "一致性检查",
  character_image: "角色形象",
};

function localWorldExpansion(seed: WorldSeed, reason = ""): WorldExpansionResult {
  const prefix = reason ? `${reason}，已使用本地模拟。` : "";
  return {
    status: "ok",
    summary: `${prefix}${seed.world_name} 已根据 ${seed.genre}/${seed.tone} 设定完成本地扩写。`,
    usage: { input_tokens: 860, output_tokens: 1080 },
  };
}

export async function generateCharacterImage(input: CharacterImageInput, settings: Settings): Promise<CharacterImageResult> {
  const card = await generateCharacterCard(input, settings);
  const appearanceDescription = card.appearance_description;
  const prompt = card.portrait_prompt;
  if (!isGloscConfigured(settings)) {
    return {
      status: "ok",
      image_url: localCharacterPortrait(input),
      prompt,
      appearance_description: appearanceDescription,
      card_notes: card.card_notes,
      warnings: card.warnings,
      usage: { input_tokens: Math.ceil(prompt.length / 2.6), output_tokens: 0 },
    };
  }
  try {
    const response = await fetch(`${normalizeImagesBaseUrl(settings.glosc_base_url)}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.glosc_token}`,
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }>; usage?: AIUsage };
    const first = json.data?.[0];
    const imageUrl = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url;
    if (!imageUrl) throw new Error("图片响应缺少 data[0].b64_json 或 url。");
    return {
      status: "ok",
      image_url: imageUrl,
      prompt,
      appearance_description: appearanceDescription,
      card_notes: card.card_notes,
      warnings: card.warnings,
      usage: json.usage ?? { input_tokens: Math.ceil(prompt.length / 2.6), output_tokens: 0 },
    };
  } catch (error) {
    return {
      status: "error",
      image_url: localCharacterPortrait(input),
      prompt,
      appearance_description: appearanceDescription,
      card_notes: card.card_notes,
      warnings: [...card.warnings, "图片接口不可用，已使用本地占位形象。"],
      usage: { input_tokens: Math.ceil(prompt.length / 2.6), output_tokens: 0 },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function generateCharacterCard(input: CharacterImageInput, settings: Settings): Promise<CharacterCardResult> {
  const localCard = localCharacterCard(input);
  if (!isGloscConfigured(settings)) return localCard;
  const result = await callGlosc(
    "character_image",
    {
      task: "create_internal_character_card",
      skill: "create-character-card",
      instructions:
        "遵循 create-character-card skill：即便用户提供外貌，也必须保留其明确约束并丰富可见细节。只返回 JSON：appearance_description、portrait_prompt、card_notes、warnings。",
      character: input,
      output_contract: {
        appearance_description: "80-180 字中文具体形象描写，可直接保存进角色卡。",
        portrait_prompt: "用于 gpt-image-2 的中文出图提示词。",
        card_notes: "程序内部设计注记数组。",
        warnings: "无法满足或被替换的细节说明数组。",
      },
    },
    settings,
    700,
  );
  if (!result || result.status !== "ok") return { ...localCard, warnings: [`角色卡扩写失败，已使用本地规则：${result?.error ?? "未知错误"}`] };
  return normalizeCharacterCard(result, localCard);
}

function normalizeCharacterCard(result: GloscCallResult, fallback: CharacterCardResult): CharacterCardResult {
  const source = parseJsonish(result.parsed) || parseJsonish(result.content);
  const appearance = pickText(source, ["appearance_description", "appearanceDescription", "appearance"]);
  const prompt = pickText(source, ["portrait_prompt", "portraitPrompt", "prompt"]);
  return {
    appearance_description: appearance || fallback.appearance_description,
    portrait_prompt: prompt || fallback.portrait_prompt,
    card_notes: firstStringArray(readUnknown(source, "card_notes"), readUnknown(source, "cardNotes")) ?? fallback.card_notes,
    warnings: firstStringArray(readUnknown(source, "warnings")) ?? [],
    usage: result.usage ?? fallback.usage,
    raw: result.content,
  };
}

function normalizeImagesBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "https://api.openai.com/v1";
  if (/\/v\d+\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, "");
  if (/\/v\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

function buildCharacterAppearanceDescription(input: CharacterImageInput): string {
  const userAppearance = input.appearance_description?.trim();
  const traits = [...(input.personality ?? []), ...(input.traits ?? [])].filter(Boolean).join("、") || "沉稳、有辨识度";
  const genre = input.genre || "奇幻";
  const tone = input.tone?.join("、") || "冒险";
  if (userAppearance) {
    return [
      userAppearance,
      `整体气质贴合${genre}世界的${tone}基调，眼神与体态体现${traits}。`,
      "补足清晰的发型、五官、上半身服装材质、主色与一个便于识别的随身配饰。",
    ].join("");
  }
  return [
    `${input.name}是一名${input.gender || "未指定性别"}的${input.role || "角色"}，整体气质贴合${genre}世界的${tone}基调。`,
    `外形以“${input.description || "身份未明的人物"}”为核心，面部轮廓清晰，眼神能体现${traits}的性格。`,
    "服装应体现身份与经历，保留便于玩家识别的主色、配饰或随身物；发型、五官、体态和上半身服饰需要明确，不使用文字、水印或 UI 元素。",
  ].join("");
}

function localCharacterCard(input: CharacterImageInput): CharacterCardResult {
  const appearance = buildCharacterAppearanceDescription(input);
  const prompt = buildCharacterImagePrompt(input, appearance);
  return {
    appearance_description: appearance,
    portrait_prompt: prompt,
    card_notes: ["本地规则生成的内部角色形象卡。"],
    warnings: [],
    usage: { input_tokens: Math.ceil(JSON.stringify(input).length / 2.6), output_tokens: Math.ceil((appearance.length + prompt.length) / 2.6) },
  };
}

function buildCharacterImagePrompt(input: CharacterImageInput, appearance: string): string {
  return [
    "为叙事游戏 Evolvria 生成单人角色立绘。",
    `角色：${input.name}，性别：${input.gender || "未指定"}，身份：${input.role}。`,
    `世界：${input.world_name || "未命名世界"}，题材：${input.genre || "奇幻"}，基调：${input.tone?.join("、") || "冒险"}。`,
    `外貌要求：${appearance}`,
    `人物简介：${input.description}`,
    `性格/特质：${[...(input.personality ?? []), ...(input.traits ?? [])].filter(Boolean).join("、") || "未指定"}`,
    "画面要求：半身像，正面或三分之二视角，清晰面部，完整发型和上半身服装，背景简洁，不要文字、水印、边框、UI。",
  ].join("\n");
}

function localCharacterPortrait(input: CharacterImageInput): string {
  const label = encodeXml(input.name.trim().slice(0, 2) || "人");
  const hue = Math.abs([...input.name].reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="hsl(${hue},52%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 58) % 360},45%,24%)"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="190" r="86" fill="rgba(255,255,255,.28)"/><path d="M104 454c28-96 96-148 152-148s124 52 152 148" fill="rgba(255,255,255,.22)"/><text x="256" y="286" fill="white" font-size="72" font-family="serif" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function encodeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function isGloscConfigured(settings: Settings): boolean {
  return Boolean(settings.glosc_base_url.trim() && settings.glosc_token.trim());
}

export function estimateUsage(purpose: string, input: unknown, settings: Settings): UsageEstimate {
  const inputText = JSON.stringify(input);
  const inputTokens = Math.max(120, Math.ceil(inputText.length / 2.6));
  const outputTokens = purpose === "world_expand" ? 1200 : purpose === "player_action" ? 600 : 360;
  const remote = isGloscConfigured(settings);
  return {
    purpose,
    purpose_label: PURPOSE_LABELS[purpose] ?? purpose,
    remote_enabled: remote,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    cost_estimate: null,
    billing_note: remote ? "远端模型" : "本地模拟",
    risk_level: purpose === "world_expand" ? "高" : remote ? "中" : "低",
    risk_reasons: remote ? ["会发送当前场景和相关记忆到 Glosc One"] : ["本地 mock 不发送网络请求"],
    retry_note: settings.auto_retry ? "失败时会按设置自动重试一次" : "失败时不会自动重试",
  };
}

export function estimateUsageText(estimate: UsageEstimate): string {
  return `${estimate.purpose_label} · 预计 Token ${estimate.total_tokens}（输入 ${estimate.input_tokens} / 输出 ${estimate.output_tokens}）`;
}

export async function generateWorld(seed: WorldSeed, settings: Settings): Promise<WorldExpansionResult> {
  if (!isGloscConfigured(settings)) {
    return localWorldExpansion(seed);
  }
  const payload = { seed, workspace_context: buildSeedWorkspaceAiContext(seed) };
  const result = await callGlosc("world_expand", payload, settings, 1200);
  if (!result || result.status !== "ok") {
    return localWorldExpansion(seed, result?.error ? `Glosc One 调用失败：${result.error}` : "Glosc One 调用失败");
  }
  return normalizeGloscWorldExpansion(result, seed);
}

export async function resolvePlayerAction(action: string, context: unknown, settings: Settings): Promise<PlayerActionResult> {
  if (!isGloscConfigured(settings)) {
    return mockPlayerAction(action, context);
  }
  const result = await callGlosc("player_action", { action, context }, settings, 600);
  const normalized = normalizeGloscPlayerAction(result);
  if (normalized) return normalized;
  return { ...mockPlayerAction(action, context), warnings: ["远端响应不可用，已使用本地模拟结果。"] };
}

async function callGlosc(purpose: AIPurpose, payload: unknown, settings: Settings, maxOutputTokens: number): Promise<GloscCallResult | null> {
  const sdkResult = await callAiSdkJson({
    settings,
    purpose,
    payload,
    schema: purpose === "player_action" ? playerActionAiSchema : aiSdkJsonObjectSchema,
    maxOutputTokens,
  });
  if (sdkResult.status === "ok") return sdkResult;

  const nativeResult = await safeInvoke<GloscCallResult>("call_glosc", {
    request: {
      baseUrl: settings.glosc_base_url,
      token: settings.glosc_token,
      model: settings.model,
      purpose,
      payload,
      timeoutSeconds: settings.timeout_seconds,
    },
  });
  return nativeResult ?? sdkResult;
}

export function normalizeGloscPlayerAction(result: GloscCallResult | null): PlayerActionResult | null {
  if (!result || result.status !== "ok") return null;
  const parsed = result.parsed;
  if (!isPlayerActionResult(parsed)) return null;
  return {
    ...parsed,
    usage: result.usage ?? parsed.usage,
    warnings: parsed.warnings ?? [],
  };
}

export function normalizeGloscWorldExpansion(result: GloscCallResult, seed: WorldSeed): WorldExpansionResult {
  const contentValue = parseJsonish(result.content);
  const source = isRecord(result.parsed) || typeof result.parsed === "string" ? parseJsonish(result.parsed) : contentValue;
  const summary =
    firstText(
      pickText(source, ["summary", "world_summary", "worldSummary"]),
      pickText(readRecord(source, "world"), ["summary", "world_summary", "worldSummary"]),
      pickText(readRecord(source, "lore"), ["summary"]),
      typeof contentValue === "string" ? contentValue : "",
      `${seed.world_name} 扩写完成。`,
    ) || `${seed.world_name} 扩写完成。`;
  const openingSource = firstRecord(
    readRecord(source, "opening"),
    readRecord(source, "opening_event"),
    readRecord(source, "openingEvent"),
    readFirstRecord(source, "timeline"),
    readFirstRecord(source, "events"),
  );
  const openingTitle = firstText(pickText(openingSource, ["title", "name"]), pickText(source, ["opening_title", "openingTitle"]));
  const openingNarrative = firstText(
    pickText(openingSource, ["description", "narrative", "text", "content", "summary"]),
    pickText(source, ["opening_narrative", "openingNarrative", "last_narrative", "lastNarrative", "narrative"]),
  );
  return {
    status: "ok",
    summary,
    ...(openingTitle ? { openingTitle } : {}),
    ...(openingNarrative ? { openingNarrative } : {}),
    suggestedActions: firstStringArray(
      readUnknown(source, "suggested_actions"),
      readUnknown(source, "suggestedActions"),
      readUnknown(openingSource, "suggested_actions"),
      readUnknown(openingSource, "suggestedActions"),
    ),
    usage: result.usage ?? { input_tokens: 0, output_tokens: 0 },
    raw: result.content,
  };
}

function isPlayerActionResult(value: unknown): value is PlayerActionResult {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<PlayerActionResult>;
  return (
    source.status === "ok" &&
    typeof source.narrative === "string" &&
    typeof source.time_delta_minutes === "number" &&
    Array.isArray(source.events) &&
    Array.isArray(source.character_updates) &&
    Array.isArray(source.location_updates) &&
    Array.isArray(source.relationship_updates) &&
    Array.isArray(source.memory_writes) &&
    Array.isArray(source.suggested_actions)
  );
}

function parseJsonish(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readUnknown(source: unknown, key: string): unknown {
  return isRecord(source) ? source[key] : undefined;
}

function readRecord(source: unknown, key: string): Record<string, unknown> | undefined {
  const value = readUnknown(source, key);
  return isRecord(value) ? value : undefined;
}

function readFirstRecord(source: unknown, key: string): Record<string, unknown> | undefined {
  const value = readUnknown(source, key);
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : undefined;
}

function pickText(source: unknown, keys: string[]): string {
  if (!isRecord(source)) return "";
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstText(...values: string[]): string {
  return values.find((value) => value.trim())?.trim() ?? "";
}

function firstRecord(...values: Array<Record<string, unknown> | undefined>): Record<string, unknown> | undefined {
  return values.find((value): value is Record<string, unknown> => Boolean(value));
}

function firstStringArray(...values: unknown[]): string[] | undefined {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
    if (items.length > 0) return items;
  }
  return undefined;
}
