import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyPaystackTransaction } from "@/lib/paystack";
import { sendOrderConfirmationIfNeeded } from "@/lib/email/order-confirmation";
import { logger, errorFields } from "@/lib/api/logger";

export type ApplyOutcome = {
  outcome: string;
  transitioned: boolean;
  payment_status?: string;
  order_id?: string;
  order_number?: number;
  public_id?: string;
  reference?: string;
};

/**
 * Ask Paystack what really happened to `reference`, then let the database
 * state machine apply it. Used by BOTH the webhook and the browser's return
 * page, so there is exactly one path to "paid". A browser redirect, a query
 * string, or a request body is never accepted as proof.
 */
export async function verifyAndApplyPayment(reference: string): Promise<ApplyOutcome> {
  const verified = await verifyPaystackTransaction(reference);
  if (verified.reference !== reference) {
    // Paystack answered for a different reference: refuse to apply anything.
    logger.error("payments.reference_mismatch", { reference });
    return { outcome: "reference_mismatch", transitioned: false };
  }
  const admin = getSupabaseAdmin();
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
  const result = data as ApplyOutcome;

  if (result.transitioned && result.outcome === "paid" && result.order_id) {
    // E-mail failure must never undo or hide a verified payment.
    try {
      await sendOrderConfirmationIfNeeded(result.order_id);
    } catch (err) {
      logger.error("email.order_confirmation_failed", { orderId: result.order_id, ...errorFields(err) });
    }
  }
  return result;
}
