import type { NarrativeRequest, NarrativeResponse, SafetyFlag } from "@/types/domain";
import { estimateTurnCost } from "@/domain/cost";
import { buildOpenAIChatMessages, NARRATIVE_PROMPT_CONTRACT_VERSION } from "@/services/ai/context";

const providerTimeoutMs = 45_000;

export async function generateOpenAICompatible(request: NarrativeRequest, apiKey?: string): Promise<NarrativeResponse> {
  const baseUrl = normalizeProviderBaseUrl(request.provider.baseUrl, request.provider.type);
  const body = {
    model: request.provider.model,
    temperature: request.provider.temperature,
    max_tokens: request.provider.maxTokens,
    messages: buildOpenAIChatMessages(request),
  };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), providerTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: providerHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`provider_${response.status}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("provider_empty_response");

    return {
      ...parseProviderContent(content),
      promptContractVersion: NARRATIVE_PROMPT_CONTRACT_VERSION,
      usage: estimateTurnCost(request.messages, request.userInput, request.provider.maxTokens),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("provider_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
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

function providerHeaders(apiKey?: string): HeadersInit {
  const token = apiKey?.trim();
  return token
    ? {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }
    : { "Content-Type": "application/json" };
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
