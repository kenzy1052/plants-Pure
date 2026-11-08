import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <div className="container-page py-20 md:py-28">
      <p className="eyebrow numeral text-text-muted">404</p>
      <h1 className="mt-4 text-h1">We can’t find that page</h1>
      <p className="mt-5 max-w-prose text-lead text-text-secondary">The link may be out of date, or the product may no longer be available.</p>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/shop" variant="primary">Browse the shop</ButtonLink>
        <ButtonLink href="/" variant="secondary">Go to the home page</ButtonLink>
        <ButtonLink href="/contact" variant="quiet">Contact us</ButtonLink>
      </div>
    </div>
  );
}
