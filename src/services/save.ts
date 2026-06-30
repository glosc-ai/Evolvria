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

export interface ExportWorldResult {
  path: string;
  cancelled: boolean;
}

interface BrowserSaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}

interface BrowserWritableFileStream {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}

interface BrowserFileSystemFileHandle {
  name: string;
  createWritable(): Promise<BrowserWritableFileStream>;
}

interface BrowserWindowWithSavePicker extends Window {
  showSaveFilePicker?: (options?: BrowserSaveFilePickerOptions) => Promise<BrowserFileSystemFileHandle>;
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

export async function deleteSaveEntry(entry: SaveEntry): Promise<void> {
  const native = await safeInvoke<boolean>("delete_save_entry", { path: entry.absolute_path ?? entry.path });
  if (native !== null) return;
  if (entry.kind === "active") {
    localStorage.removeItem(ACTIVE_KEY);
    return;
  }
  if (entry.kind === "ai_checkpoint") {
    localStorage.removeItem(AI_CHECKPOINT_KEY);
    return;
  }
  const match = entry.path.match(/^localStorage:\/\/backup\/(\d+)$/);
  if (!match) throw new Error("无法删除该存档。");
  const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "[]") as string[];
  const reversedIndex = Number(match[1]);
  const storedIndex = backups.length - 1 - reversedIndex;
  if (storedIndex < 0 || storedIndex >= backups.length) throw new Error("存档不存在。");
  backups.splice(storedIndex, 1);
  localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
}

export async function exportWorld(payload: SavePayload): Promise<ExportWorldResult> {
  if (!validatePayloadSchema(payload)) throw new Error("存档 schema 无效。");
  const native = await safeInvoke<ExportWorldResult>("export_world", { payload });
  if (native) return native;
  const fileName = defaultExportFileName(payload, "json");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const savePicker = (window as BrowserWindowWithSavePicker).showSaveFilePicker;
  if (savePicker) {
    try {
      const handle = await savePicker({
        suggestedName: fileName,
        types: [{ description: "Evolvria JSON 存档", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { path: handle.name, cancelled: false };
    } catch (error) {
      if (isAbortError(error)) return { path: "", cancelled: true };
      throw error;
    }
  }
  downloadBlob(blob, fileName);
  return { path: fileName, cancelled: false };
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

function defaultExportFileName(payload: SavePayload, extension: "json" | "zip"): string {
  const worldId = "id" in payload.world && typeof payload.world.id === "string" ? payload.world.id : "world";
  const safeWorldId = sanitizeFileComponent(worldId);
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `${safeWorldId}_${timestamp}.${extension}`;
}

function sanitizeFileComponent(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized.replace(/_/g, "").length > 0 ? sanitized : "world";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
