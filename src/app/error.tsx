"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CONTACT } from "@/lib/constants/business";

/** Route-level error boundary: a calm message, a retry, and a real way to reach the business. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The server has already logged the cause (with the digest); the browser console gets the reference only.
    console.error("Route error", error.digest ?? "(no digest)");
  }, [error]);

  return (
    <div className="container-page py-20 md:py-28" role="alert">
      <p className="eyebrow text-danger">Something went wrong</p>
      <h1 className="mt-4 text-h1">We couldn’t load this page</h1>
      <p className="mt-5 max-w-prose text-lead text-text-secondary">This is on our side, not yours. Please try again, or contact us on {CONTACT.primaryPhone}.</p>
      {error.digest && <p className="mt-3 text-small text-text-muted">Reference: <span className="numeral">{error.digest}</span></p>}
      <div className="mt-10 flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => reset()}>Try again</Button>
        <ButtonLink href="/shop" variant="secondary">Browse the shop</ButtonLink>
        <ButtonLink href="/contact" variant="quiet">Contact us</ButtonLink>
      </div>
    </div>
  );
}
