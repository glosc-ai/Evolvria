import { emptyPayload, validatePayloadSchema } from "@/domain/world";
import { safeInvoke } from "@/services/tauri";
import type { SavePayload } from "@/types/domain";

const ACTIVE_KEY = "evolvria.active_world";
const BACKUP_KEY = "evolvria.backups";
const AI_CHECKPOINT_KEY = "evolvria.ai_checkpoint";

export interface SaveEntry {
  kind: "active" | "backup" | "ai_checkpoint";
  path: string;
  absolute_path?: string;
  world_name: string;
  event_count: number;
  schema_valid: boolean;
  created_at: string;
}

export async function loadActiveWorld(): Promise<SavePayload> {
  const native = await safeInvoke<SavePayload>("load_active_world");
  if (native && validatePayloadSchema(native)) return native;
  const stored = localStorage.getItem(ACTIVE_KEY);
  if (!stored) return emptyPayload();
  try {
    const parsed = JSON.parse(stored);
    return validatePayloadSchema(parsed) ? parsed : emptyPayload();
  } catch {
    return emptyPayload();
  }
}

export async function saveWorld(payload: SavePayload): Promise<void> {
  if (!validatePayloadSchema(payload)) throw new Error("存档 schema 无效。");
  const native = await safeInvoke<boolean>("save_world", { payload });
  if (native) return;
  const current = localStorage.getItem(ACTIVE_KEY);
  if (current) {
    const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "[]") as string[];
    backups.push(current);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(-5)));
  }
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(payload, null, 2));
}

export async function saveAiCheckpoint(payload: SavePayload): Promise<void> {
  if (!validatePayloadSchema(payload)) return;
  const native = await safeInvoke<boolean>("save_ai_checkpoint", { payload });
  if (native) return;
  localStorage.setItem(AI_CHECKPOINT_KEY, JSON.stringify(payload, null, 2));
}

export async function listSaveEntries(): Promise<SaveEntry[]> {
  const native = await safeInvoke<SaveEntry[]>("list_save_entries");
  if (native) return native;
  const entries: SaveEntry[] = [];
  const active = localStorage.getItem(ACTIVE_KEY);
  if (active) entries.push(entryFromJson("active", "localStorage://active", active));
  const checkpoint = localStorage.getItem(AI_CHECKPOINT_KEY);
  if (checkpoint) entries.push(entryFromJson("ai_checkpoint", "localStorage://ai_checkpoint", checkpoint));
  const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "[]") as string[];
  backups
    .slice()
    .reverse()
    .forEach((backup, index) => entries.push(entryFromJson("backup", `localStorage://backup/${index}`, backup)));
  return entries;
}

export async function exportWorld(payload: SavePayload): Promise<string> {
  const native = await safeInvoke<string>("export_world", { payload });
  if (native) return native;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  return URL.createObjectURL(blob);
}

export async function importWorldFromText(text: string): Promise<SavePayload> {
  const parsed = JSON.parse(text);
  if (!validatePayloadSchema(parsed)) throw new Error("导入文件 schema 无效。");
  return parsed;
}

function entryFromJson(kind: SaveEntry["kind"], path: string, text: string): SaveEntry {
  try {
    const payload = JSON.parse(text) as SavePayload;
    return {
      kind,
      path,
      world_name: typeof payload.world === "object" && "name" in payload.world ? String(payload.world.name) : "未命名世界",
      event_count: payload.timeline?.length ?? 0,
      schema_valid: validatePayloadSchema(payload),
      created_at: payload.updated_at ?? "未知时间",
    };
  } catch {
    return { kind, path, world_name: "损坏存档", event_count: 0, schema_valid: false, created_at: "未知时间" };
  }
}
