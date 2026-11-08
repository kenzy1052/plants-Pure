import crypto from "node:crypto";
import { z } from "zod";
import { ok, route, Errors } from "@/lib/api/errors";
import { assertSameOrigin, readJson } from "@/lib/api/request";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { getSessionUser } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getServerEnv, requireFeature } from "@/lib/env/server";
import { initializePaystackTransaction } from "@/lib/paystack";
import { mapCheckoutDbError } from "@/lib/payments/db-errors";
import { logger, errorFields } from "@/lib/api/logger";

export const dynamic = "force-dynamic";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/**
 * The browser sends WHAT it wants (product ids, quantities, delivery option,
 * contact details). It never sends — and the server never accepts — prices,
 * totals, fees, stock, user ids or payment status. The database computes all of
 * those from its own records.
 */
const bodySchema = z.object({
  clientRequestId: z.string().uuid(),
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(100) }))
    .min(1)
    .max(50),
  zoneId: z.string().uuid(),
  customer: z.object({
    name: text(2, 120),
    phone: z.string().trim().regex(/^[0-9+()\-\s]{6,32}$/, "Enter a valid phone number"),
    email: z.string().trim().toLowerCase().email().max(254),
    address: text(5, 500),
    notes: z.string().trim().max(500).optional(),
  }),
});

export const POST = route("payments.initialize", async (req: Request) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "payments.initialize", { max: 10, windowMs: 60_000 });
  const body = await readJson(req, bodySchema);

  // Fail early (before creating any order) when the payment provider is not configured.
  requireFeature("supabaseAdmin");
  requireFeature("paystack");

  const user = await getSessionUser(); // null for guests; never taken from the body
  const admin = getSupabaseAdmin();

  // 1. Order + items, priced and stock-checked inside the database.
  const { data: order, error: orderError } = await admin.rpc("create_checkout_order", {
    p_client_request_id: body.clientRequestId,
    p_user_id: user?.id ?? null,
    p_customer_name: body.customer.name,
    p_customer_phone: body.customer.phone,
    p_customer_email: body.customer.email,
    p_delivery_address: body.customer.address,
    p_delivery_zone_id: body.zoneId,
    p_notes: body.customer.notes ?? null,
    p_items: body.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
  });
  if (orderError) {
    logger.info("checkout.order_rejected", { code: orderError.message });
    throw mapCheckoutDbError(orderError);
  }
  const o = order as { order_id: string; order_number: number; amount_minor: number; currency: string; total_amount: number; payment_status: string };

  if (o.payment_status === "paid") throw Errors.conflict("already_paid", "This order has already been paid.");

  // 2. One payment attempt per Paystack reference (reuses a recent open attempt).
  const reference = `PP-${o.order_number}-${crypto.randomBytes(6).toString("hex")}`;
  const { data: attempt, error: attemptError } = await admin.rpc("begin_payment_attempt", { p_order_id: o.order_id, p_reference: reference });
  if (attemptError) throw mapCheckoutDbError(attemptError);
  const a = attempt as { reference: string; authorization_url: string | null; reused: boolean };

  if (a.reused && a.authorization_url) {
    return ok({ authorizationUrl: a.authorization_url, reference: a.reference, orderNumber: o.order_number, reused: true });
  }

  // 3. Tell Paystack. The amount comes from the database, never from the request.
  try {
    const init = await initializePaystackTransaction({
      email: body.customer.email,
      amountMinor: Number(o.amount_minor),
      currency: "GHS",
      reference: a.reference,
      callbackUrl: `${getServerEnv().appUrl}/checkout/callback`,
      metadata: { order_number: o.order_number },
    });
    const { error: markError } = await admin.rpc("mark_payment_initialized", {
      p_reference: a.reference,
      p_access_code: init.access_code,
      p_authorization_url: init.authorization_url,
    });
    if (markError) throw markError;
    return ok({ authorizationUrl: init.authorization_url, reference: a.reference, orderNumber: o.order_number, reused: false });
  } catch (err) {
    logger.error("checkout.init_failed", { reference: a.reference, ...errorFields(err) });
    await admin.rpc("mark_payment_init_failed", { p_reference: a.reference, p_reason: "provider_init_failed" });
    throw err;
  }
});
