import { publicEnv } from "@/lib/env/public";

/**
 * Only images from OUR Cloudinary account may be rendered (next.config.ts refuses every
 * other host, and a refused host would crash the page instead of showing a placeholder).
 * Anything else — a legacy URL, a typo, a different account — is dropped so callers fall back
 * to the neutral placeholder.
 */
export function safeProductImageUrl(url: unknown, cloudName: string = publicEnv.cloudinaryCloudName): string | null {
  if (typeof url !== "string" || !cloudName) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com") return null;
    if (!u.pathname.startsWith(`/${cloudName}/`)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Neutral stand-in shown when a product has no (usable) image. Never a stock photo. */
export const PRODUCT_PLACEHOLDER = "/images/product-placeholder.svg";
