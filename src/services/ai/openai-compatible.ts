import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { resolveProviderForModelRole } from "@/domain/ai-routing";
import type { AIModelRole } from "@/domain/ai-routing";
import type { AIProviderSettings, NarrativeRequest, NarrativeResponse, SafetyFlag } from "@/types/domain";
import { estimateTurnCost } from "@/domain/cost";
import { buildOpenAIChatMessages, NARRATIVE_PROMPT_CONTRACT_VERSION } from "@/services/ai/context";

const providerTimeoutMs = 45_000;

export async function generateOpenAICompatible(request: NarrativeRequest, apiKey?: string): Promise<NarrativeResponse> {
  const provider = resolveProviderForModelRole(request.provider, "narrative");
  const aiProvider = createAICompatibleProvider(provider, apiKey);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), providerTimeoutMs);

  try {
    const promptMessages = buildOpenAIChatMessages(request);
    const [systemMessage, ...messages] = promptMessages;
    const result = await generateText({
      model: aiProvider.chatModel(provider.model),
      instructions: systemMessage?.content,
      messages,
      temperature: provider.temperature,
      maxOutputTokens: provider.maxTokens,
      maxRetries: 0,
      abortSignal: controller.signal,
    });

    const content = result.text.trim();
    if (!content) throw new Error("provider_empty_response");

    return {
      ...parseProviderContent(content),
      promptContractVersion: NARRATIVE_PROMPT_CONTRACT_VERSION,
      usage: estimateTurnCost(request.messages, request.userInput, request.provider.maxTokens),
    };
  } catch (error) {
    throw normalizeProviderError(error);
  } finally {
    window.clearTimeout(timeout);
  }
}

export function createAICompatibleProvider(provider: AIProviderSettings, apiKey?: string, role: AIModelRole = "chat") {
  const routed = resolveProviderForModelRole(provider, role);
  const baseURL = normalizeProviderBaseUrl(routed.baseUrl, routed.type);
  return createOpenAICompatible({
    name: "glosc-one",
    apiKey: apiKey?.trim() || undefined,
    baseURL,
    includeUsage: true,
    supportsStructuredOutputs: true,
  });
}

export function normalizeProviderBaseUrl(baseUrl: string, providerType: NarrativeRequest["provider"]["type"]): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw new Error("provider_invalid_base_url");
  }
  const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
  if (!isHttp) throw new Error("provider_invalid_base_url");
  if (providerType === "local-http" && !isLocalHostname(parsed.hostname)) {
    throw new Error("provider_local_http_only");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function parseProviderContent(content: string): Pick<NarrativeResponse, "promptContractVersion" | "messages" | "relationshipDeltas" | "sceneHints" | "safetyFlags"> {
  const json = extractJson(content);
  if (json) {
    try {
      const parsed = JSON.parse(json) as Partial<NarrativeResponse>;
      if (Array.isArray(parsed.messages) && parsed.messages.length) {
        const messages = parsed.messages.map((message) => ({
          role: message.role ?? "assistant",
          speakerId: message.speakerId,
          content: String(message.content ?? "").trim(),
          sceneHints: message.sceneHints,
          safetyFlags: normalizeSafetyFlags(message.safetyFlags),
        })).filter((message) => message.content);
        if (!messages.length) return { messages: [{ role: "assistant", content, safetyFlags: ["none"] }] };
        return {
          promptContractVersion: typeof parsed.promptContractVersion === "string" ? parsed.promptContractVersion : undefined,
          messages,
          relationshipDeltas: parsed.relationshipDeltas,
          sceneHints: parsed.sceneHints,
          safetyFlags: parsed.safetyFlags,
        };
      }
    } catch {
      // Fall through to plain-text wrapping.
    }
  }
  return {
    messages: [{ role: "assistant", content, safetyFlags: ["none"] }],
  };
}

function extractJson(content: string): string | undefined {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? content.trim();
  if (!candidate.startsWith("{")) return undefined;
  return candidate;
}

function normalizeSafetyFlags(flags: SafetyFlag[] | undefined): SafetyFlag[] {
  const allowed = new Set<SafetyFlag>(["none", "mature_theme", "adult_locked", "violence", "copyright", "blocked"]);
  const normalized = flags?.filter((flag): flag is SafetyFlag => allowed.has(flag)) ?? [];
  return normalized.length ? normalized : ["none"];
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

function normalizeProviderError(error: unknown): Error {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error("provider_timeout");
  }
  if (error instanceof Error) {
    if (error.name === "AbortError" || /aborted|abort/i.test(error.message)) {
      return new Error("provider_timeout");
    }
    const statusCode = readStatusCode(error);
    if (statusCode) return new Error(`provider_${statusCode}`);
    return error;
  }
  return new Error(String(error));
}

function readStatusCode(error: Error): number | undefined {
  const record = error as Error & { statusCode?: unknown; status?: unknown; cause?: unknown };
  if (typeof record.statusCode === "number") return record.statusCode;
  if (typeof record.status === "number") return record.status;
  if (record.cause && typeof record.cause === "object") {
    const cause = record.cause as { statusCode?: unknown; status?: unknown };
    if (typeof cause.statusCode === "number") return cause.statusCode;
    if (typeof cause.status === "number") return cause.status;
  }
  return undefined;
}
