"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PUBLICATION_MESSAGES, STATUS_LABEL, type ProductStatus } from "@/lib/admin/schemas";
import { adminFetch } from "../../admin-api";

type Action = { to: ProductStatus; label: string; confirm?: { title: string; body: string } };

/**
 * Lifecycle: draft → published → archived (and back to draft). The checklist is computed by
 * the database from the saved product; publishing is refused there too, so this list is
 * guidance, not the control.
 */
export function PublicationPanel({ productId, status, version, problems }: { productId: string; status: ProductStatus; version: number; problems: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | "delete" | null>(null);
  const [error, setError] = useState<{ message: string; list: string[] } | null>(null);

  const actions: Action[] =
    status === "draft"
      ? [{ to: "published", label: "Publish to the shop" }, { to: "archived", label: "Archive", confirm: { title: "Archive this product?", body: "It stays in the database (and in any past orders) but cannot be edited or bought until restored." } }]
      : status === "published"
        ? [
            { to: "draft", label: "Unpublish (back to draft)", confirm: { title: "Unpublish this product?", body: "It disappears from the shop immediately. Customers with it in their basket will be told it is unavailable." } },
            { to: "archived", label: "Archive", confirm: { title: "Archive this product?", body: "It disappears from the shop immediately and cannot be edited or bought until restored." } },
          ]
        : [{ to: "draft", label: "Restore as draft" }];

  async function run(a: Action) {
    setBusy(a.to);
    setError(null);
    const r = await adminFetch("POST", `/api/admin/products/${productId}/status`, { status: a.to, expectedVersion: version });
    setBusy(null);
    setPending(null);
    if (r.ok) {
      toast.success(a.to === "published" ? "Published. It is now in the shop." : a.to === "archived" ? "Archived." : a.to === "draft" ? "Saved as a draft." : "Done.");
      router.refresh();
    } else {
      setError({ message: r.message, list: r.messages });
    }
  }
  async function remove() {
    setBusy("delete");
    setError(null);
    const r = await adminFetch("DELETE", `/api/admin/products/${productId}`);
    setBusy(null);
    setPending(null);
    if (r.ok) {
      toast.success("Draft deleted.");
      router.push("/admin/products");
    } else setError({ message: r.message, list: [] });
  }

  const ready = problems.length === 0;
  return (
    <div className="grid gap-5">
      <p className="flex items-center gap-2 text-small">
        Status: <Badge tone={status === "published" ? "success" : status === "archived" ? "neutral" : "warning"}>{STATUS_LABEL[status]}</Badge>
        {status === "published" && <span className="text-text-secondary">Visible in the shop.</span>}
        {status === "draft" && <span className="text-text-secondary">Hidden from the shop.</span>}
      </p>

      {status !== "archived" && (
        <div>
          <p className="text-small font-semibold">{ready ? "Everything needed to publish is in place." : "Before this can be published:"}</p>
          {!ready && (
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-small">
              {problems.map((p) => <li key={p}>{PUBLICATION_MESSAGES[p] ?? p}</li>)}
            </ul>
          )}
          <p className="mt-2 text-caption text-text-muted">Based on the saved product. Save your changes first.</p>
        </div>
      )}

      {error && (
        <div role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-small text-danger">
          <p className="font-semibold">{error.message}</p>
          {error.list.length > 0 && <ul className="mt-1 list-disc pl-5">{error.list.map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {actions.map((a) => (
          <Button
            key={a.to}
            variant={a.to === "published" ? "accent" : "secondary"}
            disabled={(a.to === "published" && !ready) || !!busy}
            loading={busy === a.to}
            onClick={() => (a.confirm ? setPending(a) : run(a))}
          >
            {a.label}
          </Button>
        ))}
        {status === "draft" && <Button variant="secondary" disabled={!!busy} onClick={() => setPending("delete")}>Delete draft</Button>}
      </div>

      <ConfirmDialog
        open={pending !== null && pending !== "delete"}
        title={pending && pending !== "delete" ? pending.confirm?.title ?? "" : ""}
        confirmLabel={pending && pending !== "delete" ? pending.label : ""}
        busy={!!busy}
        onConfirm={() => pending && pending !== "delete" && run(pending)}
        onCancel={() => setPending(null)}
      >
        <p>{pending && pending !== "delete" ? pending.confirm?.body : ""}</p>
      </ConfirmDialog>
      <ConfirmDialog open={pending === "delete"} title="Delete this draft?" confirmLabel="Delete draft" danger busy={busy === "delete"} onConfirm={remove} onCancel={() => setPending(null)}>
        <p>This permanently deletes the draft and its photos. It cannot be undone. A product that appears in any order cannot be deleted (archive it instead).</p>
      </ConfirmDialog>
    </div>
  );
}
