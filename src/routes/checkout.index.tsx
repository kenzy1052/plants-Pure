import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, MapPin, Minus, Plus, Store, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/ProductCard";
import { deliveryFeeFor, deliveryZonesQuery } from "@/lib/catalogue";
import { cartSubtotal, useCart } from "@/lib/cart-store";
import { initializeCheckout } from "@/lib/checkout.functions";
import { checkoutSchema } from "@/lib/schemas";
import { formatGHS } from "@/lib/money";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/checkout/")({
  head: () => ({
    meta: [
      { title: "Checkout | Plants & Pure" },
      { name: "description", content: "Complete your Plants & Pure order and pay securely in Ghana cedis through Paystack." },
      { property: "og:title", content: "Checkout — Plants & Pure" },
      { property: "og:description", content: "Secure checkout in Ghana cedis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Checkout,
});

type Form = { name: string; phone: string; email: string; address: string; notes: string };

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="type-label text-muted-foreground">{label}</span>
      <div className="mt-2">{children}</div>
      {error ? <span className="type-small mt-1.5 block text-destructive">{error}</span> : hint ? <span className="type-small mt-1.5 block text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "type-body h-12 w-full rounded-2xl border border-input bg-surface px-4 outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-foreground focus:ring-4 focus:ring-ring/15 aria-[invalid=true]:border-destructive";

function Checkout() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const lines = useCart((s) => s.lines);
  const setQuantity = useCart((s) => s.setQuantity);
  const removeLine = useCart((s) => s.remove);
  const { user, loading: authLoading } = useAuth();
  const zones = useQuery(deliveryZonesQuery());
  const [zoneId, setZoneId] = useState<string>("");
  const [form, setForm] = useState<Form>({ name: "", phone: "", email: "", address: "", notes: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Form | "zone", string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const start = useServerFn(initializeCheckout);

  useEffect(() => {
    if (!zoneId && zones.data?.length) setZoneId(zones.data[0]!.id);
  }, [zones.data, zoneId]);

  // Pre-fill from the signed-in customer's profile.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await getSupabase().rpc("ensure_my_profile");
      const p = (Array.isArray(data) ? data[0] : data) as { first_name?: string; last_name?: string; phone?: string; delivery_address?: string } | null;
      setForm((f) => ({
        ...f,
        email: f.email || user.email || "",
        name: f.name || [p?.first_name, p?.last_name].filter(Boolean).join(" "),
        phone: f.phone || p?.phone || "",
        address: f.address || p?.delivery_address || "",
      }));
    })();
  }, [user]);

  // Any change to the order invalidates the idempotency key.
  useEffect(() => {
    requestId.current = null;
  }, [lines, zoneId]);

  const zone = zones.data?.find((z) => z.id === zoneId);
  const subtotal = cartSubtotal(lines);
  const fee = deliveryFeeFor(zone, subtotal);
  const total = subtotal + fee;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const payload = {
      clientRequestId: requestId.current,
      items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      zoneId,
      customer: { name: form.name, phone: form.phone, email: form.email, address: zone?.is_pickup && !form.address.trim() ? `Collection: ${zone.name}` : form.address, notes: form.notes || undefined },
    };
    const parsed = checkoutSchema.safeParse(payload);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === "customer" ? (issue.path[1] as keyof Form) : issue.path[0] === "zoneId" ? "zone" : null;
        if (key && !next[key]) next[key] = key === "name" ? "Please enter your full name" : key === "address" ? "Please enter a delivery address" : key === "zone" ? "Please choose a delivery option" : issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await start({ data: parsed.data });
      if (res.ok) {
        window.location.assign(res.data.authorizationUrl);
        return;
      }
      setServerError(res.error);
      if (res.code === "duplicate_request" || res.code === "order_not_payable") requestId.current = null;
    } catch {
      setServerError("We couldn't reach the server. Please check your connection and try again.");
    }
    setSubmitting(false);
  };

  if (!hydrated) return <div className="min-h-[70vh] pt-32" />;

  if (lines.length === 0) {
    return (
      <div className="container-page flex min-h-[70vh] flex-col items-center justify-center pt-28 text-center">
        <h1 className="type-section">Your cart is empty</h1>
        <p className="type-body mt-3 text-muted-foreground">Add a few things from the shop to check out.</p>
        <Button asChild className="mt-6">
          <Link to="/shop">Browse the shop</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container-page pb-24 pt-28 sm:pt-32">
      <p className="type-label text-muted-foreground">Checkout</p>
      <h1 className="type-page mt-3">Almost yours.</h1>

      {!authLoading && !user && (
        <div role="note" className="mt-6 flex flex-col gap-4 rounded-[1.5rem] border border-border bg-sage p-5 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-forest ring-1 ring-border">
            <UserRound className="h-5 w-5" />
          </span>
          <p className="type-small min-w-0 flex-1 text-forest">
            <span className="font-semibold">You're checking out as a guest.</span> Create an account or sign in to see your orders, confirm delivery and fill in your details automatically. You can also carry on without one.
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild size="sm" variant="pepper">
              <Link to="/auth/sign-up" search={{ next: "/checkout" }}>Create account</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/auth/sign-in" search={{ next: "/checkout" }}>Sign in</Link>
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={submit} noValidate className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="space-y-10 lg:col-span-7">
          <section className="rounded-[2rem] bg-surface p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <h2 className="type-sub">Your details</h2>
              {!user && (
                <Link to="/auth/sign-in" search={{ next: "/checkout" }} className="type-small link-line text-muted-foreground">
                  Have an account? Sign in
                </Link>
              )}
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Full name" error={errors.name}>
                  <input className={inputClass} value={form.name} onChange={set("name")} autoComplete="name" aria-invalid={!!errors.name} />
                </Field>
              </div>
              <Field label="Phone" error={errors.phone}>
                <input className={inputClass} value={form.phone} onChange={set("phone")} type="tel" autoComplete="tel" placeholder="024 000 0000" aria-invalid={!!errors.phone} />
              </Field>
              <Field label="Email" error={errors.email} hint="Your receipt is sent here.">
                <input className={inputClass} value={form.email} onChange={set("email")} type="email" autoComplete="email" aria-invalid={!!errors.email} />
              </Field>
            </div>
          </section>

          <section className="rounded-[2rem] bg-surface p-6 sm:p-8">
            <h2 className="type-sub">Delivery</h2>
            {zones.isPending ? (
              <div className="mt-6 h-20 animate-pulse rounded-2xl bg-container" />
            ) : zones.isError ? (
              <p className="type-small mt-6 text-destructive">We couldn't load delivery options. Please refresh the page.</p>
            ) : zones.data.length === 0 ? (
              <p className="type-small mt-6 rounded-2xl bg-warning-soft p-4 text-warning">Online checkout is paused while delivery options are being set up. Please contact us to order.</p>
            ) : (
              <div role="radiogroup" aria-label="Delivery option" className="mt-6 grid gap-3">
                {zones.data.map((z) => {
                  const zFee = deliveryFeeFor(z, subtotal);
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={zoneId === z.id}
                      key={z.id}
                      onClick={() => setZoneId(z.id)}
                      className={cn(
                        "flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors",
                        zoneId === z.id ? "border-foreground bg-sage" : "border-border hover:border-foreground/40",
                      )}
                    >
                      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", zoneId === z.id ? "bg-forest text-forest-foreground" : "bg-container")}>
                        {z.is_pickup ? <Store className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="type-body block font-medium">{z.name}</span>
                        <span className="type-small block text-muted-foreground">
                          {z.notes || (z.is_pickup ? "Collect your order in person" : z.free_over != null ? `Free over ${formatGHS(z.free_over)}` : "Delivered to your address")}
                        </span>
                      </span>
                      <span className="type-small font-medium tabular-nums">{zFee === 0 ? "Free" : formatGHS(zFee)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {errors.zone && <p className="type-small mt-2 text-destructive">{errors.zone}</p>}
            <div className="mt-6 grid gap-5">
              {!zone?.is_pickup && (
                <Field label="Delivery address" error={errors.address}>
                  <textarea className={cn(inputClass, "h-24 py-3")} value={form.address} onChange={set("address")} autoComplete="street-address" placeholder="House number, street, area, landmark" aria-invalid={!!errors.address} />
                </Field>
              )}
              <Field label="Order notes (optional)">
                <textarea className={cn(inputClass, "h-20 py-3")} value={form.notes} onChange={set("notes")} maxLength={500} />
              </Field>
            </div>
          </section>
        </div>

        <aside className="lg:col-span-5">
          <div className="rounded-[2rem] bg-container p-6 sm:p-8 lg:sticky lg:top-28">
            <h2 className="type-sub">Order summary</h2>
            <ul className="mt-6 divide-y divide-border">
              {lines.map((l) => (
                <li key={l.productId} className="flex items-center gap-4 py-4">
                  <div className="h-16 w-14 shrink-0 overflow-hidden rounded-xl bg-surface">
                    <ProductImage src={l.image} alt={l.title} w={140} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to="/product/$slug" params={{ slug: l.slug }} className="type-small block truncate font-medium hover:text-brand">{l.title}</Link>
                    <div className="mt-2 inline-flex items-center rounded-full border border-border bg-surface">
                      <button type="button" aria-label={`Decrease quantity of ${l.title}`} disabled={l.quantity <= 1} onClick={() => setQuantity(l.productId, l.quantity - 1)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-container disabled:opacity-40">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">{l.quantity}</span>
                      <button type="button" aria-label={`Increase quantity of ${l.title}`} disabled={l.quantity >= l.stock} onClick={() => setQuantity(l.productId, l.quantity + 1)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-container disabled:opacity-40">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="type-small tabular-nums">{formatGHS(l.price * l.quantity)}</span>
                    <button type="button" onClick={() => removeLine(l.productId)} aria-label={`Remove ${l.title} from your order`} className="type-small inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="type-small mt-4 space-y-2 border-t border-border pt-4">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatGHS(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{zone?.is_pickup ? "Collection" : "Delivery"}</dt><dd className="tabular-nums">{zone ? (fee === 0 ? "Free" : formatGHS(fee)) : "—"}</dd></div>
              <div className="flex items-baseline justify-between border-t border-border pt-3"><dt className="type-body font-medium">Total</dt><dd className="type-sub tabular-nums">{formatGHS(total)}</dd></div>
            </dl>
            <p className="type-small mt-2 text-muted-foreground">Final prices and stock are confirmed by our system before payment.</p>
            {serverError && <p role="alert" className="type-small mt-4 rounded-2xl bg-destructive/10 p-4 text-destructive">{serverError}</p>}
            <Button type="submit" variant="pepper" size="lg" className="mt-6 w-full" disabled={submitting || !zones.data?.length}>
              {submitting ? <Loader2 className="animate-spin" /> : <Lock />}
              {submitting ? "Connecting to Paystack…" : `Pay ${formatGHS(total)}`}
            </Button>
            <p className="type-label mt-4 text-center text-muted-foreground">You'll be taken to Paystack to pay securely</p>
            <p className="type-small mt-3 text-center">
              <Link to="/shop" className="link-line text-muted-foreground hover:text-foreground">Continue shopping</Link>
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
