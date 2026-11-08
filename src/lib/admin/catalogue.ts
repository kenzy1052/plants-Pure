import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapAdminDbError } from "@/lib/admin/db-errors";

/**
 * Thin, typed wrappers over the admin_* database functions. Every call passes the function
 * name as a string literal and the arguments as an inline object, so
 * tests/db/app-contract.test.ts can verify names against the real schema. The functions themselves enforce admin-only
 * access; these wrappers only translate errors.
 */
export type Json = Record<string, unknown>;
export type AdminImage = { id: string; url: string; public_id: string; alt_text: string | null; position: number; is_cover: boolean; width: number | null; height: number | null };
export type AdminProduct = {
  id: string; title: string; slug: string; tagline: string | null; description: string; flavor_notes: string[] | null;
  culinary_uses: string | null; ingredients: string | null; price: number; compare_at_price: number | null; currency: string;
  weight_grams: number | null; category_id: string | null; is_featured: boolean; sku: string | null; stock: number;
  low_stock_threshold: number | null; status: "draft" | "published" | "archived"; is_active: boolean; archived_at: string | null;
  version: number; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
};
export type AdminProductListItem = {
  id: string; title: string; slug: string; sku: string | null; status: AdminProduct["status"]; price: number; stock: number;
  low_stock_threshold: number | null; is_featured: boolean; updated_at: string; category: { id: string; name: string } | null; cover_url: string | null;
};
export type StockMovement = { id: number; delta: number; stock_after: number; reason: string; note: string | null; created_at: string };
export type AdminCategory = {
  id: string; name: string; slug: string; description: string | null; display_order: number; is_active: boolean; product_count: number; published_count: number;
};

async function call<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw mapAdminDbError(error as never);
  return data as T;
}

export const saveProduct = (db: SupabaseClient, id: string | null, expectedVersion: number | null, data: Json) =>
  call<AdminProduct>(db.rpc("admin_save_product", { p_id: id, p_expected_version: expectedVersion, p_data: data }));

export const setProductStatus = (db: SupabaseClient, id: string, status: string, expectedVersion: number | null) =>
  call<AdminProduct>(db.rpc("admin_set_product_status", { p_id: id, p_status: status, p_expected_version: expectedVersion }));

export const deleteProduct = (db: SupabaseClient, id: string) => call<null>(db.rpc("admin_delete_product", { p_id: id }));

export const adjustStock = (db: SupabaseClient, productId: string, delta: number, reason: string, note: string | null) =>
  call<{ product_id: string; stock: number; delta: number }>(db.rpc("admin_adjust_stock", { p_product_id: productId, p_delta: delta, p_reason: reason, p_note: note }));

export const setStock = (db: SupabaseClient, productId: string, quantity: number, note: string | null) =>
  call<{ product_id: string; stock: number; delta: number }>(db.rpc("admin_set_stock", { p_product_id: productId, p_quantity: quantity, p_note: note }));

export const saveCategory = (db: SupabaseClient, id: string | null, data: Json) =>
  call<Json>(db.rpc("admin_save_category", { p_id: id, p_data: data }));

export const deleteCategory = (db: SupabaseClient, id: string) => call<null>(db.rpc("admin_delete_category", { p_id: id }));

export const addProductImage = (
  db: SupabaseClient,
  a: { productId: string; publicId: string; url: string; alt: string | null; width: number; height: number; bytes: number; format: string },
) =>
  call<AdminImage[]>(
    db.rpc("admin_add_product_image", {
      p_product_id: a.productId, p_public_id: a.publicId, p_url: a.url, p_alt: a.alt,
      p_width: a.width, p_height: a.height, p_bytes: a.bytes, p_format: a.format,
    }),
  );

export const setCoverImage = (db: SupabaseClient, productId: string, imageId: string) =>
  call<AdminImage[]>(db.rpc("admin_set_cover_image", { p_product_id: productId, p_image_id: imageId }));

export const reorderImages = (db: SupabaseClient, productId: string, imageIds: string[]) =>
  call<AdminImage[]>(db.rpc("admin_reorder_product_images", { p_product_id: productId, p_image_ids: imageIds }));

export const updateImageAlt = (db: SupabaseClient, imageId: string, alt: string) =>
  call<AdminImage[]>(db.rpc("admin_update_image_alt", { p_image_id: imageId, p_alt: alt }));

export const removeProductImage = (db: SupabaseClient, imageId: string) =>
  call<{ public_id: string; still_referenced: boolean; images: AdminImage[] }>(db.rpc("admin_remove_product_image", { p_image_id: imageId }));

export const listProducts = (db: SupabaseClient, a: { q?: string; status?: string; categoryId?: string; page?: number; pageSize?: number }) =>
  call<{ items: AdminProductListItem[]; total: number; page_size: number }>(
    db.rpc("admin_list_products", {
      p_q: a.q ?? null, p_status: a.status ?? null, p_category_id: a.categoryId ?? null, p_page: a.page ?? 1, p_page_size: a.pageSize ?? 20,
    }),
  );

export const getProduct = (db: SupabaseClient, id: string) =>
  call<{ product: AdminProduct; images: AdminImage[]; problems: string[]; movements: StockMovement[] }>(db.rpc("admin_get_product", { p_id: id }));

export const listCategories = (db: SupabaseClient) => call<AdminCategory[]>(db.rpc("admin_list_categories"));
