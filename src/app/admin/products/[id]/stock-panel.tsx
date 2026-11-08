"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { stockSchema, STOCK_REASONS } from "@/lib/admin/schemas";
import type { StockMovement } from "@/lib/admin/catalogue";
import { adminFetch } from "../../admin-api";

const REASON_LABEL: Record<string, string> = {
  initial: "Opening stock", restock: "Restock", sale: "Sale (verified payment)", adjustment: "Adjustment", return: "Customer return", correction: "Correction", order_cancelled: "Order cancelled",
};
const date = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

/**
 * Stock is changed ONLY here or by a verified payment, always through a database function that
 * locks the row and writes the ledger. "Add or remove" is relative (safe when two people work at
 * once); "Set to" is a stocktake.
 */
export function StockPanel({ productId, stock, lowAt, movements }: { productId: string; stock: number; lowAt: number | null; movements: StockMovement[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"adjust" | "set">("adjust");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<(typeof STOCK_REASONS)[number]>("restock");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const low = lowAt != null && stock > 0 && stock <= lowAt;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const v = Number(amount.trim());
    const body = mode === "adjust" ? { mode, delta: v, reason, note } : { mode, quantity: v, note };
    const parsed = amount.trim() === "" || !Number.isFinite(v) ? null : stockSchema.safeParse(body);
    if (!parsed || !parsed.success) return setError(parsed && !parsed.success ? parsed.error.issues[0]!.message : "Enter a whole number.");
    setBusy(true);
    const r = await adminFetch<{ stock: number }>("POST", `/api/admin/products/${productId}/stock`, parsed.data);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    toast.success(`Stock is now ${r.data.stock}.`);
    setAmount("");
    setNote("");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <p className="flex flex-wrap items-center gap-3">
        <span className="numeral font-display text-h3" aria-label={`${stock} in stock`}>{stock}</span>
        <span className="text-text-secondary">in stock</span>
        {stock === 0 && <Badge tone="danger">Out of stock</Badge>}
        {low && <Badge tone="warning">Low stock</Badge>}
      </p>

      <form onSubmit={submit} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-4" aria-label="Change stock">
        <fieldset className="grid gap-2 border-0 p-0">
          <legend className="text-small font-semibold">What do you want to do?</legend>
          <label className="flex min-h-11 items-center gap-3 text-small"><input type="radio" name="mode" checked={mode === "adjust"} onChange={() => setMode("adjust")} className="size-5 accent-[var(--p-ink)]" /> Add or remove units (use a minus for removal)</label>
          <label className="flex min-h-11 items-center gap-3 text-small"><input type="radio" name="mode" checked={mode === "set"} onChange={() => setMode("set")} className="size-5 accent-[var(--p-ink)]" /> Set the total after counting the shelf</label>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="stock-amount" label={mode === "adjust" ? "Change (units)" : "New total (units)"} hint={mode === "adjust" ? "For example 24, or -3 for damaged goods." : "Whole number, 0 or more."}>
            {(a) => <Input {...a} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />}
          </Field>
          {mode === "adjust" && (
            <Field id="stock-reason" label="Reason">
              {(a) => (
                <Select {...a} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} disabled={busy}>
                  {STOCK_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                </Select>
              )}
            </Field>
          )}
        </div>
        <Field id="stock-note" label="Note" hint="Optional. Shown in the history, for example “delivery from supplier”.">
          {(a) => <Input {...a} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} disabled={busy} />}
        </Field>
        {error && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-small text-danger">{error}</p>}
        <div><Button type="submit" variant="primary" loading={busy}>{mode === "adjust" ? "Apply change" : "Set stock"}</Button></div>
      </form>

      <div>
        <h3 className="text-small font-semibold">Recent stock history</h3>
        {movements.length === 0 ? (
          <p className="mt-2 text-small text-text-secondary">No movements recorded yet.</p>
        ) : (
          <div className="relative mt-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-left text-small">
              <caption className="sr-only">Recent stock movements, newest first</caption>
              <thead><tr className="border-b border-border-strong text-text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">When</th>
                <th scope="col" className="px-3 py-2 font-semibold">Reason</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Change</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Stock after</th>
                <th scope="col" className="px-3 py-2 font-semibold">Note</th>
              </tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-border">
                    <td className="py-2 pr-3 whitespace-nowrap">{date.format(new Date(m.created_at))}</td>
                    <td className="px-3 py-2">{REASON_LABEL[m.reason] ?? m.reason}</td>
                    <td className="numeral px-3 py-2 text-right">{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                    <td className="numeral px-3 py-2 text-right">{m.stock_after}</td>
                    <td className="px-3 py-2 text-text-secondary">{m.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
