/**
 * Cloudinary DELIVERY helpers — safe for browser and server (no secrets).
 *
 * Strategy: the database stores the Cloudinary `public_id` (plus the secure URL
 * at upload time). Pages build delivery URLs from the public_id with the named
 * presets below, so image sizes/formats can change without touching data, and
 * every image is served as f_auto (AVIF/WebP) and q_auto.
 */
const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

export const IMAGE_PRESETS = {
  thumb: { w: 160, h: 160, crop: "fill" },
  card: { w: 600, h: 600, crop: "fill" },
  detail: { w: 1000, h: 1000, crop: "fit" }, // "fit": never crops away product/label detail
  hero: { w: 1600, h: 900, crop: "fill" },
} as const;
export type ImagePreset = keyof typeof IMAGE_PRESETS;

const PUBLIC_ID = /^plants-and-pure\/[A-Za-z0-9/_-]+$/;

export function isValidPublicId(id: string): boolean {
  return PUBLIC_ID.test(id) && !id.includes("//") && !id.includes("..");
}

/** Returns null when Cloudinary is not configured or the id is not one of ours. */
export function cloudinaryUrl(publicId: string, preset: ImagePreset = "card", cloudName: string | undefined = CLOUD): string | null {
  if (!cloudName || !isValidPublicId(publicId)) return null;
  const p = IMAGE_PRESETS[preset];
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,c_${p.crop},w_${p.w},h_${p.h}/${publicId}`;
}
