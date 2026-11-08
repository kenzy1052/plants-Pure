import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { sendEmail } from "@/lib/email/send";
import { orderConfirmationEmail } from "@/lib/email/templates";
import { logger } from "@/lib/api/logger";

const KIND = "order_confirmation";

/**
 * Sends the order confirmation at most once per order.
 *
 * public.claim_email() is an atomic "send-once" lock, so two webhook deliveries
 * (or a webhook racing the return page) cannot both send it. A failed send is
 * recorded as `failed`, which lets a later retry claim it again. Resend's
 * Idempotency-Key covers the timeout-then-retry case.
 */
export async function sendOrderConfirmationIfNeeded(orderId: string): Promise<"sent" | "skipped" | "failed" | "already_handled" | "no_recipient"> {
  const admin = getSupabaseAdmin();

  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_email, subtotal, delivery_fee, total_amount, payment_status, delivery_zone_id, order_items(product_title, quantity, unit_price), delivery_zones(name, is_pickup)",
    )
    .eq("id", orderId)
    .single();
  if (error || !order) throw error ?? new Error("order not found");
  if (order.payment_status !== "paid") return "skipped"; // never confirm an unpaid order
  if (!order.customer_email) return "no_recipient";

  const { data: claimed, error: claimError } = await admin.rpc("claim_email", {
    p_kind: KIND,
    p_order_id: orderId,
    p_recipient: order.customer_email,
  });
  if (claimError) throw claimError;
  if (!claimed) return "already_handled";

  const { data: pay } = await admin
    .from("payments")
    .select("reference")
    .eq("order_id", orderId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const zone = (Array.isArray(order.delivery_zones) ? order.delivery_zones[0] : order.delivery_zones) as { name: string; is_pickup: boolean } | null;
  const content = orderConfirmationEmail({
    orderNumber: order.order_number,
    customerName: order.customer_name,
    items: (order.order_items ?? []).map((i: { product_title: string; quantity: number; unit_price: number | string }) => ({
      title: i.product_title,
      quantity: i.quantity,
      unitPrice: Number(i.unit_price),
    })),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    total: Number(order.total_amount),
    zoneName: zone?.name ?? null,
    isPickup: Boolean(zone?.is_pickup),
    trackUrl: `${getServerEnv().appUrl}/checkout/callback${pay?.reference ? `?reference=${encodeURIComponent(pay.reference)}` : ""}`,
  });

  const result = await sendEmail({ to: order.customer_email, ...content, idempotencyKey: `${KIND}:${orderId}` });

  if (result.status === "sent") {
    await admin.rpc("finish_email", { p_kind: KIND, p_order_id: orderId, p_status: "sent", p_message_id: result.messageId, p_error: null });
    return "sent";
  }
  if (result.status === "skipped" && result.reason === "mode_off") {
    await admin.rpc("finish_email", { p_kind: KIND, p_order_id: orderId, p_status: "skipped", p_message_id: null, p_error: "mode_off" });
    return "skipped";
  }
  // Not configured / sandbox without recipient / provider failure: record as failed so it can be retried.
  const reason = result.status === "skipped" ? result.reason : result.error;
  logger.warn("email.not_sent", { orderId, reason });
  await admin.rpc("finish_email", { p_kind: KIND, p_order_id: orderId, p_status: "failed", p_message_id: null, p_error: reason });
  return "failed";
}
