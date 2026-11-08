import { z } from "zod";
import { ok, route, ApiError } from "@/lib/api/errors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyPaystackSignature } from "@/lib/paystack";
import { verifyAndApplyPayment } from "@/lib/payments/service";
import { logger, errorFields } from "@/lib/api/logger";

export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;
const eventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z
    .object({ id: z.union([z.number(), z.string()]).optional(), reference: z.string().max(200).optional(), status: z.string().max(50).optional() })
    .passthrough(),
});

/** Events that carry a transaction we should settle. Refund/dispute events are Phase 6/7 work. */
const CHARGE_EVENTS = new Set(["charge.success"]);

/**
 * Paystack webhook.
 *  1. Authenticity: HMAC-SHA512 of the RAW body (constant-time). Bad signature → 401, nothing stored.
 *  2. Idempotency: every delivery is ledgered under a dedupe key; replays of a finished event return 200.
 *  3. Never trust the payload: the transaction is re-fetched from Paystack and THAT is applied.
 *  4. Retries: a 5xx makes Paystack redeliver; the ledger + the state machine make that safe.
 */
export const POST = route("webhooks.paystack", async (req: Request) => {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new ApiError(413, "payload_too_large", "Payload too large.");

  if (!verifyPaystackSignature(raw, req.headers.get("x-paystack-signature"))) {
    logger.warn("webhook.bad_signature");
    throw new ApiError(401, "invalid_signature", "Invalid signature.");
  }

  let parsed: z.infer<typeof eventSchema>;
  try {
    parsed = eventSchema.parse(JSON.parse(raw));
  } catch {
    // Signed but unreadable: acknowledge so Paystack stops retrying something we can't use.
    logger.warn("webhook.unparseable");
    return ok({ received: true, ignored: "unparseable" });
  }

  const reference = parsed.data.reference;
  const dedupeKey = `${parsed.event}:${parsed.data.id ?? reference ?? "none"}:${parsed.data.status ?? ""}`;
  const admin = getSupabaseAdmin();

  const { data: ledger, error: ledgerError } = await admin.rpc("record_payment_event", {
    p_dedupe_key: dedupeKey,
    p_event_type: parsed.event,
    p_reference: reference ?? null,
    p_payload: parsed as unknown as Record<string, unknown>,
  });
  if (ledgerError) throw ledgerError; // 500 → Paystack retries
  const { event_id: eventId, already_processed: already } = ledger as { event_id: number; already_processed: boolean };
  if (already) return ok({ received: true, duplicate: true });

  if (!CHARGE_EVENTS.has(parsed.event) || !reference) {
    await admin.rpc("complete_payment_event", { p_event_id: eventId, p_status: "ignored", p_error: null });
    return ok({ received: true, ignored: parsed.event });
  }

  try {
    const result = await verifyAndApplyPayment(reference);
    const status = result.outcome === "unknown_reference" ? "ignored" : "processed";
    await admin.rpc("complete_payment_event", { p_event_id: eventId, p_status: status, p_error: result.outcome });
    return ok({ received: true, outcome: result.outcome });
  } catch (err) {
    logger.error("webhook.processing_failed", { reference, ...errorFields(err) });
    await admin.rpc("complete_payment_event", { p_event_id: eventId, p_status: "failed", p_error: err instanceof Error ? err.message : "error" });
    throw err; // 500 → Paystack redelivers; dedupe row says "not finished", so it is retried safely
  }
});
