import "server-only";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, missingFor } from "@/lib/env/server";
import { logger, errorFields } from "@/lib/api/logger";
import { safeProductImageUrl } from "@/lib/catalogue/images";
import { PAGE_SIZE, type Sort } from "@/lib/catalogue/params";
import type { Category, Product, ProductImage } from "@/lib/types";

/**
 * Storefront data layer (server only).
 *
 * - Reads go through a SESSION-LESS anonymous client, never the visitor's cookie session. A signed-in
 *   admin therefore sees exactly what the public sees (the RLS policy "products_select_admin" would
 *   otherwise show them drafts in the shop). RLS remains the real gate: `is_active and archived_at is null`.
 * - Every query repeats that rule explicitly, so the intent is visible and survives a policy change.
 * - Filtering, sorting, searching and paging happen in Postgres; the browser never receives the catalogue.
 * - Images come from `product_images` (cover first); every URL must belong to OUR Cloudinary account
 *   (see images.ts). The deprecated `products.image_urls` column is not readable through the public API
 *   after migration 06 and is never selected. `Product.image_urls` is DERIVED from `product_images`.
 * - Only columns granted to the public role are selected (see the column-level GRANT in migration 06).
 * - Failures throw CatalogueError; callers choose how to show them. Nothing falls back to made-up data.
 */
export class CatalogueError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CatalogueError";
  }
}

let client: SupabaseClient | undefined;
let testClient: SupabaseClient | undefined;
export function __setCatalogueClientForTests(c: SupabaseClient | undefined) {
  testClient = c;
}

function db(): SupabaseClient {
  if (testClient) return testClient;
  if (client) return client;
  const env = getServerEnv();
  if (missingFor("supabase", env).length) throw new CatalogueError("Supabase is not configured");
  client = createClient(env.supabase.url!, env.supabase.anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Columns the storefront may read (never `select *`, never admin-only fields). */
const CARD_COLUMNS =
  "id, category_id, title, slug, tagline, price, compare_at_price, weight_grams, stock, is_featured, created_at, " +
  "product_images(url, alt_text, position, is_cover), categories(name, slug)";
const DETAIL_COLUMNS =
  "id, category_id, title, slug, tagline, description, flavor_notes, culinary_uses, ingredients, price, compare_at_price, weight_grams, stock, is_featured, created_at, updated_at, " +
  "product_images(url, alt_text, position, is_cover), categories(name, slug)";

type Row = Record<string, unknown> & {
  product_images?: { url: string; alt_text: string | null; position: number; is_cover: boolean }[] | null;
  categories?: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

export function mapProduct(row: Row): Product {
  const fromTable = [...(row.product_images ?? [])]
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position)
    .flatMap((i): ProductImage[] => {
      const url = safeProductImageUrl(i.url);
      return url ? [{ url, alt: i.alt_text?.trim() || null }] : [];
    });
  // Images come ONLY from product_images. (The deprecated products.image_urls column is no longer
  // readable through the public API and is never used.)
  const images = fromTable;
  const cat = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  const { product_images: _pi, categories: _c, ...rest } = row;
  void _pi;
  void _c;
  return {
    ...(rest as unknown as Product),
    price: Number(row.price),
    compare_at_price: row.compare_at_price == null ? null : Number(row.compare_at_price),
    stock: Number(row.stock ?? 0),
    image_urls: images.map((i) => i.url),
    images,
    category: cat ?? null,
  };
}

function fail(what: string, error: unknown): never {
  logger.error("catalogue.query_failed", { what, ...errorFields(error) });
  throw new CatalogueError(`Could not load ${what}`, { cause: error });
}

export type ListArgs = { q?: string; categoryId?: string | null; sort?: Sort; page?: number; pageSize?: number; featuredOnly?: boolean };
export type ListResult = { items: Product[]; total: number; page: number; pageSize: number; pages: number };

export async function listProducts({ q = "", categoryId = null, sort = "featured", page = 1, pageSize = PAGE_SIZE }: ListArgs = {}): Promise<ListResult> {
  let query = db().from("products").select(CARD_COLUMNS, { count: "exact" }).eq("is_active", true).is("archived_at", null);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (q) {
    // `q` is already reduced to letters/digits/space/-/' by sanitizeSearch(): it cannot add filter syntax.
    query = query.or(`title.ilike.*${q}*,tagline.ilike.*${q}*,search_tsv.wfts(english).${q}`);
  }
  if (sort === "price-asc") query = query.order("price", { ascending: true }).order("created_at", { ascending: false });
  else if (sort === "price-desc") query = query.order("price", { ascending: false }).order("created_at", { ascending: false });
  else if (sort === "newest") query = query.order("created_at", { ascending: false });
  else query = query.order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  query = query.order("id", { ascending: true }); // stable paging

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    // PGRST103 = requested range is past the end. Not a failure. The error carries no total, so ask for
    // page 1 to learn how many pages really exist; the caller then redirects to the last one.
    if (error.code === "PGRST103") {
      if (page > 1) {
        const first = await listProducts({ q, categoryId, sort, page: 1, pageSize });
        return { items: [], total: first.total, page, pageSize, pages: first.pages };
      }
      return { items: [], total: 0, page, pageSize, pages: 0 };
    }
    fail("products", error);
  }
  const total = count ?? 0;
  return { items: (data as unknown as Row[]).map(mapProduct), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Categories with the number of published products in each (0 is a valid answer). */
export const listCategories = cache(async (): Promise<Category[]> => {
  const { data, error } = await db().from("categories").select("id, name, slug").eq("is_active", true).order("display_order").order("name");
  if (error) fail("categories", error);
  const cats = (data ?? []) as { id: string; name: string; slug: string }[];
  return Promise.all(
    cats.map(async (c) => {
      const { count, error: countError } = await db().from("products").select("id", { count: "exact", head: true }).eq("is_active", true).is("archived_at", null).eq("category_id", c.id);
      if (countError) fail("category counts", countError);
      return { ...c, productCount: count ?? 0 };
    }),
  );
});

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** One published product by slug, or null when it does not exist, is a draft, or is archived. */
export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  if (!SLUG.test(slug) || slug.length > 120) return null;
  const { data, error } = await db().from("products").select(DETAIL_COLUMNS).eq("is_active", true).is("archived_at", null).eq("slug", slug).maybeSingle();
  if (error) fail("product", error);
  return data ? mapProduct(data as unknown as Row) : null;
});

/** Other published products from the same category (up to `limit`). Empty when there is no category. */
export async function getRelatedProducts(product: Pick<Product, "id" | "category_id">, limit = 4): Promise<Product[]> {
  if (!product.category_id) return [];
  const { data, error } = await db().from("products").select(CARD_COLUMNS)
    .eq("is_active", true)
    .is("archived_at", null)
    .eq("category_id", product.category_id)
    .neq("id", product.id)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("related products", error);
  return (data as unknown as Row[]).map(mapProduct);
}

/** Slugs + last-modified for the sitemap (published only). */
export async function listProductSlugs(): Promise<{ slug: string; updatedAt: string | null }[]> {
  const { data, error } = await db().from("products").select("slug, updated_at").eq("is_active", true).is("archived_at", null).order("created_at", { ascending: false }).limit(5000);
  if (error) fail("product slugs", error);
  return ((data ?? []) as { slug: string; updated_at: string | null }[]).map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
}
