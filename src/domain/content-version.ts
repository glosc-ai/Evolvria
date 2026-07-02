import type { ContentRating, ContentVersion, ModerationStatus } from "@/types/domain";

export interface DraftVersionInput {
  version?: string;
  changelog?: string;
}

export function prepareVersionForDraftEdit(current: ContentVersion, input: DraftVersionInput): ContentVersion {
  const nextVersion = normalizeVersion(input.version, current.version);
  const nextChangelog = input.changelog?.trim() || current.changelog || "Local draft updated.";
  const lockedStatus = current.status !== "draft";
  return {
    ...current,
    version: nextVersion,
    changelog: nextChangelog,
    baseVersionId: lockedStatus ? current.baseVersionId ?? current.version : current.baseVersionId,
    status: "draft",
  };
}

export function resetModerationForDraftEdit(current: ModerationStatus, rating: ContentRating = current.rating): ModerationStatus {
  return {
    ...current,
    rating,
    state: "draft",
    reasons: current.state === "draft" ? current.reasons : [],
    reviewedAt: current.state === "draft" ? current.reviewedAt : undefined,
    reviewerId: current.state === "draft" ? current.reviewerId : undefined,
  };
}

function normalizeVersion(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\s+/g, "-").slice(0, 40);
}
