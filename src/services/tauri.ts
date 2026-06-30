import { invoke } from "@tauri-apps/api/core";

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export function jsonSafeInvokeArgs(args?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!args) return undefined;
  return JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
}

export async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<T>(command, jsonSafeInvokeArgs(args));
}
