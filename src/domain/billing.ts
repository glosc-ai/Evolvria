import type { CreditAdjustment, CreditLedgerEntry, CreatorEarning, CreatorPayoutRequest } from "@/types/domain";

export function ledgerAdjustmentAmount(entry: CreditLedgerEntry): number {
  return entry.actualCost ?? entry.estimatedCost;
}

export function creditStatusAfterAdjustment(kind: CreditAdjustment["kind"]): CreditLedgerEntry["status"] {
  if (kind === "refund") return "refunded";
  if (kind === "reversal") return "reversed";
  if (kind === "freeze") return "frozen";
  return "pending";
}

export function createCreditAdjustment(
  entry: CreditLedgerEntry,
  input: { id: string; kind: CreditAdjustment["kind"]; reason: string; createdAt: string },
): CreditAdjustment {
  return {
    id: input.id,
    ledgerEntryId: entry.id,
    kind: input.kind,
    amount: ledgerAdjustmentAmount(entry),
    reason: input.reason,
    createdAt: input.createdAt,
  };
}

export function applyCreditAdjustment(entry: CreditLedgerEntry, adjustment: CreditAdjustment): CreditLedgerEntry {
  return {
    ...entry,
    status: creditStatusAfterAdjustment(adjustment.kind),
    adjustmentIds: [...(entry.adjustmentIds ?? []), adjustment.id],
  };
}

export interface CreatorEarningTotals {
  estimated: number;
  pending: number;
  available: number;
  withheld: number;
  paid: number;
  reversed: number;
}

export type CreatorPayoutResolution = "approve" | "pay" | "reject" | "block";

export function calculateCreatorEarningTotals(earnings: CreatorEarning[]): CreatorEarningTotals {
  const totals: CreatorEarningTotals = {
    estimated: 0,
    pending: 0,
    available: 0,
    withheld: 0,
    paid: 0,
    reversed: 0,
  };
  for (const earning of earnings) {
    totals[earning.status] = roundCredits(totals[earning.status] + earning.amount);
  }
  return totals;
}

export function eligiblePayoutEarnings(earnings: CreatorEarning[]): CreatorEarning[] {
  return earnings
    .filter((earning) => earning.status === "available" && earning.amount > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createCreatorPayoutRequest(
  earnings: CreatorEarning[],
  input: { id: string; creatorId: string; note: string; requestedAt: string },
): CreatorPayoutRequest {
  const eligible = eligiblePayoutEarnings(earnings).filter((earning) => earning.creatorId === input.creatorId);
  const amount = roundCredits(eligible.reduce((sum, earning) => sum + earning.amount, 0));
  if (!eligible.length || amount <= 0) throw new Error("payout_no_available_earnings");
  return {
    id: input.id,
    creatorId: input.creatorId,
    earningIds: eligible.map((earning) => earning.id),
    amount,
    currency: "credit",
    status: "requested",
    riskFlags: amount >= 50 ? ["manual_review_required"] : [],
    note: input.note.trim() || "Local payout preview request.",
    requestedAt: input.requestedAt,
    updatedAt: input.requestedAt,
  };
}

export function applyPayoutRequestToEarnings(
  earnings: Record<string, CreatorEarning>,
  request: CreatorPayoutRequest,
): Record<string, CreatorEarning> {
  return Object.fromEntries(Object.entries(earnings).map(([id, earning]) => [
    id,
    request.earningIds.includes(id) && earning.status === "available"
      ? { ...earning, status: "pending", note: `${earning.note} Payout preview ${request.id} requested.` }
      : earning,
  ]));
}

export function resolveCreatorPayoutRequest(
  request: CreatorPayoutRequest,
  outcome: CreatorPayoutResolution,
  resolvedAt: string,
  note: string,
): CreatorPayoutRequest {
  const status: CreatorPayoutRequest["status"] = outcome === "approve"
    ? "approved"
    : outcome === "pay"
      ? "paid"
      : outcome === "block"
        ? "blocked"
        : "rejected";
  return {
    ...request,
    status,
    updatedAt: resolvedAt,
    resolvedAt,
    resolutionNote: note.trim() || `Local payout ${status}.`,
    riskFlags: outcome === "block"
      ? [...new Set([...request.riskFlags, "withheld_for_review"])]
      : request.riskFlags,
  };
}

export function applyPayoutResolutionToEarnings(
  earnings: Record<string, CreatorEarning>,
  request: CreatorPayoutRequest,
): Record<string, CreatorEarning> {
  return Object.fromEntries(Object.entries(earnings).map(([id, earning]) => {
    if (!request.earningIds.includes(id)) return [id, earning];
    if (request.status === "paid") return [id, { ...earning, status: "paid", note: `${earning.note} Paid by payout preview ${request.id}.` }];
    if (request.status === "rejected") return [id, { ...earning, status: "available", note: `${earning.note} Payout preview ${request.id} rejected; returned to available.` }];
    if (request.status === "blocked") return [id, { ...earning, status: "withheld", note: `${earning.note} Withheld by payout risk review ${request.id}.` }];
    return [id, earning];
  }));
}

export function updateCreatorEarningStatus(
  earning: CreatorEarning,
  status: CreatorEarning["status"],
  note: string,
): CreatorEarning {
  return {
    ...earning,
    status,
    note: note.trim() || earning.note,
  };
}

function roundCredits(value: number): number {
  return Number(value.toFixed(2));
}
