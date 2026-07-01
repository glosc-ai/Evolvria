import { createOpenAI } from "@ai-sdk/openai";
import { isStepCount, Output, ToolLoopAgent, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { createEvolvriaBuiltInSkills, createEvolvriaSkillRuntime, loadPublicSkillDefinitions, skillManifest } from "@/services/ai-skills";
import type { AIPurpose, AIUsage, Settings } from "@/types/domain";

const SYSTEM_PROMPT =
  "你是 Evolvria 的叙事与世界模拟引擎。只返回合法 JSON，不要输出 JSON 以外的内容。若 payload 中包含 workspace_context，必须先遵循其中 AGENTS.md 的加载顺序和规则，再使用其他已加载文件。你可以调用内置 skills 来初始化世界、推进世界进度、触发玩家行为、记录事件、记录日志、生成角色和查询工作区存档格式；这些 skills 已绑定当前请求的 seed/action/context/payload（如适用），调用时传入最小必要参数，不要复制完整 payload。调用后仍必须按 output_contract 汇总为最终 JSON。";

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
}

export interface AiSdkCallResult<T> {
  status: "ok" | "error";
  content?: string;
  parsed?: T;
  error?: string;
  usage?: AIUsage;
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
  const timeout = createTimeoutSignal(options.settings.timeout_seconds);

  try {
    const publicSkills = await loadPublicSkillDefinitions();
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
    const result = await agent.generate({
      prompt: JSON.stringify({
        purpose: options.purpose,
        payload: options.payload,
        available_skills: skillManifest(publicSkills),
        output_contract: outputContractFor(options.purpose),
      }),
      abortSignal: timeout.signal,
    });
    const parsed = options.schema.safeParse(result.output);
    if (!parsed.success) {
      return {
        status: "error",
        content: result.text,
        error: `AI SDK 响应结构不符合契约：${parsed.error.issues.map((issue) => issue.message).join("；")}`,
        usage: usageFromAiSdk(result.usage),
      };
    }
    return {
      status: "ok",
      content: result.text,
      parsed: parsed.data,
      usage: usageFromAiSdk(result.usage),
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    timeout.clear();
  }
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

function createTimeoutSignal(timeoutSeconds: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeoutMs = Math.max(5, timeoutSeconds) * 1000;
  const timer = setTimeout(() => controller.abort(new Error("AI SDK 调用超时。")), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function outputContractFor(purpose: AIPurpose): string {
  if (purpose === "world_expand") {
    return "返回 JSON 对象，至少包含 summary；可选 openingTitle、openingNarrative、suggestedActions。";
  }
  if (purpose === "player_action") {
    return "返回 PlayerActionResult JSON：status、narrative、time_delta_minutes、events、character_updates、location_updates、relationship_updates、memory_writes、suggested_actions、warnings。";
  }
  if (purpose === "character_image") {
    return "返回内部角色形象卡 JSON：appearance_description（80-180 字中文具体形象描写）、portrait_prompt（可直接用于 gpt-image-2 的中文出图提示词）、card_notes（字符串数组）、warnings（字符串数组）。即便用户提供外貌，也必须保留明确约束并丰富细节。";
  }
  return "返回与 purpose 匹配的合法 JSON 对象。";
}
