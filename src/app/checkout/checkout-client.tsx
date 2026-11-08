"use client";

import { useRef, useState } from "react";
import { useCartStore } from "@/context/cart-store";
import { formatGHS } from "@/lib/money";
import { CONTACT } from "@/lib/constants/business";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";

export type CheckoutZone = { id: string; name: string; fee: number; freeOver: number | null; isPickup: boolean };

type ApiFailure = { error?: { code?: string; message?: string; details?: Record<string, string[]> } };

export function CheckoutClient({ zones, loadFailed }: { zones: CheckoutZone[]; loadFailed: boolean }) {
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const getSubtotal = useCartStore((s) => s.getSubtotal);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // One idempotency key per distinct checkout payload: a double-click re-sends the SAME key
  // (the server returns the same order), while a changed cart gets a fresh key.
  const keyRef = useRef<{ sig: string; id: string } | null>(null);

  const zone = zones.find((z) => z.id === zoneId);
  const subtotal = getSubtotal();
  const deliveryFee = !zone ? 0 : zone.freeOver !== null && subtotal >= zone.freeOver ? 0 : zone.fee;
  const total = subtotal + deliveryFee; // display estimate; the server computes the charged amount

  async function startPayment() {
    setError(null);
    setFieldErrors({});
    if (!zone) {
      setError("Please choose a delivery option.");
      return;
    }
    const payload = {
      items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      zoneId,
      customer: { name, phone, email, address },
    };
    const sig = JSON.stringify(payload);
    if (keyRef.current?.sig !== sig) keyRef.current = { sig, id: crypto.randomUUID() };

    setIsProcessing(true);
    try {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, clientRequestId: keyRef.current.id }),
      });
      const json = (await res.json().catch(() => null)) as ({ ok: true; data: { authorizationUrl: string } } & ApiFailure) | ({ ok: false } & ApiFailure) | null;
      if (res.ok && json && json.ok === true) {
        // Hand over to Paystack's hosted page. The order is only marked paid after the SERVER verifies it.
        window.location.assign(json.data.authorizationUrl);
        return; // keep the button disabled while navigating
      }
      const failure = json && json.ok === false ? json.error : undefined;
      if (failure?.details && failure.code === "validation_failed") setFieldErrors(failure.details);
      setError(failure?.message ?? "We could not start your payment. Please try again.");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    }
    setIsProcessing(false);
  }

  const fieldError = (key: string) => fieldErrors[key]?.[0];
  const noDelivery = loadFailed || zones.length === 0;
  const incomplete = !name || !phone || !email || !address;

  if (!hydrated) {
    return (
      <div className="container-page pb-24 pt-10" role="status" aria-label="Loading checkout">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-8 h-14 w-64" />
        <Skeleton className="mt-8 h-96 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState title="Your cart is empty" action={<ButtonLink href="/shop" variant="primary">Browse the shop</ButtonLink>}>
          <p>Add something to your cart and it will appear here.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="container-page pb-24 pt-6 md:pt-10">
      <Breadcrumbs items={[{ label: "Shop", href: "/shop" }, { label: "Checkout" }]} />
      <h1 className="mt-6 text-h1">Checkout</h1>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-20">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!isProcessing && !incomplete && !noDelivery && items.length > 0) void startPayment();
          }}
          className="space-y-6"
          aria-label="Delivery details"
        >
          <h2 className="eyebrow border-b border-border pb-3 text-text-muted">1 · Delivery details</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" required error={fieldError("customer.name")}>
              {(a) => <Input {...a} type="text" autoComplete="name" placeholder="e.g. Abena Mensah" value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Phone number" required error={fieldError("customer.phone")} hint="For delivery updates.">
              {(a) => <Input {...a} type="tel" autoComplete="tel" inputMode="tel" placeholder="e.g. 024 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />}
            </Field>
          </div>

          <Field label="Email address" required error={fieldError("customer.email")} hint="Your payment receipt and order confirmation are sent here.">
            {(a) => <Input {...a} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Delivery option" required error={fieldError("zoneId")}>
              {(a) => (
                <Select {...a} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} — {z.fee === 0 ? "No charge" : formatGHS(z.fee)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Address or landmark" required error={fieldError("customer.address")}>
              {(a) => <Input {...a} type="text" autoComplete="street-address" placeholder="House 4, near Shell Station" value={address} onChange={(e) => setAddress(e.target.value)} />}
            </Field>
          </div>

          <p className="border-l-2 border-border-strong pl-4 text-small text-text-secondary">
            You will pay on Paystack&apos;s secure page. We never see or store your card or mobile-money details.
          </p>
        </form>

        <aside aria-labelledby="summary-heading" className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
          <div className="bg-surface p-6 md:p-8">
            <h2 id="summary-heading" className="eyebrow border-b border-border pb-3 text-text-muted">2 · Order summary</h2>

            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.product.id} className="flex justify-between gap-4 py-4 text-small">
                  <div>
                    <p className="font-semibold">{item.product.title}</p>
                    <p className="numeral text-text-muted">Quantity {item.quantity}</p>
                  </div>
                  <p className="numeral font-semibold">{formatGHS(item.product.price * item.quantity)}</p>
                </li>
              ))}
            </ul>

            <dl className="numeral space-y-2 border-t border-border pt-4 text-small">
              <div className="flex justify-between text-text-secondary">
                <dt>Subtotal</dt>
                <dd>{formatGHS(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-text-secondary">
                <dt>{zone?.isPickup ? "Collection" : "Delivery"}</dt>
                <dd>{formatGHS(deliveryFee)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-body font-semibold">
                <dt>Total</dt>
                <dd>{formatGHS(total)}</dd>
              </div>
            </dl>

            <Button
              type="button"
              variant="accent"
              size="lg"
              className="mt-6 w-full"
              loading={isProcessing}
              disabled={isProcessing || noDelivery || incomplete}
              onClick={() => void startPayment()}
            >
              {isProcessing ? "Connecting to Paystack…" : <>Pay <span className="numeral">{formatGHS(total)}</span></>}
            </Button>
            {incomplete && !noDelivery && <p className="mt-3 text-caption text-text-muted">Fill in all delivery details to continue.</p>}
            {error && (
              <p role="alert" className="mt-4 border-l-2 border-danger pl-3 text-small font-medium text-danger">
                {error}
              </p>
            )}
            {noDelivery && (
              <p role="status" className="mt-4 text-small text-text-secondary">
                Online delivery options are not available yet. Please contact us on {CONTACT.primaryPhone} or {CONTACT.email} to place your order.
              </p>
            )}
            <p className="mt-4 text-caption text-text-muted">
              The final amount is confirmed by our server when you pay. Prices and availability are re-checked at that moment.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
