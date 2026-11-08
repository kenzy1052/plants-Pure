import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Package, Phone, Search } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { formatGHS } from "@/lib/money";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/admin";
import { STAFF_STATUS_KEYS, statusLabel, trackingCode } from "@/lib/tracking";

export type StaffOrder = {
  id: string;
  order_number: number;
  public_id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string;
  delivery_area: string;
  total_amount: number;
  payment_status: string;
  fulfillment_status: string;
  notes: string | null;
  order_items: { product_title: string; quantity: number }[];
  delivery_zones: { name: string; is_pickup: boolean } | { name: string; is_pickup: boolean }[] | null;
};
export const pickup = (o: StaffOrder) => Boolean((Array.isArray(o.delivery_zones) ? o.delivery_zones[0] : o.delivery_zones)?.is_pickup);

export const staffOrdersQuery = {
  queryKey: ["staff-orders"],
  queryFn: async () => {
    const { data, error } = await getSupabase()
      .from("orders")
      .select("id, order_number, public_id, created_at, customer_name, customer_phone, customer_email, delivery_address, delivery_area, total_amount, payment_status, fulfillment_status, notes, order_items(product_title, quantity), delivery_zones(name, is_pickup)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as unknown as StaffOrder[];
  },
  refetchInterval: 60_000,
};

const FILTERS = [
  { key: "todo", label: "To do" },
  { key: "all", label: "All" },
  { key: "done", label: "Completed" },
  { key: "unpaid", label: "Unpaid" },
] as const;

export function OrdersPanel() {
  const qc = useQueryClient();
  const orders = useQuery(staffOrdersQuery);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("todo");
  const [q, setQ] = useState("");

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await getSupabase().from("orders").update({ fulfillment_status: status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff-orders"] });
      toast.success("Order updated — the customer sees it on their tracking page");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (orders.data ?? []).filter((o) => {
      const paid = o.payment_status === "paid";
      if (filter === "todo" && !(paid && !["delivered", "cancelled"].includes(o.fulfillment_status))) return false;
      if (filter === "done" && o.fulfillment_status !== "delivered") return false;
      if (filter === "unpaid" && paid) return false;
      if (!term) return true;
      return [String(o.order_number), o.customer_name, o.customer_phone, o.customer_email ?? "", trackingCode(o.order_number, o.public_id)].some((v) => v.toLowerCase().includes(term));
    });
  }, [orders.data, filter, q]);

  return (
    <div>
      <h1 className="type-page">Orders</h1>
      <p className="type-body mt-2 text-muted-foreground">Update each order as it moves along. Customers see the change straight away when they track it.</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cn("type-small shrink-0 rounded-full px-4 py-2 font-medium", filter === f.key ? "bg-foreground text-background" : "bg-container hover:bg-sage-strong")}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative flex items-center sm:w-72">
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, order number" aria-label="Search orders" className="type-small h-11 w-full rounded-full bg-container pl-10 pr-4 outline-none focus:ring-2 focus:ring-ring" />
        </label>
      </div>

      <div className="mt-6 space-y-3">
        {orders.isPending ? (
          <div className="h-40 animate-pulse rounded-[1.25rem] bg-container" />
        ) : orders.isError ? (
          <p className="type-body rounded-2xl bg-destructive/10 p-4 text-destructive">We couldn't load the orders.</p>
        ) : list.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border p-10 text-center">
            <Package className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="type-body mt-3 text-muted-foreground">{filter === "todo" ? "Nothing to do right now — all paid orders are completed." : "No orders match."}</p>
          </div>
        ) : (
          list.map((o) => {
            const paid = o.payment_status === "paid" || o.payment_status === "refunded";
            const isP = pickup(o);
            const pending = setStatus.isPending && setStatus.variables?.id === o.id;
            return (
              <article key={o.id} className="rounded-[1.25rem] border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="type-product">Order #{o.order_number} · {o.customer_name}</p>
                    <p className="type-small text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {trackingCode(o.order_number, o.public_id)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="type-body font-bold tabular-nums">{formatGHS(o.total_amount)}</p>
                    <span className={cn("type-label rounded-full px-2.5 py-1", o.payment_status === "paid" ? "bg-sage text-forest" : "bg-warning-soft text-warning")}>{o.payment_status}</span>
                  </div>
                </div>
                <p className="type-small mt-3 text-muted-foreground">{o.order_items.map((i) => `${i.quantity} × ${i.product_title}`).join(" · ")}</p>
                <p className="type-small mt-2">
                  <span className="font-semibold">{isP ? "Collection" : "Delivery"}:</span> {o.delivery_address}{o.delivery_area ? `, ${o.delivery_area}` : ""}
                </p>
                <p className="type-small mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                  <a href={`tel:${o.customer_phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground"><Phone className="h-3.5 w-3.5" />{o.customer_phone}</a>
                  {o.customer_email && <a href={`mailto:${o.customer_email}`} className="hover:text-foreground">{o.customer_email}</a>}
                </p>
                {o.notes && <p className="type-small mt-2 rounded-xl bg-container p-3">Note: {o.notes}</p>}

                <div className="mt-4 border-t border-border pt-4">
                  <p className="type-label mb-2 flex items-center gap-2 text-muted-foreground">Status {pending && <Loader2 className="h-3 w-3 animate-spin" />}</p>
                  {o.fulfillment_status === "cancelled" ? (
                    <p className="type-small text-muted-foreground">Cancelled</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {STAFF_STATUS_KEYS.map((k) => {
                        const active = o.fulfillment_status === k;
                        const needsPayment = k !== "unfulfilled" && k !== "on_hold" && !paid;
                        return (
                          <button
                            key={k}
                            type="button"
                            disabled={active || needsPayment || setStatus.isPending}
                            onClick={() => setStatus.mutate({ id: o.id, status: k })}
                            title={needsPayment ? "Payment hasn't been received yet" : undefined}
                            className={cn(
                              "type-small inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed",
                              active ? "bg-brand-gradient text-pepper-foreground" : "bg-container hover:bg-sage-strong disabled:opacity-40",
                            )}
                          >
                            {active && <Check className="h-3.5 w-3.5" />}
                            {statusLabel(k, isP)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
