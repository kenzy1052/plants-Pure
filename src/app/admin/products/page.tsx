import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories, listProducts } from "@/lib/admin/catalogue";
import { STATUS_LABEL } from "@/lib/admin/schemas";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink, Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { thumbUrl } from "@/lib/admin/thumb";
import { formatGHS } from "@/lib/money";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;

export default async function AdminProducts({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 80);
  const status = ["draft", "published", "archived"].includes(one(sp.status)) ? one(sp.status) : "";
  const categoryId = UUID.test(one(sp.category)) ? one(sp.category) : "";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));

  const db = await createSupabaseServerClient();
  const [list, categories] = await Promise.all([
    listProducts(db, { q: q || undefined, status: status || undefined, categoryId: categoryId || undefined, page, pageSize: PAGE_SIZE }),
    listCategories(db),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (categoryId) p.set("category", categoryId);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };
  if (list.total > 0 && list.items.length === 0 && page > pages) redirect(href(pages)); // past the end: go to the last page
  const filtered = Boolean(q || status || categoryId);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-h2">Products</h1>
        <ButtonLink href="/admin/products/new" variant="primary">New product</ButtonLink>
      </div>

      <form method="get" className="mt-6 grid gap-3 sm:grid-cols-[1fr_11rem_14rem_auto] sm:items-end" role="search" aria-label="Filter products">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-q" className="text-small font-semibold">Search name or SKU</label>
          <Input id="f-q" name="q" defaultValue={q} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-status" className="text-small font-semibold">Status</label>
          <Select id="f-status" name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-cat" className="text-small font-semibold">Category</label>
          <Select id="f-cat" name="category" defaultValue={categoryId}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (inactive)"}</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">Filter</Button>
          {filtered && <ButtonLink href="/admin/products" variant="quiet">Clear</ButtonLink>}
        </div>
      </form>

      <p className="mt-6 text-small text-text-secondary" role="status">
        {list.total} {list.total === 1 ? "product" : "products"}{filtered ? " match" : ""}
      </p>

      {list.items.length === 0 ? (
        <EmptyState
          title={filtered ? "No products match those filters" : "No products yet"}
          action={filtered ? <ButtonLink href="/admin/products" variant="secondary">Clear filters</ButtonLink> : <ButtonLink href="/admin/products/new" variant="primary">Add the first product</ButtonLink>}
        >
          {filtered ? "Try a different search or clear the filters." : "Products are created as drafts and appear in the shop once they are published."}
        </EmptyState>
      ) : (
        <div className="relative mt-2 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-small">
            <caption className="sr-only">Products</caption>
            <thead>
              <tr className="border-b border-border-strong text-text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">Product</th>
                <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                <th scope="col" className="px-3 py-2 font-semibold">Category</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Price</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Stock</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((p) => {
                const thumb = thumbUrl(p.cover_url);
                const low = p.low_stock_threshold != null && p.stock > 0 && p.stock <= p.low_stock_threshold;
                return (
                  <tr key={p.id} className="border-b border-border align-middle">
                    <td className="py-3 pr-3">
                      <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 font-semibold underline-offset-4 hover:underline">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" width={44} height={44} loading="lazy" className="size-11 shrink-0 rounded-control object-cover" />
                        ) : (
                          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-control bg-background-alt text-caption text-text-muted">No photo</span>
                        )}
                        <span>
                          {p.title}
                          <span className="block text-caption font-normal text-text-muted">{p.sku ? `SKU ${p.sku}` : "No SKU"}{p.is_featured ? " · Featured" : ""}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={p.status === "published" ? "success" : p.status === "archived" ? "neutral" : "warning"}>{STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td className="px-3 py-3">{p.category?.name ?? <span className="text-text-muted">None</span>}</td>
                    <td className="numeral px-3 py-3 text-right">{formatGHS(p.price)}</td>
                    <td className="numeral px-3 py-3 text-right">
                      {p.stock === 0 ? <Badge tone="danger">Out of stock</Badge> : (
                        <>
                          {p.stock} {low && <Badge tone="warning" className="ml-1">Low</Badge>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination current={Math.min(page, pages)} pages={pages} hrefFor={href} className="mt-8" />
    </div>
  );
}
