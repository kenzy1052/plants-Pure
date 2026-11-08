import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../supabase-config";
import { sendOrderConfirmationIfNeeded } from "./email.server";
import { parseTrackingCode, trackingCode } from "../tracking";

/**
 * Server-only payment logic, ported from the original project (lib/paystack.ts,
 * lib/payments/service.ts, lib/payments/status.ts). The database state machine
 * (create_checkout_order, begin_payment_attempt, apply_payment_result, …) is unchanged.
 */

export class PublicError extends Error {
  readonly isPublic = true;
  constructor(message: string, public code = "error") {
    super(message);
  }
}

export function getAdminClient(): SupabaseClient {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] || process.env["PP_SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new PublicError("Checkout is not available right now. Please try again shortly.", "not_configured");
  return createClient(process.env["SUPABASE_URL"] || SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function paystackKey(): string {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new PublicError("Payments are not available right now. Please try again shortly.", "not_configured");
  return key;
}

async function paystack<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`https://api.paystack.co${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
    if (!res.ok || !body?.status || body.data === undefined) {
      console.warn("paystack.api_error", { path: path.split("?")[0], status: res.status, message: body?.message });
      throw new PublicError("The payment provider could not process the request. Please try again.", "upstream");
    }
    return body.data;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new PublicError("The payment provider took too long to respond. Please try again.", "upstream");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature.trim().toLowerCase(), "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function initializePaystackTransaction(input: { email: string; amountMinor: number; reference: string; callbackUrl: string; metadata?: Record<string, string | number> }) {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new RangeError("amountMinor must be a positive integer");
  return paystack<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    json: { email: input.email, amount: input.amountMinor, currency: "GHS", reference: input.reference, callback_url: input.callbackUrl, metadata: input.metadata },
  });
}

type VerifyData = { id: number; status: string; reference: string; amount: number; currency: string; channel?: string | null; gateway_response?: string | null; paid_at?: string | null };

/** Server-to-server truth: the ONLY thing allowed to mark an order as paid. */
export async function verifyAndApplyPayment(reference: string): Promise<{ outcome: string; transitioned: boolean; order_id?: string }> {
  const verified = await paystack<VerifyData>(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (verified.reference !== reference) {
    console.error("payments.reference_mismatch", { reference });
    return { outcome: "reference_mismatch", transitioned: false };
  }
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("apply_payment_result", {
    p_reference: reference,
    p_provider_status: verified.status,
    p_paid_amount_minor: verified.amount,
    p_currency: verified.currency,
    p_provider_txn_id: String(verified.id),
    p_channel: verified.channel ?? null,
    p_gateway_response: verified.gateway_response ?? null,
    p_paid_at: verified.paid_at ?? null,
  });
  if (error) throw error;
  const result = data as { outcome: string; transitioned: boolean; order_id?: string };
  if (result.transitioned && result.outcome === "paid" && result.order_id) {
    try {
      await sendOrderConfirmationIfNeeded(admin, result.order_id);
    } catch (err) {
      console.error("email.order_confirmation_failed", { orderId: result.order_id, err: String(err) });
    }
  }
  return result;
}

export function mapCheckoutDbError(error: { message?: string; details?: string | null } | null | undefined): PublicError {
  switch ((error?.message ?? "").trim()) {
    case "INVALID_ITEMS":
      return new PublicError("Your cart is empty or contains an invalid item.", "invalid_items");
    case "INVALID_CUSTOMER_DETAILS":
      return new PublicError("Please check your name, phone number, email and delivery address.", "invalid_customer_details");
    case "PRODUCT_UNAVAILABLE":
      return new PublicError("One of the products in your cart is no longer available. Please review your cart.", "product_unavailable");
    case "INSUFFICIENT_STOCK":
      return new PublicError("Some items are no longer available in the quantity you requested.", "insufficient_stock");
    case "DELIVERY_ZONE_INVALID":
      return new PublicError("Please choose a valid delivery option.", "delivery_zone_invalid");
    case "IDEMPOTENCY_KEY_CONFLICT":
      return new PublicError("This checkout was already submitted. Please refresh and try again.", "duplicate_request");
    case "PAYMENT_INIT_IN_PROGRESS":
      return new PublicError("Your payment is already being set up. Please wait a few seconds and try again.", "payment_in_progress");
    case "ORDER_NOT_PAYABLE":
      return new PublicError("This order can no longer be paid. Please start a new checkout.", "order_not_payable");
    default:
      return new PublicError("Something went wrong setting up your payment. Please try again.", "upstream");
  }
}

export type PublicPaymentStatus = {
  reference: string;
  orderNumber: number;
  state: "paid" | "pending" | "failed" | "cancelled" | "needs_review";
  amount: number;
  currency: string;
  trackingCode: string | null;
};

const OPEN = new Set(["initiated", "pending"]);
function toState(paymentStatus: string, orderStatus: string): PublicPaymentStatus["state"] {
  if (paymentStatus === "success" && orderStatus === "paid") return "paid";
  if (paymentStatus === "refunded") return "paid";
  if (paymentStatus === "review") return "needs_review";
  if (paymentStatus === "failed") return "failed";
  if (paymentStatus === "abandoned" || paymentStatus === "cancelled") return "cancelled";
  return "pending";
}

export async function getPaymentStatus(reference: string): Promise<PublicPaymentStatus | null> {
  const admin = getAdminClient();
  const read = async () => {
    const { data, error } = await admin
      .from("payments")
      .select("reference, status, orders(order_number, public_id, payment_status, total_amount, currency)")
      .eq("reference", reference)
      .maybeSingle();
    if (error) throw error;
    return data as { reference: string; status: string; orders: unknown } | null;
  };
  let row = await read();
  if (!row) return null;
  if (OPEN.has(row.status)) {
    try {
      await verifyAndApplyPayment(reference);
      row = (await read()) ?? row;
    } catch (err) {
      console.warn("payments.status_verify_failed", { reference, err: String(err) });
    }
  }
  const order = (Array.isArray(row.orders) ? row.orders[0] : row.orders) as { order_number: number; public_id: string; payment_status: string; total_amount: number | string; currency: string };
  const state = toState(row.status, order.payment_status);
  return {
    reference: row.reference,
    orderNumber: order.order_number,
    state,
    amount: Number(order.total_amount),
    currency: order.currency,
    trackingCode: state === "paid" || state === "needs_review" ? trackingCode(order.order_number, order.public_id) : null,
  };
}

export type TrackedOrder = {
  code: string;
  orderNumber: number;
  placedAt: string;
  paidAt: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  total: number;
  deliveryFee: number;
  zoneName: string | null;
  isPickup: boolean;
  items: { title: string; quantity: number }[];
};

/** Looks an order up by its tracking code. Returns no personal data (no name, phone, email or address). */
export async function findOrderByTrackingCode(raw: string): Promise<TrackedOrder | null> {
  const parsed = parseTrackingCode(raw);
  if (!parsed) return null;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("order_number, public_id, created_at, paid_at, payment_status, fulfillment_status, total_amount, delivery_fee, order_items(product_title, quantity), delivery_zones(name, is_pickup)")
    .eq("order_number", parsed.orderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const code = trackingCode(data.order_number as number, data.public_id as string);
  if (code !== `PP-${parsed.orderNumber}-${parsed.prefix.toUpperCase()}`) return null;
  const zone = (Array.isArray(data.delivery_zones) ? data.delivery_zones[0] : data.delivery_zones) as { name: string; is_pickup: boolean } | null;
  return {
    code,
    orderNumber: data.order_number as number,
    placedAt: data.created_at as string,
    paidAt: (data.paid_at as string) ?? null,
    paymentStatus: data.payment_status as string,
    fulfillmentStatus: data.fulfillment_status as string,
    total: Number(data.total_amount),
    deliveryFee: Number(data.delivery_fee),
    zoneName: zone?.name ?? null,
    isPickup: Boolean(zone?.is_pickup),
    items: ((data.order_items ?? []) as { product_title: string; quantity: number }[]).map((i) => ({ title: i.product_title, quantity: i.quantity })),
  };
}


/**
 * The customer confirms they have received (or collected) their order. Only an order that is paid
 * and currently "dispatched" can move to "delivered"; the tracking code (derived from the order's
 * unguessable public_id) is the proof of ownership, exactly as on the public tracking page.
 */
export async function confirmOrderReceivedByCode(raw: string): Promise<{ fulfillmentStatus: string } | null> {
  const found = await findOrderByTrackingCode(raw);
  if (!found) return null;
  if (found.paymentStatus !== "paid") throw new PublicError("This order hasn't been paid yet.", "not_paid");
  if (found.fulfillmentStatus === "delivered") return { fulfillmentStatus: "delivered" };
  if (found.fulfillmentStatus !== "dispatched") {
    throw new PublicError("This order hasn't been sent out yet, so it can't be marked as received.", "not_dispatched");
  }
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("orders")
    .update({ fulfillment_status: "delivered", updated_at: new Date().toISOString() })
    .eq("order_number", found.orderNumber)
    .eq("fulfillment_status", "dispatched") // never overwrites a status staff changed in the meantime
    .select("fulfillment_status")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PublicError("This order's status just changed. Please refresh and try again.", "status_changed");
  return { fulfillmentStatus: "delivered" };
}
