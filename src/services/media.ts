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
    source: { kind: "imported", label: "Browser local file reference" },
    license: { kind: "unknown", note: "Confirm ownership before local_ready or publish." },
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
