import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapAdminDbError } from "@/lib/admin/db-errors";

/**
 * Admin orders data layer.
 *
 * Thin, typed wrappers over the admin_* database functions. Every call passes the
 * function name as a string literal and the arguments as an inline object, so
 * tests can verify names against the real schema.
 */

export type OrderListItem = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_email: string;
  payment_status: string;
  fulfillment_status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  requires_review: boolean;
  item_count: number;
  paid_at: string | null;
};

export type OrderListResult = {
  items: OrderListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  counts: Record<string, number>;
};

export type OrderItem = {
  id: string;
  product_id: string | null;
  product_slug: string | null;
  title: string;
  sku: string | null;
  unit_price: number;
  quantity: number;
  total_price: number;
  weight_grams: number | null;
  cover_url: string | null;
};

export type OrderPayment = {
  id: string;
  reference: string;
  status: string;
  amount_minor: number;
  currency: string;
  channel: string | null;
  created_at: string;
};

export type OrderDetail = {
  id: string;
  order_number: number;
  public_id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  delivery_address: string | null;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  currency: string;
  payment_status: string;
  fulfillment_status: string;
  requires_review: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  zone_name: string | null;
};

export type OrderDetailResult = {
  order: OrderDetail;
  items: OrderItem[];
  payments: OrderPayment[];
};

async function call<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw mapAdminDbError(error as never);
  return data as T;
}

/** Paginated order list with status-filter counts and search. */
export function listOrders(
  db: SupabaseClient,
  opts: { paymentStatus?: string; fulfillmentStatus?: string; q?: string; page?: number; pageSize?: number },
) {
  return call<OrderListResult>(
    db.rpc("admin_list_orders", {
      p_payment_status: opts.paymentStatus ?? null,
      p_fulfillment_status: opts.fulfillmentStatus ?? null,
      p_q: opts.q ?? null,
      p_page: opts.page ?? 1,
      p_page_size: opts.pageSize ?? 20,
    }),
  );
}

/** Full order detail: header, line items, payment history. */
export function getOrder(db: SupabaseClient, id: string) {
  return call<OrderDetailResult>(db.rpc("admin_get_order", { p_id: id }));
}

/** Update the fulfillment status of an order. */
export function updateFulfillmentStatus(db: SupabaseClient, id: string, status: string) {
  return call<{ fulfillment_status: string }>(db.rpc("admin_update_fulfillment", { p_id: id, p_status: status }));
}
