import { estimateTokens } from "@/domain/cost";
import { createId, nowIso } from "@/domain/ids";
import { createModerationStatus } from "@/domain/moderation";
import type { CreditLedgerEntry, MediaAsset, MediaGenerationJob, MediaGenerationKind, SafetyFlag } from "@/types/domain";

export interface MediaGenerationJobInput {
  kind: MediaGenerationKind;
  storylineId: string;
  chatId?: string;
  messageId?: string;
  speakerId?: string;
  prompt: string;
  style?: string;
  voiceText?: string;
  provider: string;
  model: string;
  safetyFlags?: SafetyFlag[];
}

export function createMediaGenerationJob(input: MediaGenerationJobInput, createdAt = nowIso()): MediaGenerationJob {
  const safetyFlags: SafetyFlag[] = input.safetyFlags?.length ? input.safetyFlags : ["none"];
  return {
    id: createId("genjob"),
    kind: input.kind,
    storylineId: input.storylineId,
    chatId: input.chatId,
    messageId: input.messageId,
    speakerId: input.speakerId,
    prompt: input.prompt.trim(),
    style: input.style?.trim() || undefined,
    voiceText: input.voiceText?.trim() || undefined,
    provider: input.provider,
    model: input.model,
    status: safetyFlags.includes("blocked") ? "blocked" : "queued",
    safetyFlags,
    error: safetyFlags.includes("blocked") ? "Blocked by local safety precheck." : undefined,
    createdAt,
    updatedAt: createdAt,
  };
}

export function startMediaGenerationJob(job: MediaGenerationJob, startedAt = nowIso()): MediaGenerationJob {
  if (job.status === "blocked") return job;
  return {
    ...job,
    status: "running",
    updatedAt: startedAt,
    error: undefined,
  };
}

export function failMediaGenerationJob(job: MediaGenerationJob, error: string, failedAt = nowIso()): MediaGenerationJob {
  return {
    ...job,
    status: "failed",
    error,
    updatedAt: failedAt,
  };
}

export function completeMockMediaGenerationJob(job: MediaGenerationJob, completedAt = nowIso()): {
  job: MediaGenerationJob;
  asset: MediaAsset;
  ledgerEntry: CreditLedgerEntry;
} {
  const assetId = createId("media");
  const ledgerEntryId = createId("ledger");
  const isVoice = job.kind === "voice";
  const isVideo = job.kind === "video";
  const asset: MediaAsset = {
    id: assetId,
    kind: isVoice ? "audio" : isVideo ? "video" : "image",
    purpose: isVoice ? "voice" : "background",
    relativePath: "",
    mimeType: isVoice ? "audio/mock-placeholder" : isVideo ? "video/mock-placeholder" : "image/mock-placeholder",
    width: job.kind === "image" ? 1280 : undefined,
    height: job.kind === "image" ? 720 : undefined,
    durationMs: isVoice ? Math.max(1200, (job.voiceText ?? job.prompt).length * 80) : isVideo ? 5000 : undefined,
    sizeBytes: 0,
    variants: [],
    altText: buildGeneratedAltText(job),
    source: { kind: "generated", label: `本地模拟${mediaKindLabel(job.kind)}生成：${job.model}` },
    license: { kind: "owned", note: "本地模拟生成占位素材；发布前请替换为已审校的生成媒体。" },
    safety: createModerationStatus("SFW", job.safetyFlags.includes("blocked") ? "rejected" : "draft"),
    createdAt: completedAt,
  };
  const ledgerEntry: CreditLedgerEntry = {
    id: ledgerEntryId,
    chatId: job.chatId,
    provider: job.provider,
    model: job.model,
    operation: job.kind,
    estimatedTokens: estimateTokens([job.prompt, job.style, job.voiceText].filter(Boolean).join("\n")),
    estimatedCost: 0,
    status: "estimated",
    adjustmentIds: [],
    currency: "local_estimate",
    createdAt: completedAt,
  };
  return {
    job: {
      ...job,
      status: "completed",
      assetId,
      ledgerEntryId,
      updatedAt: completedAt,
      completedAt,
      error: undefined,
    },
    asset,
    ledgerEntry,
  };
}

export function completeMediaGenerationJobWithAsset(job: MediaGenerationJob, asset: MediaAsset, completedAt = nowIso()): {
  job: MediaGenerationJob;
  ledgerEntry: CreditLedgerEntry;
} {
  const ledgerEntryId = createId("ledger");
  const ledgerEntry: CreditLedgerEntry = {
    id: ledgerEntryId,
    chatId: job.chatId,
    provider: job.provider,
    model: job.model,
    operation: job.kind,
    estimatedTokens: estimateTokens([job.prompt, job.style, job.voiceText].filter(Boolean).join("\n")),
    estimatedCost: 0,
    status: "estimated",
    adjustmentIds: [],
    currency: "local_estimate",
    createdAt: completedAt,
  };

  return {
    job: {
      ...job,
      status: "completed",
      assetId: asset.id,
      ledgerEntryId,
      updatedAt: completedAt,
      completedAt,
      error: undefined,
    },
    ledgerEntry,
  };
}

function buildGeneratedAltText(job: MediaGenerationJob): string {
  const source = job.kind === "voice" ? job.voiceText || job.prompt : job.prompt;
  const label = job.kind === "voice"
    ? "生成语音占位"
    : job.kind === "video"
      ? "生成场景视频占位"
      : "生成场景图片占位";
  return `${label}: ${source.replace(/\s+/g, " ").slice(0, 120)}`;
}

function mediaKindLabel(kind: MediaGenerationKind): string {
  if (kind === "voice") return "语音";
  if (kind === "video") return "视频";
  return "图片";
}
