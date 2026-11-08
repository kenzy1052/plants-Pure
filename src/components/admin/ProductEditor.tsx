import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Loader2, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authInput } from "@/components/site/AuthShell";
import { cldUrl } from "@/lib/catalogue";
import { cn } from "@/lib/utils";
import { friendlyError, problemText, rpc, slugify, uploadToCloudinary, type AdminCategory, type AdminImage, type AdminProduct } from "@/lib/admin";

type Detail = { product: AdminProduct; images: AdminImage[]; problems: string[]; movements: { id: number; delta: number; stock_after: number; reason: string; note: string | null; created_at: string }[] };

const Field = ({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <label className={cn("block", className)}>
    <span className="type-label text-muted-foreground">{label}</span>
    <div className="mt-2">{children}</div>
    {hint && <span className="type-small mt-1 block text-muted-foreground">{hint}</span>}
  </label>
);

export function ProductEditor({ id }: { id: string }) {
  const isNew = id === "new";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const detail = useQuery({ queryKey: ["admin-product", id], enabled: !isNew, queryFn: () => rpc<Detail>("admin_get_product", { p_id: id }) });
  const cats = useQuery({ queryKey: ["admin-categories"], queryFn: () => rpc<AdminCategory[]>("admin_list_categories") });

  const [f, setF] = useState({ title: "", slug: "", tagline: "", description: "", category_id: "", price: "", compare_at_price: "", weight_grams: "", sku: "", flavor_notes: "", culinary_uses: "", ingredients: "", is_featured: false, low_stock_threshold: "", stock: "0" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const p = detail.data?.product;
    if (!p || loadedFor.current === `${p.id}:${p.version}`) return;
    loadedFor.current = `${p.id}:${p.version}`;
    setSlugTouched(true);
    setF({
      title: p.title, slug: p.slug, tagline: p.tagline ?? "", description: p.description ?? "", category_id: p.category_id ?? "",
      price: String(p.price ?? ""), compare_at_price: p.compare_at_price != null ? String(p.compare_at_price) : "", weight_grams: p.weight_grams != null ? String(p.weight_grams) : "",
      sku: p.sku ?? "", flavor_notes: (p.flavor_notes ?? []).join(", "), culinary_uses: p.culinary_uses ?? "", ingredients: p.ingredients ?? "",
      is_featured: !!p.is_featured, low_stock_threshold: p.low_stock_threshold != null ? String(p.low_stock_threshold) : "", stock: String(p.stock),
    });
  }, [detail.data]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setF((s) => ({ ...s, [k]: v, ...(k === "title" && !slugTouched ? { slug: slugify(v) } : {}) }));
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin-product", id] });
    void qc.invalidateQueries({ queryKey: ["admin-products"] });
    void qc.invalidateQueries({ queryKey: ["admin-products-overview"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = !f.title.trim() ? "Please enter a product name." : !f.slug.trim() ? "Please enter a web address (slug)." : num(f.price) == null || Number.isNaN(num(f.price)) ? "Please enter a price." : null;
    if (invalid) {
      toast.error(invalid);
      return;
    }
    const data: Record<string, unknown> = {
      title: f.title, slug: f.slug, tagline: f.tagline, description: f.description, category_id: f.category_id || null,
      price: num(f.price), compare_at_price: num(f.compare_at_price), weight_grams: num(f.weight_grams), sku: f.sku,
      flavor_notes: f.flavor_notes.split(",").map((s) => s.trim()).filter(Boolean), culinary_uses: f.culinary_uses, ingredients: f.ingredients,
      is_featured: f.is_featured, low_stock_threshold: num(f.low_stock_threshold),
    };
    if (isNew) data.stock = num(f.stock) ?? 0;
    setSaving(true);
    try {
      const saved = await rpc<AdminProduct>("admin_save_product", { p_id: isNew ? null : id, p_expected_version: isNew ? null : detail.data?.product.version ?? null, p_data: data });
      toast.success(isNew ? "Product created — now add photos" : "Saved");
      await refresh();
      if (isNew) navigate({ to: "/admin", search: { tab: "products", p: saved.id }, replace: true });
    } catch (err) {
      toast.error(friendlyError(err));
    }
    setSaving(false);
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const d = detail.data;
  const status = d?.product.status;

  if (!isNew && detail.isPending) return <div className="h-64 animate-pulse rounded-[1.5rem] bg-container" />;
  if (!isNew && detail.isError) return <p className="type-body rounded-2xl bg-destructive/10 p-4 text-destructive">We couldn't load this product.</p>;

  return (
    <div>
      <Link to="/admin" search={{ tab: "products" }} className="type-small inline-flex items-center gap-1.5 font-semibold hover:text-brand"><ArrowLeft className="h-4 w-4" /> All products</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="type-page">{isNew ? "Add product" : f.title || "Product"}</h1>
        {!isNew && d && (
          <div className="flex flex-wrap gap-2">
            {status !== "published" && <Button variant="pepper" onClick={() => run(() => rpc("admin_set_product_status", { p_id: id, p_status: "published", p_expected_version: d.product.version }), "Product is now live in the shop")}>Publish</Button>}
            {status === "published" && <Button variant="outline" onClick={() => run(() => rpc("admin_set_product_status", { p_id: id, p_status: "draft", p_expected_version: d.product.version }), "Product hidden from the shop")}>Unpublish</Button>}
            {status !== "archived" ? <Button variant="ghost" onClick={() => run(() => rpc("admin_set_product_status", { p_id: id, p_status: "archived", p_expected_version: d.product.version }), "Product archived")}>Archive</Button> : <Button variant="outline" onClick={() => run(() => rpc("admin_set_product_status", { p_id: id, p_status: "draft", p_expected_version: d.product.version }), "Restored as a draft")}>Restore</Button>}
          </div>
        )}
      </div>

      {!isNew && d && status !== "published" && d.problems.length > 0 && (
        <div className="mt-5 rounded-2xl bg-warning-soft p-4 text-warning">
          <p className="type-small flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Before this can go live, please:</p>
          <ul className="type-small mt-1 list-disc pl-9">{d.problems.map((p) => <li key={p}>{problemText(p)}</li>)}</ul>
        </div>
      )}

      <form onSubmit={save} className="mt-8 grid gap-4 sm:grid-cols-2">
        <Field label="Product name" className="sm:col-span-2"><input className={authInput} value={f.title} onChange={set("title")} maxLength={160} /></Field>
        <Field label="Web address (slug)" hint={`plantsandpure.com/product/${f.slug || "…"}`}>
          <input className={authInput} value={f.slug} onChange={(e) => { setSlugTouched(true); setF((s) => ({ ...s, slug: slugify(e.target.value) })); }} />
        </Field>
        <Field label="Category">
          <select className={authInput} value={f.category_id} onChange={set("category_id")}>
            <option value="">Choose…</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Short line (shown under the name)" className="sm:col-span-2"><input className={authInput} value={f.tagline} onChange={set("tagline")} maxLength={200} /></Field>
        <Field label="Description" className="sm:col-span-2"><textarea className={`${authInput} h-32 py-3`} value={f.description} onChange={set("description")} /></Field>
        <Field label="Price (GH₵)"><input className={authInput} inputMode="decimal" value={f.price} onChange={set("price")} /></Field>
        <Field label="Old price (GH₵, optional)" hint="Shows as a crossed-out price. Must be higher than the price."><input className={authInput} inputMode="decimal" value={f.compare_at_price} onChange={set("compare_at_price")} /></Field>
        <Field label="Weight (grams)"><input className={authInput} inputMode="numeric" value={f.weight_grams} onChange={set("weight_grams")} /></Field>
        <Field label="SKU (optional)"><input className={authInput} value={f.sku} onChange={set("sku")} /></Field>
        {isNew && <Field label="Starting stock"><input className={authInput} inputMode="numeric" value={f.stock} onChange={set("stock")} /></Field>}
        <Field label="Low-stock warning at (units)"><input className={authInput} inputMode="numeric" value={f.low_stock_threshold} onChange={set("low_stock_threshold")} placeholder="5" /></Field>
        <Field label="Flavour notes (separate with commas)" className="sm:col-span-2"><input className={authInput} value={f.flavor_notes} onChange={set("flavor_notes")} placeholder="warm, earthy, sweet" /></Field>
        <Field label="How to use" className="sm:col-span-2"><textarea className={`${authInput} h-24 py-3`} value={f.culinary_uses} onChange={set("culinary_uses")} /></Field>
        <Field label="Ingredients" className="sm:col-span-2"><textarea className={`${authInput} h-20 py-3`} value={f.ingredients} onChange={set("ingredients")} /></Field>
        <label className="type-small flex items-center gap-3 sm:col-span-2"><input type="checkbox" checked={f.is_featured} onChange={(e) => setF((s) => ({ ...s, is_featured: e.target.checked }))} className="h-4 w-4 accent-[var(--color-pepper)]" /> Mark as a bestseller</label>
        <div className="sm:col-span-2"><Button type="submit" variant="pepper" size="lg" disabled={saving}>{saving && <Loader2 className="animate-spin" />} {isNew ? "Create product" : "Save changes"}</Button></div>
      </form>

      {!isNew && d && (
        <>
          <PhotosSection productId={id} images={d.images} onChange={refresh} run={run} />
          <StockSection productId={id} stock={d.product.stock} movements={d.movements} run={run} />
        </>
      )}
      {isNew && <p className="type-small mt-8 text-muted-foreground">After you create the product you can upload its photos and adjust stock.</p>}
    </div>
  );
}

function PhotosSection({ productId, images, onChange, run }: { productId: string; images: AdminImage[]; onChange: () => Promise<void>; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        const u = await uploadToCloudinary(file);
        await rpc("admin_add_product_image", { p_product_id: productId, p_public_id: u.public_id, p_url: u.secure_url, p_alt: null, p_width: u.width, p_height: u.height, p_bytes: u.bytes, p_format: u.format });
        toast.success(`${file.name} uploaded`);
      } catch (err) {
        toast.error(err instanceof Error && !("code" in err) ? err.message : friendlyError(err));
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    await onChange();
  };
  return (
    <section className="mt-12 border-t border-border pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="type-sub">Photos</h2><p className="type-small text-muted-foreground">The cover photo is the one shown in the shop. Customers can swipe through the rest.</p></div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload photos</Button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void upload(e.target.files)} />
      </div>
      {images.length === 0 ? (
        <p className="type-small mt-5 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">No photos yet. Upload at least one to publish this product.</p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="overflow-hidden rounded-[1.25rem] border border-border bg-surface">
              <div className="relative aspect-square bg-container">
                <img src={cldUrl(img.url, 400, { h: 400 }) ?? img.url} alt={img.alt_text ?? ""} className="h-full w-full object-cover" />
                {img.is_cover && <span className="type-label absolute left-2 top-2 rounded-full bg-brand-gradient px-2.5 py-1 text-pepper-foreground">Cover</span>}
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <button type="button" disabled={img.is_cover} onClick={() => run(() => rpc("admin_set_cover_image", { p_product_id: productId, p_image_id: img.id }), "Cover photo changed")} className="type-small inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 hover:bg-container disabled:opacity-40"><Star className="h-3.5 w-3.5" /> Cover</button>
                <div className="flex">
                  {i > 0 && <button type="button" aria-label="Move earlier" onClick={() => run(() => rpc("admin_reorder_product_images", { p_product_id: productId, p_image_ids: swap(images.map((x) => x.id), i, i - 1) }), "Order changed")} className="rounded-full px-2 py-1.5 hover:bg-container">←</button>}
                  {i < images.length - 1 && <button type="button" aria-label="Move later" onClick={() => run(() => rpc("admin_reorder_product_images", { p_product_id: productId, p_image_ids: swap(images.map((x) => x.id), i, i + 1) }), "Order changed")} className="rounded-full px-2 py-1.5 hover:bg-container">→</button>}
                  <button type="button" aria-label="Delete photo" onClick={() => { if (confirm("Delete this photo?")) void run(() => rpc("admin_remove_product_image", { p_image_id: img.id }), "Photo deleted"); }} className="rounded-full p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
const swap = <T,>(a: T[], i: number, j: number) => {
  const c = [...a];
  [c[i], c[j]] = [c[j]!, c[i]!];
  return c;
};

function StockSection({ productId, stock, movements, run }: { productId: string; stock: number; movements: Detail["movements"]; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [qty, setQty] = useState(String(stock));
  useEffect(() => setQty(String(stock)), [stock]);
  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="type-sub">Stock</h2>
      <p className="type-small text-muted-foreground">Currently {stock} in stock. Paid orders reduce this automatically.</p>
      <div className="mt-4 flex max-w-sm gap-2">
        <input className={authInput} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Units in stock" />
        <Button type="button" variant="outline" onClick={() => run(() => rpc("admin_set_stock", { p_product_id: productId, p_quantity: Number(qty), p_note: null }), "Stock updated")}>Update</Button>
      </div>
      {movements.length > 0 && (
        <ul className="type-small mt-5 divide-y divide-border rounded-2xl border border-border">
          {movements.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
              <span>{m.delta > 0 ? "+" : ""}{m.delta} · {m.reason}{m.note ? ` (${m.note})` : ""}</span>
              <span className="text-muted-foreground">{new Date(m.created_at).toLocaleDateString("en-GH", { day: "numeric", month: "short" })} → {m.stock_after}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
