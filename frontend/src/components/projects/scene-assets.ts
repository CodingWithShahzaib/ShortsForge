import type { Asset } from "@/lib/types";
import { getMediaUrl } from "@/lib/api";

export function pickLatestAsset(assets: Asset[] | undefined, type: string): Asset | undefined {
  if (!assets?.length) return undefined;
  return [...assets]
    .filter((a) => a.type === type && a.is_active !== false)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

export function assetMediaSrc(asset: Asset | undefined): string {
  if (!asset) return "";
  return getMediaUrl(asset.url || asset.file_path || "");
}
