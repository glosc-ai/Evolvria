import { invoke } from "@tauri-apps/api/core";

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<T>(command, args);
}
