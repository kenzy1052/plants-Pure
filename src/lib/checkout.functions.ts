import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { optionalSupabaseUser } from "./auth-middleware";
import { z } from "zod";
import { checkoutSchema, contactSchema, referenceSchema } from "./schemas";
import { resolvePublicOrigin } from "./origin";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code: string };

function fail(err: unknown, fallback: string): { ok: false; error: string; code: string } {
  const e = err as { message?: string; code?: string; isPublic?: boolean } | null;
  if (e && e.isPublic) return { ok: false, error: e.message ?? fallback, code: e.code ?? "error" };
  console.error(fallback, err);
  return { ok: false, error: fallback, code: "error" };
}

function publicOrigin(): string {
  const req = getRequest();
  return resolvePublicOrigin({ appUrl: process.env["APP_URL"], headers: req.headers, requestUrl: req.url });
}

/**
 * Starts a Paystack payment. The browser sends WHAT it wants (products, quantities, delivery
 * option, contact details); the database computes prices, fees, stock and totals.
 */
export const initializeCheckout = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseUser])
  .inputValidator((input: unknown) => checkoutSchema.parse(input))
  .handler(async ({ data, context }): Promise<Result<{ authorizationUrl: string; reference: string; orderNumber: number }>> => {
    try {
      const { getAdminClient, initializePaystackTransaction, mapCheckoutDbError, PublicError } = await import("./server/payments.server");
      const { randomBytes } = await import("node:crypto");
      if (!process.env["PAYSTACK_SECRET_KEY"]) throw new PublicError("Payments are not available right now. Please try again shortly.", "not_configured");
      const admin = getAdminClient();

      const { data: order, error: orderError } = await admin.rpc("create_checkout_order", {
        p_client_request_id: data.clientRequestId,
        p_user_id: context.userId,
        p_customer_name: data.customer.name,
        p_customer_phone: data.customer.phone,
        p_customer_email: data.customer.email,
        p_delivery_address: data.customer.address,
        p_delivery_zone_id: data.zoneId,
        p_notes: data.customer.notes ?? null,
        p_items: data.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
      });
      if (orderError) throw mapCheckoutDbError(orderError);
      const o = order as { order_id: string; order_number: number; amount_minor: number; payment_status: string };
      if (o.payment_status === "paid") throw new PublicError("This order has already been paid.", "already_paid");

      const reference = `PP-${o.order_number}-${randomBytes(6).toString("hex")}`;
      const { data: attempt, error: attemptError } = await admin.rpc("begin_payment_attempt", { p_order_id: o.order_id, p_reference: reference });
      if (attemptError) throw mapCheckoutDbError(attemptError);
      const a = attempt as { reference: string; authorization_url: string | null; reused: boolean };
      if (a.reused && a.authorization_url) return { ok: true, data: { authorizationUrl: a.authorization_url, reference: a.reference, orderNumber: o.order_number } };

      const origin = publicOrigin();
      try {
        const init = await initializePaystackTransaction({
          email: data.customer.email,
          amountMinor: Number(o.amount_minor),
          reference: a.reference,
          callbackUrl: `${origin}/checkout/callback`,
          metadata: { order_number: o.order_number },
        });
        const { error: markError } = await admin.rpc("mark_payment_initialized", { p_reference: a.reference, p_access_code: init.access_code, p_authorization_url: init.authorization_url });
        if (markError) throw markError;
        return { ok: true, data: { authorizationUrl: init.authorization_url, reference: a.reference, orderNumber: o.order_number } };
      } catch (err) {
        await admin.rpc("mark_payment_init_failed", { p_reference: a.reference, p_reason: "provider_init_failed" });
        throw err;
      }
    } catch (err) {
      return fail(err, "We couldn't start your payment. Please try again.");
    }
  });

/** Verified status of ONE payment by its unguessable reference. Returns no personal data. */
export const checkPaymentStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => referenceSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const { getPaymentStatus } = await import("./server/payments.server");
      const status = await getPaymentStatus(data.reference);
      if (!status) return { ok: false as const, error: "We could not find that payment.", code: "not_found" };
      return { ok: true as const, data: status };
    } catch (err) {
      return fail(err, "We couldn't check your payment right now.");
    }
  });

/** Contact form → e-mail to the business through Resend. Truthful result. */
export const sendContactMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => contactSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website && data.website.trim() !== "") return { ok: true as const };
    const { sendEmail, contactEmail } = await import("./server/email.server");
    const { CONTACT } = await import("./business");
    const mail = contactEmail({ ...data, phone: data.phone || undefined });
    const result = await sendEmail({ to: CONTACT.email, ...mail, idempotencyKey: `contact-${data.clientRequestId}`, replyTo: data.email });
    if (result.status === "sent") return { ok: true as const };
    const fallback = `Please email ${CONTACT.email} or call ${CONTACT.phones[0].label}.`;
    if (result.status === "skipped") return { ok: false as const, error: `Messages can't be sent online right now. ${fallback}` };
    console.error("contact.send_failed", result.error);
    return { ok: false as const, error: `We couldn't send your message. Please try again, or ${fallback.toLowerCase()}` };
  });

/** Public order tracking by code (from the payment confirmation page / receipt email). */
export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().min(6).max(40) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { findOrderByTrackingCode } = await import("./server/payments.server");
      const order = await findOrderByTrackingCode(data.code);
      if (!order) return { ok: false as const, error: "We couldn't find an order with that code. Please check it and try again." };
      return { ok: true as const, data: order };
    } catch (err) {
      console.error("track.failed", err);
      return { ok: false as const, error: "Tracking isn't available right now. Please try again shortly." };
    }
  });

/** Customer confirms they received / collected their order (paid + dispatched → delivered). */
export const confirmOrderReceived = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().min(6).max(40) }).parse(input))
  .handler(async ({ data }): Promise<Result<{ fulfillmentStatus: string }>> => {
    try {
      const { confirmOrderReceivedByCode } = await import("./server/payments.server");
      const res = await confirmOrderReceivedByCode(data.code);
      if (!res) return { ok: false, error: "We couldn't find that order.", code: "not_found" };
      return { ok: true, data: res };
    } catch (err) {
      return fail(err, "We couldn't update your order right now. Please try again.");
    }
  });
