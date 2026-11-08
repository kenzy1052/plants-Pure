"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { createProductSchema, slugify, updateProductSchema } from "@/lib/admin/schemas";
import type { AdminProduct } from "@/lib/admin/catalogue";
import { adminFetch } from "../admin-api";

type Cat = { id: string; name: string; is_active: boolean };
type Values = {
  title: string; slug: string; tagline: string; description: string; flavor_notes: string; culinary_uses: string; ingredients: string;
  price: string; compare_at_price: string; weight_grams: string; category_id: string; is_featured: boolean; sku: string;
  low_stock_threshold: string; stock: string;
};

const n = (v: number | null | undefined) => (v == null ? "" : String(v));
function initial(p?: AdminProduct): Values {
  return {
    title: p?.title ?? "", slug: p?.slug ?? "", tagline: p?.tagline ?? "", description: p?.description ?? "",
    flavor_notes: (p?.flavor_notes ?? []).join(", "), culinary_uses: p?.culinary_uses ?? "", ingredients: p?.ingredients ?? "",
    price: p ? p.price.toFixed(2) : "", compare_at_price: n(p?.compare_at_price), weight_grams: n(p?.weight_grams),
    category_id: p?.category_id ?? "", is_featured: p?.is_featured ?? false, sku: p?.sku ?? "", low_stock_threshold: n(p?.low_stock_threshold), stock: "",
  };
}

type Errs = Record<string, string>;
const num = (s: string, label: string, errs: Errs, key: string, int = false): number | null | undefined => {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return undefined;
  const v = Number(t);
  if (!Number.isFinite(v) || (int && !Number.isInteger(v))) {
    errs[key] = int ? `${label} must be a whole number.` : `${label} must be a number.`;
    return null;
  }
  return v;
};

/**
 * Create or edit a product's CONTENT. Stock, images and publication have their own panels.
 * The same zod schemas run here (for fast feedback) and on the server (which is the one that
 * counts). A save sends the version it was based on; if someone else saved first, the server
 * refuses and this form says so instead of overwriting their work.
 */
export function ProductForm({ mode, categories, product }: { mode: "create" | "edit"; categories: Cat[]; product?: AdminProduct }) {
  const router = useRouter();
  const [v, setV] = useState<Values>(() => initial(product));
  const [errors, setErrors] = useState<Errs>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);

  const archived = product?.status === "archived";
  const slugLocked = mode === "edit" && product?.status === "published";
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((s) => ({ ...s, [k]: val }));
  const text = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never);
  const err = (k: string) => errors[k] ?? null;

  function build(): { payload: Record<string, unknown>; errs: Errs } {
    const errs: Errs = {};
    const payload: Record<string, unknown> = { title: v.title, description: v.description, tagline: v.tagline, culinary_uses: v.culinary_uses, ingredients: v.ingredients };
    if (!slugLocked && (mode === "edit" || v.slug.trim() !== "")) payload.slug = v.slug;
    payload.flavor_notes = v.flavor_notes.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const price = num(v.price, "Price", errs, "price");
    if (price === undefined) {
      if (mode === "edit") errs.price = "Enter a price (0 while it is still a draft).";
    } else if (price !== null) payload.price = price;
    const cmp = num(v.compare_at_price, "Original price", errs, "compare_at_price");
    if (cmp !== null) payload.compare_at_price = cmp === undefined ? null : cmp;
    const w = num(v.weight_grams, "Weight", errs, "weight_grams", true);
    if (w !== null) payload.weight_grams = w === undefined ? null : w;
    const low = num(v.low_stock_threshold, "Low-stock level", errs, "low_stock_threshold", true);
    if (low !== null) payload.low_stock_threshold = low === undefined ? null : low;
    payload.category_id = v.category_id || null;
    payload.is_featured = v.is_featured;
    payload.sku = v.sku;
    if (mode === "create") {
      const s = num(v.stock, "Opening stock", errs, "stock", true);
      if (s !== null && s !== undefined) payload.stock = s;
    }
    return { payload, errs };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || archived) return;
    setFormError(null);
    setStale(false);
    const { payload, errs } = build();
    const schema = mode === "create" ? createProductSchema : updateProductSchema;
    const body = mode === "edit" ? { ...payload, expectedVersion: product!.version } : payload;
    const parsed = schema.safeParse(body);
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0] ?? "_")] ??= i.message;
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError("Please fix the highlighted fields.");
      const first = Object.keys(errs).find((k) => document.getElementById(`pf-${k}`));
      if (first) document.getElementById(`pf-${first}`)?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await adminFetch<AdminProduct>(mode === "create" ? "POST" : "PATCH", mode === "create" ? "/api/admin/products" : `/api/admin/products/${product!.id}`, parsed.data);
    setBusy(false);
    if (res.ok) {
      toast.success(mode === "create" ? "Draft created. Add photos and stock next." : "Saved.");
      if (mode === "create") router.push(`/admin/products/${res.data.id}`);
      else router.refresh();
      return;
    }
    if (res.code === "stale_product") setStale(true);
    const fe: Errs = {};
    for (const [k, msgs] of Object.entries(res.fields)) fe[k] = msgs[0]!;
    if (res.code === "slug_taken") fe.slug = "Another product already uses this web address.";
    if (res.code === "sku_taken") fe.sku = "Another product already uses this SKU.";
    setErrors(fe);
    setFormError(res.message);
  }

  const titleSlug = slugify(v.title);
  return (
    <form onSubmit={submit} noValidate className="grid gap-6" aria-describedby={formError ? "pf-form-error" : undefined}>
      {archived && (
        <p role="status" className="border-l-4 border-border-strong bg-background-alt p-4 text-small">
          This product is archived and read-only. Restore it to a draft (Publication panel) to edit it.
        </p>
      )}
      {formError && (
        <div id="pf-form-error" role="alert" className="border-l-4 border-danger bg-danger-soft p-4 text-small text-danger">
          <p className="font-semibold">{formError}</p>
          {stale && (
            <Button className="mt-3" variant="secondary" size="sm" onClick={() => router.refresh()}>
              Reload the latest version
            </Button>
          )}
        </div>
      )}
      <fieldset disabled={archived || busy} className="grid gap-6 border-0 p-0">
        <legend className="sr-only">Product details</legend>
        <Field id="pf-title" label="Product name" required error={err("title")}>
          {(a) => <Input {...a} name="title" value={v.title} onChange={text("title")} maxLength={120} autoComplete="off" />}
        </Field>
        <Field
          id="pf-slug"
          label="Web address"
          error={err("slug")}
          hint={slugLocked ? "Locked while published so existing links keep working. Unpublish the product to change it." : mode === "create" ? `Leave empty to use “${titleSlug || "…"}”.` : "Lowercase letters, numbers and hyphens."}
        >
          {(a) => <Input {...a} name="slug" value={v.slug} onChange={text("slug")} maxLength={80} disabled={slugLocked} autoComplete="off" spellCheck={false} />}
        </Field>
        <Field id="pf-tagline" label="Short tagline" error={err("tagline")} hint="One line shown under the name. Optional.">
          {(a) => <Input {...a} name="tagline" value={v.tagline} onChange={text("tagline")} maxLength={160} />}
        </Field>
        <Field id="pf-description" label="Description" error={err("description")} hint="Required to publish (at least 10 characters). Use only verified information.">
          {(a) => <Textarea {...a} name="description" value={v.description} onChange={text("description")} rows={6} maxLength={4000} />}
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="pf-price" label="Price (GH₵)" required={mode === "edit"} error={err("price")} hint="Two decimal places at most.">
            {(a) => <Input {...a} name="price" inputMode="decimal" value={v.price} onChange={text("price")} />}
          </Field>
          <Field id="pf-compare_at_price" label="Original price (GH₵)" error={err("compare_at_price")} hint="Only if the product is genuinely discounted. Leave empty otherwise.">
            {(a) => <Input {...a} name="compare_at_price" inputMode="decimal" value={v.compare_at_price} onChange={text("compare_at_price")} />}
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="pf-category_id" label="Category" error={err("category_id")} hint="Required to publish.">
            {(a) => (
              <Select {...a} name="category_id" value={v.category_id} onChange={text("category_id")}>
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} disabled={!c.is_active && c.id !== product?.category_id}>
                    {c.name}{c.is_active ? "" : " (inactive)"}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="pf-weight_grams" label="Pack weight (grams)" error={err("weight_grams")}>
            {(a) => <Input {...a} name="weight_grams" inputMode="numeric" value={v.weight_grams} onChange={text("weight_grams")} />}
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="pf-sku" label="SKU" error={err("sku")} hint="Your own stock code. Optional, must be unique.">
            {(a) => <Input {...a} name="sku" value={v.sku} onChange={text("sku")} maxLength={40} autoComplete="off" />}
          </Field>
          <Field id="pf-low_stock_threshold" label="Low-stock level" error={err("low_stock_threshold")} hint="Flag the product as low at or below this number.">
            {(a) => <Input {...a} name="low_stock_threshold" inputMode="numeric" value={v.low_stock_threshold} onChange={text("low_stock_threshold")} />}
          </Field>
        </div>
        {mode === "create" && (
          <Field id="pf-stock" label="Opening stock" error={err("stock")} hint="Units on the shelf now. Later changes are recorded in the stock history.">
            {(a) => <Input {...a} name="stock" inputMode="numeric" value={v.stock} onChange={text("stock")} />}
          </Field>
        )}
        <Field id="pf-flavor_notes" label="Flavour notes" error={err("flavor_notes")} hint="Separate with commas. Optional.">
          {(a) => <Input {...a} name="flavor_notes" value={v.flavor_notes} onChange={text("flavor_notes")} />}
        </Field>
        <Field id="pf-ingredients" label="Ingredients" error={err("ingredients")} hint="Only if verified for this product. Leave empty otherwise.">
          {(a) => <Textarea {...a} name="ingredients" value={v.ingredients} onChange={text("ingredients")} rows={3} maxLength={1000} />}
        </Field>
        <Field id="pf-culinary_uses" label="Uses" error={err("culinary_uses")} hint="How it is used, if verified. Leave empty otherwise.">
          {(a) => <Textarea {...a} name="culinary_uses" value={v.culinary_uses} onChange={text("culinary_uses")} rows={3} maxLength={1000} />}
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-small font-semibold">
          <input type="checkbox" checked={v.is_featured} onChange={(e) => set("is_featured", e.target.checked)} className="size-5 accent-[var(--p-ink)]" />
          Feature this product on the homepage
        </label>
      </fieldset>
      {!archived && (
        <div className="flex flex-wrap gap-3 border-t border-border pt-6">
          <Button type="submit" variant="primary" loading={busy}>{mode === "create" ? "Create draft" : "Save changes"}</Button>
          {mode === "create" && <Button variant="secondary" onClick={() => router.push("/admin/products")} disabled={busy}>Cancel</Button>}
        </div>
      )}
    </form>
  );
}
