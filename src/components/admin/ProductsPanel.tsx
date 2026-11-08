import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ImageOff, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cldUrl } from "@/lib/catalogue";
import { formatGHS } from "@/lib/money";
import { cn } from "@/lib/utils";
import { rpc, type AdminListItem } from "@/lib/admin";

const STATUSES = [
  { key: "", label: "All" },
  { key: "published", label: "Live" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
] as const;
const TONE = { published: "bg-sage text-forest", draft: "bg-warning-soft text-warning", archived: "bg-container text-muted-foreground" } as const;
const LABEL = { published: "Live", draft: "Draft", archived: "Archived" } as const;

export function ProductsPanel() {
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["admin-products", status, q, page],
    placeholderData: (p) => p,
    queryFn: () => rpc<{ items: AdminListItem[]; total: number; page_size: number }>("admin_list_products", { p_q: q || null, p_status: status || null, p_category_id: null, p_page: page, p_page_size: 20 }),
  });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.page_size)) : 1;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-page">Products</h1>
          <p className="type-body mt-2 text-muted-foreground">Add products, photos and prices. Only "Live" products appear in the shop.</p>
        </div>
        <Button asChild variant="pepper"><Link to="/admin" search={{ tab: "products", p: "new" }}><Plus /> Add product</Link></Button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto">
          {STATUSES.map((s) => (
            <button key={s.key} type="button" onClick={() => { setStatus(s.key); setPage(1); }} className={cn("type-small shrink-0 rounded-full px-4 py-2 font-medium", status === s.key ? "bg-foreground text-background" : "bg-container hover:bg-sage-strong")}>{s.label}</button>
          ))}
        </div>
        <label className="relative flex items-center sm:w-72">
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search products" aria-label="Search products" className="type-small h-11 w-full rounded-full bg-container pl-10 pr-4 outline-none focus:ring-2 focus:ring-ring" />
        </label>
      </div>

      <div className="mt-6 space-y-2">
        {list.isPending ? <div className="h-40 animate-pulse rounded-[1.25rem] bg-container" /> : list.isError ? (
          <p className="type-body rounded-2xl bg-destructive/10 p-4 text-destructive">We couldn't load products. Make sure you're signed in as an admin.</p>
        ) : list.data.items.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border p-10 text-center">
            <p className="type-body text-muted-foreground">No products yet.</p>
            <Button asChild className="mt-4"><Link to="/admin" search={{ tab: "products", p: "new" }}>Add your first product</Link></Button>
          </div>
        ) : (
          list.data.items.map((p) => {
            const thumb = cldUrl(p.cover_url, 160, { h: 160 });
            const low = p.status === "published" && p.stock <= (p.low_stock_threshold ?? 5);
            return (
              <Link key={p.id} to="/admin" search={{ tab: "products", p: p.id }} className="flex items-center gap-4 rounded-[1.25rem] border border-border bg-surface p-3 transition-colors hover:border-pepper/40">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-container">
                  {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="type-product block truncate">{p.title}</span>
                  <span className="type-small block text-muted-foreground">{p.category?.name ?? "No category"} · {formatGHS(p.price)}</span>
                </span>
                <span className={cn("type-small hidden sm:block", low && "font-semibold text-warning")}>{p.stock} in stock</span>
                <span className={cn("type-label rounded-full px-3 py-1.5", TONE[p.status])}>{LABEL[p.status]}</span>
              </Link>
            );
          })
        )}
      </div>

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="type-small text-muted-foreground">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
