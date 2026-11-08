import { getSupabase } from "./supabase";
import { CLOUDINARY_CLOUD_NAME } from "./supabase-config";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
/** Name of the *unsigned* upload preset created in Cloudinary (Settings → Upload → Upload presets). */
export const CLOUDINARY_UPLOAD_PRESET = (env.VITE_CLOUDINARY_UPLOAD_PRESET ?? "").trim().replace(/^["']|["']$/g, "").trim() || "plants_pure_uploads";

export type AdminImage = { id: string; url: string; public_id: string | null; alt_text: string | null; position: number; is_cover: boolean; width: number | null; height: number | null };
export type AdminProduct = {
  id: string;
  title: string;
  slug: string;
  tagline: string | null;
  description: string;
  flavor_notes: string[] | null;
  culinary_uses: string | null;
  ingredients: string | null;
  price: number;
  compare_at_price: number | null;
  weight_grams: number | null;
  stock: number;
  is_featured: boolean | null;
  sku: string | null;
  low_stock_threshold: number | null;
  category_id: string | null;
  status: "draft" | "published" | "archived";
  version: number;
};
export type AdminListItem = { id: string; title: string; slug: string; sku: string | null; status: "draft" | "published" | "archived"; price: number; stock: number; low_stock_threshold: number | null; is_featured: boolean; cover_url: string | null; category: { id: string; name: string } | null };
export type AdminCategory = { id: string; name: string; slug: string; is_active: boolean; product_count: number };

const PROBLEMS: Record<string, string> = {
  title_missing: "add a title",
  slug_missing: "add a web address (slug)",
  description_missing: "write a description (at least 10 characters)",
  price_invalid: "set a price above 0",
  category_missing: "choose a category",
  category_inactive: "choose an active category",
  image_missing: "upload at least one photo",
  cover_missing: "choose a cover photo",
};
export const problemText = (code: string) => PROBLEMS[code] ?? code;

/** Turns a database error into a sentence a shop owner can act on. */
export function friendlyError(err: unknown): string {
  const e = err as { message?: string; details?: string; code?: string } | null;
  const msg = e?.message ?? "";
  const detail = e?.details ?? "";
  if (msg.includes("FORBIDDEN") || e?.code === "42501") return "You don't have permission to do that. Please sign in with an admin account.";
  if (msg.includes("STALE_PRODUCT")) return "Someone else changed this product. Reload the page and try again.";
  if (msg.includes("SLUG_LOCKED")) return "This product is live, so its web address can't change. Unpublish it first.";
  if (msg.includes("PRODUCT_ARCHIVED")) return "This product is archived. Restore it to a draft first.";
  if (msg.includes("PUBLICATION_REQUIREMENTS")) return `To publish, please: ${detail.split("|").map(problemText).join(", ")}.`;
  if (msg.includes("INVALID_STOCK")) return "Stock must be a whole number from 0 upwards.";
  if (msg.includes("INVALID_INPUT")) return `Please check the form${detail ? `: ${detail}` : ""}.`;
  if (e?.code === "23505" || msg.includes("duplicate key")) return "That web address (slug) or SKU is already used by another product.";
  if (msg.includes("products_compare_at_gt_price")) return "The 'was' price must be higher than the price.";
  if (msg.includes("products_slug_format")) return "The web address can only use lowercase letters, numbers and dashes.";
  return "Something went wrong. Please try again.";
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** Uploads one photo straight from the browser to our Cloudinary account (unsigned preset). */
export async function uploadToCloudinary(file: File): Promise<{ public_id: string; secure_url: string; width: number; height: number; bytes: number; format: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP photo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Each photo must be under 10 MB.");
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  // The database only accepts public IDs that start with "plants-and-pure/", so set the ID explicitly.
  // This works whether the Cloudinary account uses fixed or dynamic folders.
  body.append("public_id", `plants-and-pure/products/${crypto.randomUUID()}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body });
  const json = (await res.json().catch(() => null)) as { public_id?: string; secure_url?: string; width?: number; height?: number; bytes?: number; format?: string; error?: { message?: string } } | null;
  if (!res.ok || !json?.public_id || !json.secure_url) {
    const m = json?.error?.message ?? "";
    if (/preset|unsigned/i.test(m)) {
      throw new Error(`Cloudinary refused the upload ("${m}"). In Cloudinary go to Settings → Upload → Upload presets and make sure a preset named exactly "${CLOUDINARY_UPLOAD_PRESET}" exists with Signing mode set to "Unsigned" . If your preset has another name, set VITE_CLOUDINARY_UPLOAD_PRESET in .env.local and restart.`);
    }
    throw new Error(m || "The photo couldn't be uploaded.");
  }
  return { public_id: json.public_id, secure_url: json.secure_url, width: json.width ?? 0, height: json.height ?? 0, bytes: json.bytes ?? file.size, format: json.format ?? "" };
}
