import type { CreditAdjustment, CreditLedgerEntry } from "@/types/domain";

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
