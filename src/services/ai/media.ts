import { generateImage } from "ai";
import { resolveProviderForModelRole } from "@/domain/ai-routing";
import { createBrowserGeneratedImageAsset, writeGeneratedTauriImage } from "@/services/media";
import { getSecret } from "@/services/repositories/workspace";
import { createAICompatibleProvider } from "@/services/ai/openai-compatible";
import type { AIProviderSettings, MediaAsset, MediaGenerationJob } from "@/types/domain";

const imageGenerationTimeoutMs = 90_000;

export async function generateProviderImageAsset(input: {
  workspaceId: string;
  provider: AIProviderSettings;
  job: MediaGenerationJob;
}): Promise<MediaAsset | undefined> {
  if (input.provider.type !== "openai-compatible" || input.job.kind !== "image") return undefined;
  const apiKey = await getSecret("openai-compatible-api-key");
  if (!apiKey) return undefined;

  const routed = resolveProviderForModelRole(input.provider, "image");
  const aiProvider = createAICompatibleProvider(input.provider, apiKey, "image");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), imageGenerationTimeoutMs);
  try {
    const prompt = [input.job.prompt, input.job.style].filter(Boolean).join("\n");
    const result = await generateImage({
      model: aiProvider.imageModel(routed.model),
      prompt,
      aspectRatio: "16:9",
      n: 1,
      maxRetries: 0,
      abortSignal: controller.signal,
    });
    const image = result.image;
    const asset = await writeGeneratedTauriImage({
      workspaceId: input.workspaceId,
      bytes: image.uint8Array,
      mimeType: image.mediaType,
      purpose: "background",
      prompt,
    });
    return asset ?? createBrowserGeneratedImageAsset({
      bytes: image.uint8Array,
      mediaType: image.mediaType,
      purpose: "background",
      prompt,
      model: routed.model,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}
