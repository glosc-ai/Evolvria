import { createOpenAI } from "@ai-sdk/openai";
import { isStepCount, NoObjectGeneratedError, Output, ToolLoopAgent, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { createEvolvriaBuiltInSkills, createEvolvriaSkillRuntime, loadPublicSkillDefinitions, skillManifest } from "@/services/ai-skills";
import { redactSensitive } from "@/services/text";
import type { AIPurpose, AIUsage, Settings } from "@/types/domain";

const SYSTEM_PROMPT =
  "你是 Evolvria 的叙事与世界模拟引擎。只返回合法 JSON，不要输出 JSON 以外的内容。若 payload 中包含 workspace_context，必须先遵循其中 AGENTS.md 的加载顺序和规则，再使用其他已加载文件。你可以调用 public skills 来初始化或创建世界、推进世界进度、触发玩家行为、记录事件、记录日志、生成角色、创建角色卡、查询工作区存档格式，并通过受限游戏 MCP 读取或编辑工作区、备份存档、修改角色数据；这些 skills 已绑定当前请求的 seed/action/context/payload（如适用），调用时传入最小必要参数，不要复制完整 payload。自定义 reference skill 会返回对应 Markdown 指令内容。调用后仍必须按 output_contract 汇总为最终 JSON。";

export const aiSdkJsonObjectSchema = z.record(z.string(), z.unknown());

export const playerActionAiSchema = z
  .object({
    status: z.enum(["ok", "error"]),
    narrative: z.string(),
    time_delta_minutes: z.number(),
    events: z.array(z.record(z.string(), z.unknown())),
    character_updates: z.array(z.record(z.string(), z.unknown())),
    location_updates: z.array(z.record(z.string(), z.unknown())),
    relationship_updates: z.array(
      z
        .object({
          source_id: z.string(),
          target_id: z.string(),
          trust_delta: z.number().optional(),
          affection_delta: z.number().optional(),
          tension_delta: z.number().optional(),
          note: z.string(),
        })
        .passthrough(),
    ),
    memory_writes: z.array(z.record(z.string(), z.unknown())),
    suggested_actions: z.array(z.string()),
    warnings: z.array(z.string()).default([]),
    error: z.string().optional(),
    request_id: z.string().optional(),
  })
  .passthrough();

export interface AiSdkCallOptions<T> {
  settings: Settings;
  purpose: AIPurpose;
  payload: unknown;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  temperature?: number;
  timeoutSeconds?: number;
}

export interface AiSdkCallResult<T> {
  status: "ok" | "error";
  content?: string;
  parsed?: T;
  error?: string;
  usage?: AIUsage;
  toolCalls?: string[];
}

export function normalizeOpenAiBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "https://api.openai.com/v1";
  if (/\/v\d+\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, "");
  if (/\/v\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

export async function callAiSdkJson<T>(options: AiSdkCallOptions<T>): Promise<AiSdkCallResult<T>> {
  const model = createOpenAI({
    apiKey: options.settings.glosc_token,
    baseURL: normalizeOpenAiBaseUrl(options.settings.glosc_base_url),
    name: options.settings.glosc_provider || "Glosc One",
  }).chat(options.settings.model);
  const timeout = createTimeoutSignal(options.timeoutSeconds ?? options.settings.timeout_seconds);

  try {
    const publicSkills = await withHardTimeout(loadPublicSkillDefinitions(), timeout);
    const skills = createEvolvriaBuiltInSkills(createEvolvriaSkillRuntime(options.purpose, options.payload), publicSkills);
    const agent = new ToolLoopAgent({
      model,
      instructions: SYSTEM_PROMPT,
      tools: skills,
      output: Output.json(),
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature ?? 0.7,
      maxRetries: options.settings.auto_retry ? 1 : 0,
      stopWhen: isStepCount(6),
    });
    const result = await withHardTimeout(
      agent.generate({
        prompt: JSON.stringify({
          purpose: options.purpose,
          payload: options.payload,
          available_skills: skillManifest(publicSkills),
          output_contract: outputContractFor(options.purpose),
        }),
        abortSignal: timeout.signal,
      }),
      timeout,
    );
    const toolCalls = result.toolCalls.map((call) => call.toolName);
    const parsed = parseFirstSchemaMatch(options.schema, parseAiJsonish(result.output), parseAiJsonish(result.text), result.output);
    if (!parsed.success) {
      return {
        status: "error",
        content: result.text,
        error: `AI SDK 响应结构不符合契约：${parsed.error.issues.map((issue) => issue.message).join("；")}`,
        usage: usageFromAiSdk(result.usage),
        toolCalls,
      };
    }
    return {
      status: "ok",
      content: result.text,
      parsed: parsed.data,
      usage: usageFromAiSdk(result.usage),
      toolCalls,
    };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      const parsed = parseFirstSchemaMatch(options.schema, parseAiJsonish(error.text));
      if (parsed.success) {
        return {
          status: "ok",
          content: error.text,
          parsed: parsed.data,
          usage: usageFromAiSdk(error.usage),
        };
      }
      return {
        status: "error",
        content: error.text,
        error: `AI SDK 响应结构不符合契约：${parsed.error.issues.map((issue) => issue.message).join("；")}`,
        usage: usageFromAiSdk(error.usage),
      };
    }
    return {
      status: "error",
      error: aiSdkErrorMessage(error, timeout.timeoutMessage),
    };
  } finally {
    timeout.clear();
  }
}

export function parseAiJsonish(value: unknown): unknown {
  return parseAiJsonishInternal(value, 0);
}

function parseAiJsonishInternal(value: unknown, depth: number): unknown {
  if (depth > 5) return value;
  if (typeof value === "string") {
    const parsed = parseJsonString(value);
    return parsed === value.trim() ? parsed : parseAiJsonishInternal(parsed, depth + 1);
  }
  if (!isRecord(value)) return value;
  const unwrapped = unwrapAiEnvelope(value, depth);
  return unwrapped === value ? value : parseAiJsonishInternal(unwrapped, depth + 1);
}

function parseJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  for (const candidate of jsonCandidates(trimmed)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate: providers sometimes wrap JSON in Markdown or prose.
    }
  }
  return trimmed;
}

function jsonCandidates(value: string): string[] {
  const candidates = new Set<string>([value]);
  const fencePattern = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  for (const match of value.matchAll(fencePattern)) {
    if (match[1]?.trim()) candidates.add(match[1].trim());
  }
  for (const candidate of balancedJsonSlices(value)) {
    candidates.add(candidate);
  }
  return [...candidates];
}

function balancedJsonSlices(value: string): string[] {
  const slices: string[] = [];
  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== "{" && value[start] !== "[") continue;
    const slice = balancedJsonSlice(value, start);
    if (slice) slices.push(slice);
  }
  return slices;
}

function balancedJsonSlice(value: string, start: number): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      stack.push("}");
      continue;
    }
    if (char === "[") {
      stack.push("]");
      continue;
    }
    if (char !== "}" && char !== "]") continue;
    if (stack.at(-1) !== char) return null;
    stack.pop();
    if (stack.length === 0) return value.slice(start, index + 1);
  }
  return null;
}

function unwrapAiEnvelope(value: Record<string, unknown>, depth: number): unknown {
  const firstChoice = Array.isArray(value.choices) ? value.choices.find(isRecord) : undefined;
  const choiceMessage = readRecord(firstChoice, "message");
  const choiceContent = readText(choiceMessage, "content") || readText(firstChoice, "text");
  if (choiceContent) return choiceContent;

  const message = readRecord(value, "message");
  const messageContent = readText(message, "content");
  if (messageContent) return messageContent;

  const output = readUnknown(value, "output");
  if (output && output !== value) {
    const parsedOutput = parseAiJsonishInternal(output, depth + 1);
    if (isLikelyJsonPayload(parsedOutput)) return parsedOutput;
  }

  const content = readUnknown(value, "content");
  if (content && content !== value) {
    const parsedContent = parseAiJsonishInternal(content, depth + 1);
    if (isLikelyJsonPayload(parsedContent)) return parsedContent;
  }

  return value;
}

function isLikelyJsonPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    "status",
    "character",
    "fields",
    "summary",
    "world",
    "lore",
    "narrative",
    "appearance_description",
    "portrait_prompt",
  ].some((key) => key in value);
}

type SchemaParseResult<T> = { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } };

function parseFirstSchemaMatch<T>(schema: z.ZodType<T>, ...candidates: unknown[]): SchemaParseResult<T> {
  let firstError: SchemaParseResult<T> | null = null;
  for (const candidate of candidates) {
    const parsed = schema.safeParse(candidate) as SchemaParseResult<T>;
    if (parsed.success) return parsed;
    firstError ??= parsed;
  }
  return firstError ?? (schema.safeParse(undefined) as SchemaParseResult<T>);
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

function readText(source: unknown, key: string): string {
  const value = readUnknown(source, key);
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function usageFromAiSdk(usage: LanguageModelUsage | undefined): AIUsage {
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: usage?.totalTokens ?? inputTokens + outputTokens,
  };
}

function createTimeoutSignal(timeoutSeconds: number): { signal: AbortSignal; timeoutMs: number; deadlineAt: number; timeoutMessage: string; abort: () => void; clear: () => void } {
  const controller = new AbortController();
  const normalizedTimeoutSeconds = Math.max(5, Number.isFinite(timeoutSeconds) ? Math.floor(timeoutSeconds) : 45);
  const timeoutMs = normalizedTimeoutSeconds * 1000;
  const deadlineAt = Date.now() + timeoutMs;
  const timeoutMessage = `AI SDK 调用超过设置的 ${normalizedTimeoutSeconds} 秒，已停止等待。`;
  const timeoutError = new Error(timeoutMessage);
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  return {
    signal: controller.signal,
    timeoutMs,
    deadlineAt,
    timeoutMessage,
    abort: () => {
      if (!controller.signal.aborted) controller.abort(timeoutError);
    },
    clear: () => clearTimeout(timer),
  };
}

function withHardTimeout<T>(
  promise: Promise<T>,
  timeout: { deadlineAt: number; timeoutMessage: string; abort: () => void },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const remainingMs = Math.max(0, timeout.deadlineAt - Date.now());
    const timer = setTimeout(() => {
      timeout.abort();
      reject(new Error(timeout.timeoutMessage));
    }, remainingMs + 250);

    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function aiSdkErrorMessage(error: unknown, timeoutMessage: string): string {
  const message = redactSensitive(error instanceof Error ? error.message : String(error));
  return /abort|timeout|timed out|超时|停止等待/i.test(message) ? timeoutMessage : message;
}

function outputContractFor(purpose: AIPurpose): string {
  if (purpose === "world_expand") {
    return "返回 JSON 对象，至少包含 summary；可选 openingTitle、openingNarrative、suggestedActions。";
  }
  if (purpose === "player_action") {
    return "返回 PlayerActionResult JSON：status、narrative、time_delta_minutes、events、character_updates、location_updates、relationship_updates、memory_writes、suggested_actions、warnings。";
  }
  if (purpose === "character_complete") {
    return "必须先调用 generateCharacter 和 createCharacterCard 内置 skills，再返回角色补全 JSON：status、character、used_skills、warnings。character 只包含当前表单可写字段；主角字段为 name、gender、description、goal、ability、weakness、appearance_description；关键角色字段为 name、gender、role、relationship、personality、goal、secret、action_tendency、description、appearance_description。";
  }
  if (purpose === "character_image") {
    return "返回内部角色形象卡 JSON：appearance_description（80-180 字中文具体形象描写）、portrait_prompt（可直接用于 gpt-image-2 的中文出图提示词）、card_notes（字符串数组）、warnings（字符串数组）。即便用户提供外貌，也必须保留明确约束并丰富细节。";
  }
  return "返回与 purpose 匹配的合法 JSON 对象。";
}
