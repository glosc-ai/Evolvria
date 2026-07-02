import { getSecret } from "@/services/repositories/workspace";
import { generateMockNarrative } from "@/services/ai/mock";
import { generateOpenAICompatible } from "@/services/ai/openai-compatible";
import type { NarrativeRequest, NarrativeResponse } from "@/types/domain";

export async function generateNarrative(request: NarrativeRequest): Promise<NarrativeResponse> {
  if (request.provider.type === "openai-compatible") {
    const key = await getSecret("openai-compatible-api-key");
    if (key) return generateOpenAICompatible(request, key);
  }
  if (request.provider.type === "local-http") {
    const key = await getSecret("openai-compatible-api-key");
    return generateOpenAICompatible(request, key);
  }
  return generateMockNarrative(request);
}
