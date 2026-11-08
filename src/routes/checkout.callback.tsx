import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Check, CheckCircle2, Clock, Copy, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkPaymentStatus } from "@/lib/checkout.functions";
import { useCart } from "@/lib/cart-store";
import { formatGHS } from "@/lib/money";

export const Route = createFileRoute("/checkout/callback")({
  validateSearch: (s) => z.object({ reference: z.string().max(64).optional().catch(undefined), trxref: z.string().max(64).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "Payment status | Plants & Pure" },
      { name: "description", content: "Check the status of your Plants & Pure payment." },
      { property: "og:title", content: "Payment status — Plants & Pure" },
      { property: "og:description", content: "Your Plants & Pure order status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Callback,
});

type Status = { reference: string; orderNumber: number; state: "paid" | "pending" | "failed" | "cancelled" | "needs_review"; amount: number; currency: string; trackingCode: string | null };

/** The redirect only says WHICH payment to look at. The server asks Paystack before showing "paid". */
function Callback() {
  const { reference, trxref } = Route.useSearch();
  const ref = reference || trxref || "";
  const check = useServerFn(checkPaymentStatus);
  const clear = useCart((s) => s.clear);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tries = useRef(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!/^PP-\d{1,10}-[0-9a-f]{12}$/.test(ref)) {
      setError("This payment link is not valid.");
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await check({ data: { reference: ref } });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setStatus(res.data);
        if (res.data.state === "paid") clear();
        if (res.data.state === "pending" && tries.current++ < 40) timer = setTimeout(poll, 3000);
      } catch {
        if (!cancelled && tries.current++ < 40) timer = setTimeout(poll, 4000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = error ? "error" : status?.state ?? "loading";
  const view = {
    loading: { icon: <Loader2 className="h-8 w-8 animate-spin" />, tone: "bg-container", title: "Checking your payment…", body: "This only takes a moment." },
    pending: { icon: <Clock className="h-8 w-8" />, tone: "bg-warning-soft text-warning", title: "Waiting for confirmation", body: "Paystack is still confirming your payment. This page updates automatically." },
    paid: { icon: <CheckCircle2 className="h-8 w-8" />, tone: "bg-sage text-forest", title: "Thank you — payment received", body: "Your order is confirmed. A receipt is on its way to your email." },
    needs_review: { icon: <Clock className="h-8 w-8" />, tone: "bg-warning-soft text-warning", title: "Payment received — we're reviewing your order", body: "We'll contact you shortly about your order." },
    failed: { icon: <XCircle className="h-8 w-8" />, tone: "bg-destructive/10 text-destructive", title: "Payment didn't go through", body: "You haven't been charged. You can try again from your cart." },
    cancelled: { icon: <XCircle className="h-8 w-8" />, tone: "bg-container", title: "Payment cancelled", body: "No payment was taken. Your cart is still saved." },
    error: { icon: <XCircle className="h-8 w-8" />, tone: "bg-destructive/10 text-destructive", title: "We couldn't check this payment", body: error ?? "" },
  }[state];

  return (
    <div className="container-page flex min-h-[80vh] items-center justify-center pb-20 pt-32">
      <div className="w-full max-w-lg rounded-[2rem] bg-surface p-8 text-center shadow-soft sm:p-12">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${view.tone}`}>{view.icon}</div>
        <h1 className="type-section mt-6">{view.title}</h1>
        <p className="type-body mt-3 text-muted-foreground">{view.body}</p>
        {status?.trackingCode && (
          <div className="mt-8 rounded-2xl border-2 border-dashed border-pepper/60 bg-pepper/5 p-5">
            <p className="type-label text-muted-foreground">Your tracking code</p>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="font-display text-3xl tracking-wide">{status.trackingCode}</span>
              <button
                type="button"
                aria-label="Copy tracking code"
                onClick={() => {
                  navigator.clipboard?.writeText(status.trackingCode!).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  });
                }}
                className="rounded-full p-2 hover:bg-container"
              >
                {copied ? <Check className="h-4 w-4 text-olive" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="type-small mt-2 text-muted-foreground">Keep this code to follow your order. It's also in your receipt email.</p>
          </div>
        )}
        {status && (
          <dl className="type-small mt-8 grid grid-cols-2 gap-3 rounded-2xl bg-container p-5 text-left">
            <dt className="text-muted-foreground">Order</dt>
            <dd className="text-right font-medium">#{status.orderNumber}</dd>
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="text-right font-medium tabular-nums">{formatGHS(status.amount)}</dd>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="truncate text-right font-mono text-xs">{status.reference}</dd>
          </dl>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {state === "paid" || state === "needs_review" ? (
            <>
              {status?.trackingCode && (
                <Button asChild variant="pepper">
                  <Link to="/track" search={{ code: status.trackingCode }}>Track my order</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to="/shop">Continue shopping</Link>
              </Button>
            </>
          ) : state === "failed" || state === "cancelled" ? (
            <Button asChild variant="pepper">
              <Link to="/checkout">Try again</Link>
            </Button>
          ) : state === "error" ? (
            <Button asChild variant="outline">
              <Link to="/contact">Contact us</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
