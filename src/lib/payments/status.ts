import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyAndApplyPayment } from "@/lib/payments/service";
import { Errors } from "@/lib/api/errors";
import { logger, errorFields } from "@/lib/api/logger";

export type PublicPaymentStatus = {
  reference: string;
  orderNumber: number;
  /** what the customer should see */
  state: "paid" | "pending" | "failed" | "cancelled" | "needs_review";
  amount: number;
  currency: string;
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

export async function getPaymentStatus(reference: string): Promise<PublicPaymentStatus> {
  const admin = getSupabaseAdmin();
  const read = async () => {
    const { data, error } = await admin
      .from("payments")
      .select("reference, status, orders(order_number, payment_status, total_amount, currency)")
      .eq("reference", reference)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  let row = await read();
  if (!row) throw Errors.notFound("We could not find that payment.");

  // Still open locally → ask Paystack (covers a slow or missing webhook).
  if (OPEN.has(row.status)) {
    try {
      await verifyAndApplyPayment(reference);
      row = (await read()) ?? row;
    } catch (err) {
      // A provider hiccup must not turn into an error page; the customer sees "pending".
      logger.warn("payments.status_verify_failed", { reference, ...errorFields(err) });
    }
  }

  const order = (Array.isArray(row.orders) ? row.orders[0] : row.orders) as {
    order_number: number;
    payment_status: string;
    total_amount: number | string;
    currency: string;
  };
  return {
    reference: row.reference,
    orderNumber: order.order_number,
    state: toState(row.status, order.payment_status),
    amount: Number(order.total_amount),
    currency: order.currency,
  };
}
