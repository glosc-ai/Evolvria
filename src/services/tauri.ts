import { invoke } from "@tauri-apps/api/core";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export async function invokeOptional<T>(command: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauriRuntime()) return undefined;
  return invoke<T>(command, args);
}
