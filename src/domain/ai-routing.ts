import type { AIProviderSettings, MediaGenerationKind } from "@/types/domain";

export const GLOSC_ONE_ORIGIN = "https://one.gloscai.com";
export const GLOSC_ONE_BASE_URL = `${GLOSC_ONE_ORIGIN}/v1`;

export const AI_MODEL_IDS = {
  chat: "zai/glm-5.2",
  content: "deepseek/deepseek-v4-flash",
  narrative: "deepseek/deepseek-v4-pro",
  image: "openai/gpt-image-2",
  video: "bytedance/doubao-seedance-2-0",
  voice: "alibaba/qwen3-tts-instruct-flash",
} as const;

export type AIModelRole = keyof typeof AI_MODEL_IDS;

export const DEFAULT_GLOSC_PROVIDER: AIProviderSettings = {
  type: "openai-compatible",
  baseUrl: GLOSC_ONE_BASE_URL,
  model: AI_MODEL_IDS.chat,
  temperature: 0.75,
  maxTokens: 900,
};

export function resolveProviderForModelRole(provider: AIProviderSettings, role: AIModelRole): AIProviderSettings {
  if (provider.type === "openai-compatible" && isGloscOneBaseUrl(provider.baseUrl)) {
    return {
      ...provider,
      baseUrl: GLOSC_ONE_BASE_URL,
      model: AI_MODEL_IDS[role],
    };
  }
  return provider;
}

export function modelForMediaGenerationKind(kind: MediaGenerationKind): string {
  if (kind === "image") return AI_MODEL_IDS.image;
  if (kind === "video") return AI_MODEL_IDS.video;
  return AI_MODEL_IDS.voice;
}

export function providerLabelForMediaGeneration(provider: AIProviderSettings): string {
  if (provider.type === "openai-compatible" && isGloscOneBaseUrl(provider.baseUrl)) {
    return "glosc-one";
  }
  return provider.type;
}

export function isGloscOneBaseUrl(baseUrl: string): boolean {
  try {
    const normalized = normalizeComparableUrl(baseUrl);
    return normalized === normalizeComparableUrl(GLOSC_ONE_BASE_URL)
      || normalized === normalizeComparableUrl(GLOSC_ONE_ORIGIN);
  } catch {
    return false;
  }
}

function normalizeComparableUrl(input: string): string {
  const parsed = new URL(input.trim());
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}
