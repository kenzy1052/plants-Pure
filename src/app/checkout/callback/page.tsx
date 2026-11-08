import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getPaymentStatus, type PublicPaymentStatus } from "@/lib/payments/status";
import { CONTACT } from "@/lib/constants/business";
import { logger, errorFields } from "@/lib/api/logger";
import { PaymentStatusView } from "./status-view";

export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const REFERENCE = /^PP-\d{1,10}-[0-9a-f]{12}$/;

/**
 * Where Paystack sends the customer afterwards. The redirect only tells us
 * WHICH payment to look at — the page then asks Paystack (server-side) what
 * really happened. `?reference=` or `?trxref=` in the URL proves nothing.
 */
export default async function CheckoutCallbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = [sp.reference, sp.trxref].flat().find((v): v is string => typeof v === "string") ?? "";

  if (!REFERENCE.test(raw)) {
    return (
      <Shell>
        <h1 className="text-h2">We couldn’t find that payment</h1>
        <p className="mt-4 text-text-secondary">The payment link looks incomplete. If you were charged, please contact us with your payment reference.</p>
        <Contact />
      </Shell>
    );
  }

  let initial: PublicPaymentStatus | null = null;
  try {
    initial = await getPaymentStatus(raw);
  } catch (err) {
    logger.warn("callback.status_failed", { reference: raw, ...errorFields(err) });
  }

  return (
    <Shell>
      <PaymentStatusView reference={raw} initial={initial} />
      <Contact />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page py-16 md:py-24">
      <div className="mx-auto max-w-xl">{children}</div>
    </div>
  );
}

function Contact() {
  return (
    <div className="mt-10 space-y-4 border-t border-border pt-6 text-small text-text-secondary">
      <p>
        Questions? <a className="underline underline-offset-4" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> ·{" "}
        <a className="underline underline-offset-4" href={`tel:${CONTACT.primaryTel}`}>{CONTACT.primaryPhone}</a>
      </p>
      <ButtonLink href="/" variant="secondary">Back to home</ButtonLink>
    </div>
  );
}
