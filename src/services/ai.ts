import { mockPlayerAction } from "@/domain/fixtures";
import { safeInvoke } from "@/services/tauri";
import type { PlayerActionResult, Settings, WorldSeed } from "@/types/domain";

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

const PURPOSE_LABELS: Record<string, string> = {
  world_expand: "世界扩写",
  player_action: "玩家行动",
  npc_simulation: "NPC 模拟",
  memory_extract: "记忆抽取",
  summary_update: "阶段摘要",
  consistency_check: "一致性检查",
};

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
    billing_note: remote ? "将消耗 Glosc One 额度" : "未配置 Glosc One：本地模拟不消耗远端额度",
    risk_level: purpose === "world_expand" ? "高" : remote ? "中" : "低",
    risk_reasons: remote ? ["会发送当前场景和相关记忆到 Glosc One"] : ["本地 mock 不发送网络请求"],
    retry_note: settings.auto_retry ? "失败时会按设置自动重试一次" : "失败时不会自动重试",
  };
}

export function estimateUsageText(estimate: UsageEstimate): string {
  return `${estimate.purpose_label} · 预计 Token ${estimate.total_tokens}（输入 ${estimate.input_tokens} / 输出 ${estimate.output_tokens}）· 风险 ${estimate.risk_level} · ${estimate.billing_note}`;
}

export async function generateWorld(seed: WorldSeed, settings: Settings): Promise<{ status: "ok" | "error"; summary: string; usage: { input_tokens: number; output_tokens: number } }> {
  if (!isGloscConfigured(settings)) {
    return {
      status: "ok",
      summary: `${seed.world_name} 已根据 ${seed.genre}/${seed.tone} 设定完成本地扩写。`,
      usage: { input_tokens: 860, output_tokens: 1080 },
    };
  }
  const result = await safeInvoke<{ status: "ok" | "error"; content?: string; error?: string; usage?: { input_tokens: number; output_tokens: number } }>("call_glosc", {
    request: {
      baseUrl: settings.glosc_base_url,
      token: settings.glosc_token,
      model: settings.model,
      purpose: "world_expand",
      payload: seed,
      timeoutSeconds: settings.timeout_seconds,
    },
  });
  if (!result || result.status !== "ok") {
    return { status: "error", summary: result?.error ?? "Glosc One 调用失败。", usage: { input_tokens: 0, output_tokens: 0 } };
  }
  return { status: "ok", summary: result.content ?? `${seed.world_name} 扩写完成。`, usage: result.usage ?? { input_tokens: 0, output_tokens: 0 } };
}

export async function resolvePlayerAction(action: string, context: unknown, settings: Settings): Promise<PlayerActionResult> {
  if (!isGloscConfigured(settings)) {
    return mockPlayerAction(action);
  }
  const result = await safeInvoke<PlayerActionResult>("call_glosc", {
    request: {
      baseUrl: settings.glosc_base_url,
      token: settings.glosc_token,
      model: settings.model,
      purpose: "player_action",
      payload: { action, context },
      timeoutSeconds: settings.timeout_seconds,
    },
  });
  if (result?.status === "ok" && "narrative" in result) return result;
  return { ...mockPlayerAction(action), warnings: ["远端响应不可用，已使用本地模拟结果。"] };
}
