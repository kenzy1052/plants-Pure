import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Check, Loader2, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReceivedButton } from "@/components/shop/ReceivedButton";
import { trackOrder } from "@/lib/checkout.functions";
import { FULFILMENT_STEPS, parseTrackingCode } from "@/lib/tracking";
import { formatGHS } from "@/lib/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/track")({
  validateSearch: (s) => z.object({ code: z.string().max(40).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "Track your order | Plants & Pure" },
      { name: "description", content: "Enter the tracking code from your Plants & Pure receipt to see where your order is." },
      { property: "og:title", content: "Track your order — Plants & Pure" },
      { property: "og:description", content: "Check the status of your Plants & Pure order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Track,
});

type Tracked = {
  code: string;
  orderNumber: number;
  placedAt: string;
  paidAt: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  total: number;
  deliveryFee: number;
  zoneName: string | null;
  isPickup: boolean;
  items: { title: string; quantity: number }[];
};

function Track() {
  const { code } = Route.useSearch();
  const navigate = useNavigate({ from: "/track" });
  const lookup = useServerFn(trackOrder);
  const [input, setInput] = useState(code ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Tracked | null>(null);

  useEffect(() => {
    if (!code) return;
    setInput(code);
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await lookup({ data: { code } });
        if (cancelled) return;
        if (res.ok) setOrder(res.data);
        else {
          setOrder(null);
          setError(res.error);
        }
      } catch {
        if (!cancelled) setError("Tracking isn't available right now. Please try again shortly.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parseTrackingCode(input)) {
      setError("Tracking codes look like PP-12-9F3A2C1B. Please check your receipt.");
      return;
    }
    navigate({ search: { code: input.trim().toUpperCase() } });
  };

  const cancelled = order?.fulfillmentStatus === "cancelled" || order?.paymentStatus === "cancelled";
  const stepIndex = order ? FULFILMENT_STEPS.findIndex((s) => s.key === order.fulfillmentStatus) : -1;

  return (
    <div className="container-page pb-16 pt-32 sm:pt-36">
      <div className="mx-auto max-w-2xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sage text-forest">
          <PackageSearch className="h-6 w-6" />
        </div>
        <h1 className="type-page mt-5">Track your order</h1>
        <p className="type-body mt-3 text-muted-foreground">Enter the tracking code shown after payment and in your receipt email.</p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="PP-12-9F3A2C1B"
            aria-label="Tracking code"
            className="h-14 flex-1 rounded-full border border-input bg-surface px-6 font-semibold uppercase tracking-wider outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal focus:border-foreground focus:ring-4 focus:ring-ring/15"
          />
          <Button type="submit" variant="pepper" size="lg" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} Track
          </Button>
        </form>
        {error && <p role="alert" className="type-small mt-4 rounded-2xl bg-destructive/10 p-4 text-destructive">{error}</p>}

        {order && (
          <section className="mt-10 overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-6">
              <div>
                <p className="type-label text-muted-foreground">Order #{order.orderNumber}</p>
                <p className="type-sub mt-1">{order.code}</p>
              </div>
              <p className="type-small text-muted-foreground">Placed {new Date(order.placedAt).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>

            <div className="p-6">
              {cancelled ? (
                <p className="type-body rounded-xl bg-container p-4">This order was cancelled. If you think this is a mistake, please contact us.</p>
              ) : order.fulfillmentStatus === "on_hold" ? (
                <p className="type-body rounded-xl bg-warning-soft p-4 text-warning">Your order is on hold — we'll contact you shortly.</p>
              ) : order.paymentStatus !== "paid" ? (
                <p className="type-body rounded-xl bg-warning-soft p-4 text-warning">We haven't received payment for this order yet.</p>
              ) : (
                <ol className="grid gap-4 sm:grid-cols-4">
                  {FULFILMENT_STEPS.map((s, i) => {
                    const done = i <= stepIndex;
                    const label = order.isPickup && s.key === "dispatched" ? "Ready to collect" : order.isPickup && s.key === "delivered" ? "Collected" : s.label;
                    return (
                      <li key={s.key} className="flex items-center gap-3 sm:flex-col sm:items-start">
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2", done ? "border-pepper bg-pepper text-pepper-foreground" : "border-border text-muted-foreground")}>
                          {done ? <Check className="h-4 w-4" /> : i + 1}
                        </span>
                        <span className={cn("type-small font-semibold", !done && "text-muted-foreground")}>{label}</span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {order.paymentStatus === "paid" && order.fulfillmentStatus === "dispatched" && (
                <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-sage p-4">
                  <p className="type-small min-w-0 flex-1 text-forest">{order.isPickup ? "Your order is ready. Collected it already?" : "Your order is on its way. Has it arrived?"}</p>
                  <ReceivedButton code={order.code} pickup={order.isPickup} onDone={() => setOrder((o) => (o ? { ...o, fulfillmentStatus: "delivered" } : o))} />
                </div>
              )}

              <ul className="mt-8 divide-y divide-border border-t border-border">
                {order.items.map((i, idx) => (
                  <li key={idx} className="type-small flex justify-between py-3">
                    <span>{i.title}</span>
                    <span className="text-muted-foreground">× {i.quantity}</span>
                  </li>
                ))}
              </ul>
              <div className="type-small mt-2 flex justify-between border-t border-border pt-4">
                <span className="text-muted-foreground">{order.isPickup ? "Collection" : "Delivery"}{order.zoneName ? ` · ${order.zoneName}` : ""}</span>
                <span>{order.deliveryFee === 0 ? "Free" : formatGHS(order.deliveryFee)}</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="type-body font-semibold">Total</span>
                <span className="type-body font-bold tabular-nums">{formatGHS(order.total)}</span>
              </div>
            </div>
          </section>
        )}

        <p className="type-small mt-8 text-muted-foreground">
          Lost your code? Signed-in customers can see all orders in <Link to="/account" className="link-line text-foreground">My account</Link>, or <Link to="/contact" className="link-line text-foreground">contact us</Link>.
        </p>
      </div>
    </div>
  );
}
