import { createId, nowIso } from "@/domain/ids";
import { createModerationStatus } from "@/domain/moderation";
import { invokeOptional } from "@/services/tauri";
import type { MediaAsset, MediaVariant } from "@/types/domain";

export async function importBrowserMedia(file: File, purpose: MediaAsset["purpose"]): Promise<MediaAsset> {
  const id = createId("media");
  const kind = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("audio/")
      ? "audio"
      : file.type.startsWith("video/")
        ? "video"
        : "document";
  return {
    id,
    kind,
    purpose,
    relativePath: `browser://${file.name}`,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    variants: [],
    altText: file.name,
    source: { kind: "imported", label: "浏览器本地文件引用" },
    license: { kind: "unknown", note: "请在标记本地就绪或发布前确认所有权。" },
    safety: createModerationStatus("SFW", "draft"),
    createdAt: nowIso(),
  };
}

export function createBrowserGeneratedImageAsset(input: {
  bytes: Uint8Array;
  mediaType: string;
  purpose: MediaAsset["purpose"];
  prompt: string;
  model: string;
}): MediaAsset {
  const id = createId("media");
  return {
    id,
    kind: "image",
    purpose: input.purpose,
    relativePath: `browser://generated/${id}.${extensionForImageMediaType(input.mediaType)}`,
    mimeType: input.mediaType || "image/png",
    sizeBytes: input.bytes.byteLength,
    variants: [],
    altText: `生成图片：${input.prompt.replace(/\s+/g, " ").slice(0, 120)}`,
    source: { kind: "generated", label: `浏览器生成图片：${input.model}` },
    license: { kind: "owned", note: "通过已配置 AI 提供方生成；发布前请审校。" },
    safety: createModerationStatus("SFW", "draft"),
    createdAt: nowIso(),
  };
}

export async function importTauriMedia(workspaceId: string, path: string, purpose: MediaAsset["purpose"]): Promise<MediaAsset | undefined> {
  return invokeOptional<MediaAsset>("media_import", { workspaceId, path, purpose });
}

export async function pickAndImportTauriMedia(workspaceId: string, purpose: MediaAsset["purpose"]): Promise<MediaAsset | undefined> {
  const asset = await invokeOptional<MediaAsset | null>("media_pick_and_import", { workspaceId, purpose });
  return asset ?? undefined;
}

export async function readTauriMediaDataUrl(workspaceId: string, asset: MediaAsset): Promise<string | undefined> {
  if (!asset.relativePath.trim()) return undefined;
  if (asset.relativePath.startsWith("browser://")) return undefined;
  if (!["image", "audio", "video"].includes(asset.kind)) return undefined;
  return invokeOptional<string>("media_read_data_url", { workspaceId, relativePath: asset.relativePath });
}

export async function generateTauriMediaThumbnail(workspaceId: string, assetId: string, size = 320): Promise<MediaVariant | undefined> {
  return invokeOptional<MediaVariant>("media_thumbnail", { workspaceId, assetId, size });
}

export async function writeGeneratedTauriImage(input: {
  workspaceId: string;
  bytes: Uint8Array;
  mimeType: string;
  purpose: MediaAsset["purpose"];
  prompt: string;
}): Promise<MediaAsset | undefined> {
  return invokeOptional<MediaAsset>("media_write_generated_image", {
    workspaceId: input.workspaceId,
    bytes: Array.from(input.bytes),
    mimeType: input.mimeType,
    purpose: input.purpose,
    prompt: input.prompt,
  });
}

function extensionForImageMediaType(mediaType: string): string {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/gif") return "gif";
  return "png";
}
