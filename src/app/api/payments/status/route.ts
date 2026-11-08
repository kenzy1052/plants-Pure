import { z } from "zod";
import { ok, route } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { getPaymentStatus } from "@/lib/payments/status";

export const dynamic = "force-dynamic";

const querySchema = z.object({ reference: z.string().trim().regex(/^PP-\d{1,10}-[0-9a-f]{12}$/, "Invalid reference") });

/**
 * Returns only the verified state of ONE payment, looked up by its unguessable
 * reference. It returns no personal data. If the webhook has not arrived yet it
 * asks Paystack directly (verifyAndApplyPayment) — the browser's redirect is
 * only a hint to go and check, never the proof.
 */
export const GET = route("payments.status", async (req: Request) => {
  enforceRateLimit(req, "payments.status", { max: 60, windowMs: 60_000 });
  const { reference } = querySchema.parse({ reference: new URL(req.url).searchParams.get("reference") ?? "" });
  return ok(await getPaymentStatus(reference));
});
