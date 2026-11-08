import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const MAX_BODY = 256 * 1024;
const eventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z.object({ id: z.union([z.number(), z.string()]).optional(), reference: z.string().max(200).optional(), status: z.string().max(50).optional() }).passthrough(),
});

/**
 * Paystack webhook (ported unchanged in behaviour):
 *  1. HMAC-SHA512 of the raw body with the secret key, constant-time compare. Bad signature → 401.
 *  2. Every delivery is ledgered under a dedupe key (record_payment_event); replays return 200.
 *  3. The payload is never trusted: the transaction is re-fetched from Paystack and that is applied.
 */
export const Route = createFileRoute("/api/public/webhooks/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyPaystackSignature, verifyAndApplyPayment, getAdminClient } = await import("@/lib/server/payments.server");
        const raw = await request.text();
        if (raw.length > MAX_BODY) return Response.json({ error: "payload_too_large" }, { status: 413 });
        if (!verifyPaystackSignature(raw, request.headers.get("x-paystack-signature"))) {
          return Response.json({ error: "invalid_signature" }, { status: 401 });
        }
        let parsed: z.infer<typeof eventSchema>;
        try {
          parsed = eventSchema.parse(JSON.parse(raw));
        } catch {
          return Response.json({ received: true, ignored: "unparseable" });
        }
        const reference = parsed.data.reference;
        const dedupeKey = `${parsed.event}:${parsed.data.id ?? reference ?? "none"}:${parsed.data.status ?? ""}`;
        const admin = getAdminClient();
        const { data: ledger, error: ledgerError } = await admin.rpc("record_payment_event", {
          p_dedupe_key: dedupeKey,
          p_event_type: parsed.event,
          p_reference: reference ?? null,
          p_payload: parsed,
        });
        if (ledgerError) return Response.json({ error: "ledger_failed" }, { status: 500 });
        const { event_id: eventId, already_processed: already } = ledger as { event_id: number; already_processed: boolean };
        if (already) return Response.json({ received: true, duplicate: true });

        if (parsed.event !== "charge.success" || !reference) {
          await admin.rpc("complete_payment_event", { p_event_id: eventId, p_status: "ignored", p_error: null });
          return Response.json({ received: true, ignored: parsed.event });
        }
        try {
          const result = await verifyAndApplyPayment(reference);
          const status = result.outcome === "unknown_reference" ? "ignored" : "processed";
          await admin.rpc("complete_payment_event", { p_event_id: eventId, p_status: status, p_error: result.outcome });
          return Response.json({ received: true, outcome: result.outcome });
        } catch (err) {
          await admin.rpc("complete_payment_event", { p_event_id: eventId, p_status: "failed", p_error: err instanceof Error ? err.message : "error" });
          return Response.json({ error: "processing_failed" }, { status: 500 });
        }
      },
    },
  },
});
