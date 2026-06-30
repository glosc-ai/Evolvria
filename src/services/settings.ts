import { callAiSdkJson } from "@/services/ai-sdk";
import { safeInvoke } from "@/services/tauri";
import type { Settings } from "@/types/domain";
import { z } from "zod";

export const DEFAULT_GLOSC_MODEL = "deepseek/deepseek-v4-pro";

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  font_size: "medium",
  fullscreen: false,
  context_panel_width: 320,
  glosc_provider: "Glosc AI",
  glosc_base_url: "https://one.gloscai.com",
  glosc_token: "",
  model: DEFAULT_GLOSC_MODEL,
  timeout_seconds: 45,
  auto_retry: true,
  confirm_ai_calls: false,
  show_usage_estimate: true,
  auto_save_enabled: true,
  debug_logs: true,
  log_level: "debug",
  developer_mode: false,
  content_preferences: "",
  local_token_risk_acknowledged: false,
  onboarding_completed: false,
};

const SETTINGS_KEY = "evolvria.settings";

export function canStoreGloscToken(token: string, acknowledged: boolean): boolean {
  return token.trim().length === 0 || acknowledged;
}

export function localTokenRiskText(): string {
  return "当前版本会把访问令牌保存在本机应用数据目录的 settings.json。请只在可信设备上保存，并避免上传或分享该文件。";
}

export interface GloscConnectionCheck {
  ok: boolean;
  status: "ok" | "error";
  message?: string;
  error?: string;
  http_status?: number;
  checked_at?: string;
}

export async function loadSettings(): Promise<Settings> {
  const native = await safeInvoke<Partial<Settings>>("load_settings");
  if (native) return { ...DEFAULT_SETTINGS, ...native };
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const saved = await safeInvoke<boolean>("save_settings", { settings });
  if (saved) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings, null, 2));
}

export async function checkGloscConnection(settings: Settings): Promise<GloscConnectionCheck> {
  let aiSdkError = "";
  if (settings.glosc_token.trim()) {
    const aiSdkResult = await callAiSdkJson({
      settings,
      purpose: "consistency_check",
      payload: { status: "ok", chat: "ok" },
      schema: z.record(z.string(), z.unknown()),
      maxOutputTokens: 80,
      temperature: 0,
    });
    if (aiSdkResult.status === "ok") {
      return {
        ok: true,
        status: "ok",
        message: "Glosc One 连接测试通过。",
        checked_at: new Date().toISOString(),
      };
    }
    aiSdkError = aiSdkResult.error ?? "AI SDK 连接测试失败。";
  }
  const result = await safeInvoke<GloscConnectionCheck>("check_glosc_connection", {
    baseUrl: settings.glosc_base_url,
    token: settings.glosc_token,
    model: settings.model,
  });
  if (result) return result;
  return {
    ok: false,
    status: "error",
    error: aiSdkError || "当前不在 Tauri 环境，无法执行原生连接测试。",
  };
}
