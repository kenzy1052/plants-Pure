import { queryOptions } from "@tanstack/react-query";
import { getAnonSupabase } from "./supabase";
import { CLOUDINARY_CLOUD_NAME } from "./supabase-config";
import type { Category, DeliveryZone, Product, ProductImage } from "./types";

/**
 * Storefront data layer — ported from the original project's src/lib/catalogue/data.ts.
 * Reads use a session-less anonymous client; RLS (is_active and archived_at is null) is the gate,
 * and every query repeats that rule. Images come only from product_images and must belong to our
 * Cloudinary account. Nothing falls back to made-up data.
 */
export const PAGE_SIZE = 12;
export const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
] as const;
export type Sort = (typeof SORTS)[number]["value"];

const CARD_COLUMNS =
  "id, category_id, title, slug, tagline, price, compare_at_price, weight_grams, stock, is_featured, created_at, " +
  "product_images(url, alt_text, position, is_cover), categories(name, slug)";
const DETAIL_COLUMNS =
  "id, category_id, title, slug, tagline, description, flavor_notes, culinary_uses, ingredients, price, compare_at_price, weight_grams, stock, is_featured, created_at, updated_at, " +
  "product_images(url, alt_text, position, is_cover), categories(name, slug)";

export function safeImageUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com") return null;
    if (!u.pathname.startsWith(`/${CLOUDINARY_CLOUD_NAME}/`)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Adds Cloudinary delivery transforms (auto format/quality, sized) to one of our image URLs. */
export function cldUrl(url: string | null | undefined, w: number, opts: { h?: number; crop?: "fill" | "fit" } = {}): string | null {
  if (!url) return null;
  const marker = "/image/upload/";
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const t = [`f_auto`, `q_auto`, `w_${w}`, opts.h ? `h_${opts.h}` : null, `c_${opts.crop ?? "fill"}`].filter(Boolean).join(",");
  return url.slice(0, i + marker.length) + t + "/" + url.slice(i + marker.length);
}

export function sanitizeSearch(q: string): string {
  return q
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

type Row = Record<string, unknown> & {
  product_images?: { url: string; alt_text: string | null; position: number; is_cover: boolean }[] | null;
  categories?: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

export function mapProduct(row: Row): Product {
  const images = [...(row.product_images ?? [])]
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position)
    .flatMap((i): ProductImage[] => {
      const url = safeImageUrl(i.url);
      return url ? [{ url, alt: i.alt_text?.trim() || null }] : [];
    });
  const cat = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: String(row.id),
    category_id: (row.category_id as string) ?? null,
    title: String(row.title),
    slug: String(row.slug),
    tagline: (row.tagline as string) ?? null,
    description: (row.description as string) ?? null,
    flavor_notes: (row.flavor_notes as string[]) ?? null,
    culinary_uses: (row.culinary_uses as string) ?? null,
    ingredients: (row.ingredients as string) ?? null,
    price: Number(row.price),
    compare_at_price: row.compare_at_price == null ? null : Number(row.compare_at_price),
    weight_grams: row.weight_grams == null ? null : Number(row.weight_grams),
    stock: Number(row.stock ?? 0),
    is_featured: Boolean(row.is_featured),
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
    images,
    category: cat ?? null,
  };
}

export type ListArgs = { q?: string; category?: string; sort?: Sort; page?: number; pageSize?: number; featuredOnly?: boolean };
export type ListResult = { items: Product[]; total: number; page: number; pages: number };

async function categoryIdForSlug(slug: string): Promise<string | null> {
  const cats = await fetchCategories();
  return cats.find((c) => c.slug === slug)?.id ?? null;
}

export async function fetchProducts(args: ListArgs = {}): Promise<ListResult> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = args.pageSize ?? PAGE_SIZE;
  const db = getAnonSupabase();
  let query = db.from("products").select(CARD_COLUMNS, { count: "exact" }).eq("is_active", true).is("archived_at", null);
  if (args.category) {
    const id = await categoryIdForSlug(args.category);
    if (!id) return { items: [], total: 0, page, pages: 0 };
    query = query.eq("category_id", id);
  }
  if (args.featuredOnly) query = query.eq("is_featured", true);
  const q = args.q ? sanitizeSearch(args.q) : "";
  if (q) query = query.or(`title.ilike.*${q}*,tagline.ilike.*${q}*`);
  const sort = args.sort ?? "featured";
  if (sort === "price-asc") query = query.order("price", { ascending: true });
  else if (sort === "price-desc") query = query.order("price", { ascending: false });
  else if (sort === "newest") query = query.order("created_at", { ascending: false });
  else query = query.order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  query = query.order("id", { ascending: true });
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    if (error.code === "PGRST103") return { items: [], total: 0, page, pages: 0 };
    throw new Error("We couldn't load products right now.");
  }
  const total = count ?? 0;
  return { items: ((data ?? []) as unknown as Row[]).map(mapProduct), total, page, pages: Math.ceil(total / pageSize) };
}

export async function fetchCategories(): Promise<Category[]> {
  const db = getAnonSupabase();
  const { data, error } = await db.from("categories").select("id, name, slug").eq("is_active", true).order("display_order").order("name");
  if (error) throw new Error("We couldn't load categories right now.");
  const cats = (data ?? []) as { id: string; name: string; slug: string }[];
  return Promise.all(
    cats.map(async (c) => {
      const { count } = await db.from("products").select("id", { count: "exact", head: true }).eq("is_active", true).is("archived_at", null).eq("category_id", c.id);
      return { ...c, productCount: count ?? 0 };
    }),
  );
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function fetchProduct(slug: string): Promise<Product | null> {
  if (!SLUG.test(slug) || slug.length > 120) return null;
  const { data, error } = await getAnonSupabase()
    .from("products")
    .select(DETAIL_COLUMNS)
    .eq("is_active", true)
    .is("archived_at", null)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("We couldn't load this product right now.");
  return data ? mapProduct(data as unknown as Row) : null;
}

export async function fetchRelated(product: Pick<Product, "id" | "category_id">, limit = 4): Promise<Product[]> {
  if (!product.category_id) return [];
  const { data, error } = await getAnonSupabase()
    .from("products")
    .select(CARD_COLUMNS)
    .eq("is_active", true)
    .is("archived_at", null)
    .eq("category_id", product.category_id)
    .neq("id", product.id)
    .order("is_featured", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as unknown as Row[]).map(mapProduct);
}

export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
  const { data, error } = await getAnonSupabase()
    .from("delivery_zones")
    .select("id, name, fee, free_over, is_pickup, notes")
    .eq("is_active", true)
    .order("display_order")
    .order("name");
  if (error) throw new Error("We couldn't load delivery options.");
  return ((data ?? []) as Record<string, unknown>[]).map((z) => ({
    id: String(z.id),
    name: String(z.name),
    fee: Number(z.fee),
    free_over: z.free_over == null ? null : Number(z.free_over),
    is_pickup: Boolean(z.is_pickup),
    notes: (z.notes as string) ?? null,
  }));
}

/* ---------- Query options ---------- */
export const productsQuery = (args: ListArgs) =>
  queryOptions({ queryKey: ["products", args], queryFn: () => fetchProducts(args), staleTime: 60_000 });
export const categoriesQuery = () =>
  queryOptions({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60_000 });
export const productQuery = (slug: string) =>
  queryOptions({ queryKey: ["product", slug], queryFn: () => fetchProduct(slug), staleTime: 60_000 });
export const deliveryZonesQuery = () =>
  queryOptions({ queryKey: ["delivery-zones"], queryFn: fetchDeliveryZones, staleTime: 60_000 });

/** Delivery fee rule mirrored from the database function (display only; the server recomputes). */
export function deliveryFeeFor(zone: DeliveryZone | undefined, subtotal: number): number {
  if (!zone) return 0;
  if (zone.free_over != null && subtotal >= zone.free_over) return 0;
  return zone.fee;
}
