import { createId } from "@/domain/ids";
import type { AccountAgeGate, AccountPermission, CloudAccountSession } from "@/types/domain";

export interface LocalAccountInput {
  displayName: string;
  email?: string;
  ageGate: AccountAgeGate;
}

export function createLocalAccountSession(input: LocalAccountInput, createdAt: string): CloudAccountSession {
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("account_display_name_required");
  const email = normalizeEmail(input.email);
  return {
    id: createId("acct"),
    displayName,
    email,
    ageGate: input.ageGate,
    permissions: permissionsForAgeGate(input.ageGate),
    status: "local_preview",
    createdAt,
    updatedAt: createdAt,
  };
}

export function updateAccountAgeGate(session: CloudAccountSession, ageGate: AccountAgeGate, updatedAt: string): CloudAccountSession {
  return {
    ...session,
    ageGate,
    permissions: permissionsForAgeGate(ageGate),
    updatedAt,
  };
}

export function permissionsForAgeGate(ageGate: AccountAgeGate): AccountPermission[] {
  if (ageGate === "adult") return ["sync", "publish", "billing", "adult_content"];
  if (ageGate === "minor") return ["sync"];
  return ["sync", "publish"];
}

function normalizeEmail(email?: string): string | undefined {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new Error("account_email_invalid");
  return trimmed;
}
