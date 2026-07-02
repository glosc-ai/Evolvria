import { createId } from "@/domain/ids";
import type { ContentRating, NarrativeResponse, SafetyFlag, ModerationCase, ModerationState, ModerationStatus } from "@/types/domain";

export type ModerationReviewOutcome = "approved" | "needs_changes" | "rejected";
export type ModerationAppealOutcome = "upheld" | "denied";

export function createModerationStatus(rating: ContentRating = "SFW", state: ModerationStatus["state"] = "draft"): ModerationStatus {
  return {
    rating,
    state,
    reasons: [],
    safetyFlags: rating === "SFW" ? ["none"] : rating === "M17" ? ["mature_theme"] : ["adult_locked"],
  };
}

export function moderationLabel(status: ModerationStatus): string {
  if (status.state === "rejected") return "Rejected";
  if (status.state === "needs_changes") return "Needs changes";
  return status.rating;
}

export function applyModerationReview(
  status: ModerationStatus,
  outcome: ModerationReviewOutcome,
  reviewedAt: string,
  reason?: string,
): ModerationStatus {
  const nextState: ModerationState = outcome === "approved" ? "approved" : outcome;
  return {
    ...status,
    state: nextState,
    reasons: outcome === "approved" ? [] : mergeReasons(status.reasons, reason),
    reviewedAt,
  };
}

export function createModerationAppeal(moderationCase: ModerationCase, reason: string, createdAt: string): ModerationCase {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("appeal_reason_required");
  if (!["actioned", "dismissed"].includes(moderationCase.status)) {
    throw new Error("appeal_not_allowed");
  }
  return {
    ...moderationCase,
    status: "appealed",
    appeal: {
      id: createId("appeal"),
      reason: trimmed,
      status: "open",
      createdAt,
      updatedAt: createdAt,
    },
    updatedAt: createdAt,
  };
}

export function resolveModerationAppeal(
  moderationCase: ModerationCase,
  outcome: ModerationAppealOutcome,
  resolvedAt: string,
  resolutionNote?: string,
): ModerationCase {
  if (!moderationCase.appeal || moderationCase.status !== "appealed") {
    throw new Error("appeal_not_open");
  }
  return {
    ...moderationCase,
    status: outcome === "upheld" ? "dismissed" : "actioned",
    appeal: {
      ...moderationCase.appeal,
      status: outcome,
      updatedAt: resolvedAt,
      resolvedAt,
      resolutionNote: resolutionNote?.trim() || undefined,
    },
    updatedAt: resolvedAt,
  };
}

export function precheckContent(input: string, adultUnlocked: boolean): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  const lowered = input.toLowerCase();
  if (lowered.includes("adult") || lowered.includes("18+") || input.includes("成人")) flags.push("adult_locked");
  if (lowered.includes("graphic violence") || input.includes("血腥")) flags.push("violence");
  if (lowered.includes("copyright") || lowered.includes("isekai zero") || input.includes("异世界ZERO")) flags.push("copyright");
  if (!adultUnlocked && flags.includes("adult_locked")) flags.push("blocked");
  return flags.length ? flags : ["none"];
}

export interface PostcheckedNarrativeResponse {
  response: NarrativeResponse;
  flags: SafetyFlag[];
  blocked: boolean;
}

export function postcheckNarrativeResponse(response: NarrativeResponse, adultUnlocked: boolean): PostcheckedNarrativeResponse {
  const messageFlags = response.messages.flatMap((message) =>
    mergeSafetyFlags(message.safetyFlags ?? ["none"], precheckContent(message.content, adultUnlocked)),
  );
  const flags = mergeSafetyFlags(response.safetyFlags ?? ["none"], messageFlags);
  const blocked = flags.includes("blocked") || flags.includes("copyright");

  if (blocked) {
    const safetyFlags = mergeSafetyFlags(flags, ["blocked"]);
    return {
      flags: safetyFlags,
      blocked: true,
      response: {
        ...response,
        safetyFlags,
        relationshipDeltas: [],
        sceneHints: [],
        messages: [
          {
            role: "system",
            content: "AI 输出被本地安全后置检查过滤。已保留你的输入和上下文，请调整安全边界、切换模型或重试。",
            safetyFlags,
          },
        ],
      },
    };
  }

  return {
    flags,
    blocked: false,
    response: {
      ...response,
      safetyFlags: flags,
      messages: response.messages.map((message) => ({
        ...message,
        safetyFlags: mergeSafetyFlags(message.safetyFlags ?? ["none"], precheckContent(message.content, adultUnlocked)),
      })),
    },
  };
}

export function mergeSafetyFlags(...groups: SafetyFlag[][]): SafetyFlag[] {
  const merged = [...new Set(groups.flat())].filter((flag) => flag !== "none");
  return merged.length ? merged : ["none"];
}

function mergeReasons(existing: string[], reason?: string): string[] {
  const trimmed = reason?.trim();
  return trimmed ? [...new Set([...existing, trimmed])] : existing;
}
