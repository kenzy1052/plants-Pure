import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, PackageCheck, Receipt, TrendingUp, Wallet } from "lucide-react";
import { formatGHS } from "@/lib/money";
import { rpc, type AdminListItem } from "@/lib/admin";
import { staffOrdersQuery } from "./OrdersPanel";

export function OverviewPanel({ isAdmin }: { isAdmin: boolean }) {
  const orders = useQuery(staffOrdersQuery);
  const products = useQuery({
    queryKey: ["admin-products-overview"],
    enabled: isAdmin,
    queryFn: () => rpc<{ items: AdminListItem[]; total: number }>("admin_list_products", { p_q: null, p_status: null, p_category_id: null, p_page: 1, p_page_size: 100 }),
  });

  const all = orders.data ?? [];
  const paid = all.filter((o) => o.payment_status === "paid");
  const revenue = paid.reduce((a, o) => a + Number(o.total_amount), 0);
  const week = Date.now() - 7 * 86_400_000;
  const weekPaid = paid.filter((o) => new Date(o.created_at).getTime() >= week);
  const todo = paid.filter((o) => !["delivered", "cancelled"].includes(o.fulfillment_status));
  const toPack = paid.filter((o) => ["unfulfilled", "processing"].includes(o.fulfillment_status));
  const items = products.data?.items ?? [];
  const low = items.filter((p) => p.status === "published" && p.stock <= (p.low_stock_threshold ?? 5));

  const stats = [
    { icon: Wallet, label: "Total sales", value: formatGHS(revenue), hint: `${paid.length} paid order${paid.length === 1 ? "" : "s"}` },
    { icon: TrendingUp, label: "Last 7 days", value: formatGHS(weekPaid.reduce((a, o) => a + Number(o.total_amount), 0)), hint: `${weekPaid.length} order${weekPaid.length === 1 ? "" : "s"}` },
    { icon: PackageCheck, label: "To pack", value: String(toPack.length), hint: `${todo.length} not completed yet` },
    { icon: Receipt, label: "Awaiting payment", value: String(all.filter((o) => o.payment_status === "pending").length), hint: "unpaid checkouts" },
  ];

  return (
    <div>
      <h1 className="type-page">Dashboard</h1>
      <p className="type-body mt-2 text-muted-foreground">How the shop is doing.</p>
      <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label} className="rounded-[1.25rem] border border-border bg-surface p-4 sm:p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sage text-olive"><s.icon className="h-4 w-4" /></span>
            <p className="type-sub mt-4 tabular-nums">{orders.isPending ? "–" : s.value}</p>
            <p className="type-small font-medium">{s.label}</p>
            <p className="type-small text-muted-foreground">{s.hint}</p>
          </li>
        ))}
      </ul>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[1.25rem] border border-border bg-surface p-5">
          <div className="flex items-center justify-between"><h2 className="type-product">Needs attention</h2><Link to="/admin" search={{ tab: "orders" }} className="type-small font-semibold hover:text-brand">Open orders</Link></div>
          {todo.length === 0 ? <p className="type-small mt-3 text-muted-foreground">All paid orders are completed.</p> : (
            <ul className="mt-3 divide-y divide-border">
              {todo.slice(0, 6).map((o) => (
                <li key={o.id} className="type-small flex items-center justify-between py-2.5"><span>#{o.order_number} · {o.customer_name}</span><span className="text-muted-foreground">{o.fulfillment_status.replace(/_/g, " ")}</span></li>
              ))}
            </ul>
          )}
        </section>
        {isAdmin && (
          <section className="rounded-[1.25rem] border border-border bg-surface p-5">
            <div className="flex items-center justify-between"><h2 className="type-product">Products</h2><Link to="/admin" search={{ tab: "products" }} className="type-small font-semibold hover:text-brand">Manage</Link></div>
            <p className="type-small mt-3 text-muted-foreground">
              {items.filter((p) => p.status === "published").length} live · {items.filter((p) => p.status === "draft").length} drafts
            </p>
            {low.length > 0 && (
              <div className="mt-3 rounded-xl bg-warning-soft p-3 text-warning">
                <p className="type-small flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Running low</p>
                <ul className="type-small mt-1">{low.slice(0, 6).map((p) => <li key={p.id}>{p.title} — {p.stock} left</li>)}</ul>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
