"use client";

import { useEffect, useRef, useState } from "react";
import { useCartStore } from "@/context/cart-store";
import { formatGHS } from "@/lib/money";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { PublicPaymentStatus } from "@/lib/payments/status";

const POLL_MS = 3000;
const MAX_POLLS = 10;

export function PaymentStatusView({ reference, initial }: { reference: string; initial: PublicPaymentStatus | null }) {
  const [status, setStatus] = useState<PublicPaymentStatus | null>(initial);
  const [gaveUp, setGaveUp] = useState(false);
  const clearCart = useCartStore((s) => s.clearCart);
  const cleared = useRef(false);

  // Empty the cart only once the SERVER says the payment succeeded.
  useEffect(() => {
    if (status?.state === "paid" && !cleared.current) {
      cleared.current = true;
      clearCart();
    }
  }, [status?.state, clearCart]);

  // Pending (or temporarily unknown): ask the server again a few times.
  useEffect(() => {
    if (status && status.state !== "pending") return;
    let polls = 0;
    const timer = setInterval(async () => {
      polls += 1;
      try {
        const res = await fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`, { cache: "no-store" });
        const json = await res.json();
        if (json?.ok) {
          setStatus(json.data as PublicPaymentStatus);
          if (json.data.state !== "pending") clearInterval(timer);
        }
      } catch {
        /* keep trying */
      }
      if (polls >= MAX_POLLS) {
        clearInterval(timer);
        setGaveUp(true);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reference, status]);

  const state = status?.state ?? "pending";
  const h = "text-h2";
  const p = "mt-4 text-lead text-text-secondary";
  return (
    <div role="status" aria-live="polite">
      {state === "paid" && (
        <>
          <p className="eyebrow text-success">Payment verified</p>
          <h1 className={cn(h, "mt-3")}>Payment received</h1>
          <p className={p}>
            Thank you. Order <strong className="numeral">#{status!.orderNumber}</strong> is confirmed ({formatGHS(status!.amount)}). A confirmation e-mail is on its way.
          </p>
        </>
      )}
      {state === "pending" && (
        <>
          <p className="eyebrow text-text-muted">{gaveUp ? "Awaiting confirmation" : "Please wait"}</p>
          <h1 className={cn(h, "mt-3")}>{gaveUp ? "Still confirming your payment" : "Confirming your payment…"}</h1>
          <p className={p}>
            {gaveUp
              ? "We have not received confirmation from Paystack yet. If you were charged, your order will be updated automatically — please do not pay again. Contact us if this takes long."
              : "Please wait a moment while we confirm with Paystack. Do not close this page or pay again."}
          </p>
        </>
      )}
      {state === "failed" && (
        <>
          <p className="eyebrow text-danger">Not successful</p>
          <h1 className={cn(h, "mt-3")}>Payment was not successful</h1>
          <p className={p}>No order has been placed. Your cart is unchanged — you can go back and try again.</p>
          <ButtonLink href="/checkout" variant="primary" className="mt-6">Return to checkout</ButtonLink>
        </>
      )}
      {state === "cancelled" && (
        <>
          <p className="eyebrow text-text-muted">Cancelled</p>
          <h1 className={cn(h, "mt-3")}>Payment cancelled</h1>
          <p className={p}>You were not charged. Your cart is unchanged.</p>
          <ButtonLink href="/checkout" variant="primary" className="mt-6">Return to checkout</ButtonLink>
        </>
      )}
      {state === "needs_review" && (
        <>
          <p className="eyebrow text-warning">Manual check</p>
          <h1 className={cn(h, "mt-3")}>We’re checking your payment</h1>
          <p className={p}>Your payment needs a quick manual check by our team. You will not be charged twice. Please contact us with order #{status?.orderNumber}.</p>
        </>
      )}
    </div>
  );
}
