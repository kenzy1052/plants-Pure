"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { categorySchema, slugify } from "@/lib/admin/schemas";
import type { AdminCategory } from "@/lib/admin/catalogue";
import { adminFetch } from "../admin-api";

type Draft = { id: string | null; name: string; slug: string; description: string; display_order: string };
const blank: Draft = { id: null, name: "", slug: "", description: "", display_order: "0" };

export function CategoryManager({ categories }: { categories: AdminCategory[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const edit = (c: AdminCategory | null) => {
    setErrors({});
    setFormError(null);
    setDraft(c ? { id: c.id, name: c.name, slug: c.slug, description: c.description ?? "", display_order: String(c.display_order) } : blank);
    setTimeout(() => document.getElementById("cat-name")?.focus(), 0);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    const body: Record<string, unknown> = { name: draft.name, description: draft.description, display_order: Number(draft.display_order || 0) };
    if (draft.slug.trim()) body.slug = draft.slug.trim();
    const parsed = categorySchema.safeParse(body);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      setFormError("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy("save");
    const res = draft.id
      ? await adminFetch("PATCH", `/api/admin/categories/${draft.id}`, parsed.data)
      : await adminFetch("POST", "/api/admin/categories", parsed.data);
    setBusy(null);
    if (res.ok) {
      toast.success(draft.id ? "Category saved." : "Category created.");
      setDraft(null);
      router.refresh();
      return;
    }
    const fe: Record<string, string> = {};
    for (const [k, m] of Object.entries(res.fields)) fe[k] = m[0]!;
    if (res.code === "name_taken") fe.name = "Another category already has this name.";
    if (res.code === "slug_taken") fe.slug = "Another category already uses this web address.";
    setErrors(fe);
    setFormError(res.message);
  }

  async function toggle(c: AdminCategory) {
    if (busy) return;
    setBusy(`t-${c.id}`);
    setListError(null);
    const r = await adminFetch("PATCH", `/api/admin/categories/${c.id}`, { is_active: !c.is_active });
    setBusy(null);
    if (r.ok) {
      toast.success(c.is_active ? "Category hidden from the shop." : "Category is now visible in the shop.");
      router.refresh();
    } else setListError(`${c.name}: ${r.message}`);
  }

  async function remove() {
    const c = deleting;
    if (!c) return;
    setBusy("delete");
    const r = await adminFetch("DELETE", `/api/admin/categories/${c.id}`);
    setBusy(null);
    setDeleting(null);
    if (r.ok) {
      toast.success("Category deleted.");
      router.refresh();
    } else setListError(`${c.name}: ${r.message}`);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <div><Button variant="primary" onClick={() => edit(null)} disabled={!!busy}>New category</Button></div>

      {draft && (
        <form onSubmit={save} noValidate className="grid gap-5 border border-border-strong p-5" aria-label={draft.id ? "Edit category" : "New category"}>
          {formError && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-small text-danger">{formError}</p>}
          <Field id="cat-name" label="Name" required error={errors.name ?? null}>
            {(a) => <Input {...a} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={!!busy} autoComplete="off" />}
          </Field>
          <Field id="cat-slug" label="Web address" error={errors.slug ?? null} hint={draft.id ? "Changing it breaks existing links to this category." : `Leave empty to use “${slugify(draft.name) || "…"}”.`}>
            {(a) => <Input {...a} value={draft.slug} maxLength={60} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} disabled={!!busy} autoComplete="off" spellCheck={false} />}
          </Field>
          <Field id="cat-description" label="Description" error={errors.description ?? null} hint="Optional. Only verified information.">
            {(a) => <Textarea {...a} value={draft.description} rows={3} maxLength={500} onChange={(e) => setDraft({ ...draft, description: e.target.value })} disabled={!!busy} />}
          </Field>
          <Field id="cat-order" label="Display order" error={errors.display_order ?? null} hint="Lower numbers come first.">
            {(a) => <Input {...a} inputMode="numeric" value={draft.display_order} onChange={(e) => setDraft({ ...draft, display_order: e.target.value })} disabled={!!busy} className="max-w-32" />}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" loading={busy === "save"}>{draft.id ? "Save category" : "Create category"}</Button>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={!!busy}>Cancel</Button>
          </div>
        </form>
      )}

      {listError && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-small text-danger">{listError}</p>}

      {categories.length === 0 ? (
        <p className="border-y border-border py-10 text-center text-text-secondary">No categories yet. Create the first one above; the list of categories is a business decision, so nothing is pre-filled.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-small">
            <caption className="sr-only">Categories</caption>
            <thead><tr className="border-b border-border-strong text-text-muted">
              <th scope="col" className="py-2 pr-3 font-semibold">Category</th>
              <th scope="col" className="px-3 py-2 font-semibold">Visibility</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Products</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-border align-middle">
                  <td className="py-3 pr-3"><span className="font-semibold">{c.name}</span><span className="block text-caption text-text-muted">/{c.slug} · order {c.display_order}</span></td>
                  <td className="px-3 py-3"><Badge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? "Active" : "Inactive"}</Badge></td>
                  <td className="numeral px-3 py-3 text-right">{c.product_count} <span className="text-text-muted">({c.published_count} live)</span></td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => edit(c)} disabled={!!busy} aria-label={`Edit ${c.name}`}>Edit</Button>
                      <Button size="sm" variant="secondary" onClick={() => toggle(c)} loading={busy === `t-${c.id}`} disabled={!!busy} aria-label={`${c.is_active ? "Deactivate" : "Activate"} ${c.name}`}>{c.is_active ? "Deactivate" : "Activate"}</Button>
                      <Button size="sm" variant="secondary" onClick={() => setDeleting(c)} disabled={!!busy || c.product_count > 0} aria-label={`Delete ${c.name}`} title={c.product_count > 0 ? "Move or archive its products first" : undefined}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog open={!!deleting} title={`Delete “${deleting?.name ?? ""}”?`} confirmLabel="Delete category" danger busy={busy === "delete"} onConfirm={remove} onCancel={() => setDeleting(null)}>
        <p>This permanently removes the category. It has no products. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
