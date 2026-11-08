"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

type Fields = { first_name: string; last_name: string; phone: string; delivery_address: string; delivery_area: string };

/**
 * Updates ONLY the five contact fields the database lets a customer change
 * (column-level grants + RLS "update own row"). `role` is not sent and could not
 * be changed even if it were.
 */
export function ProfileForm({ userId, initial }: { userId: string; initial: Fields }) {
  const [values, setValues] = useState(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]));
    const { error } = await getSupabaseBrowser().from("profiles").update(clean).eq("id", userId);
    setBusy(false);
    setMsg(error ? { kind: "error", text: error.code === "23514" ? "Please check the phone number format." : "We couldn't save your details. Please try again." } : { kind: "ok", text: "Saved." });
  }

  return (
    <form onSubmit={save} className="space-y-5" aria-label="Contact details">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name">{(a) => <Input {...a} autoComplete="given-name" value={values.first_name} onChange={set("first_name")} maxLength={60} />}</Field>
        <Field label="Last name">{(a) => <Input {...a} autoComplete="family-name" value={values.last_name} onChange={set("last_name")} maxLength={60} />}</Field>
      </div>
      <Field label="Phone">{(a) => <Input {...a} type="tel" autoComplete="tel" value={values.phone} onChange={set("phone")} maxLength={32} />}</Field>
      <Field label="Delivery address">{(a) => <Input {...a} autoComplete="street-address" value={values.delivery_address} onChange={set("delivery_address")} maxLength={500} />}</Field>
      <Field label="Delivery area">{(a) => <Input {...a} value={values.delivery_area} onChange={set("delivery_area")} maxLength={120} />}</Field>
      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "border-l-2 border-danger pl-3 text-small font-medium text-danger" : "border-l-2 border-success pl-3 text-small font-medium text-success"}>
          {msg.text}
        </p>
      )}
      <Button type="submit" variant="primary" loading={busy}>{busy ? "Saving…" : "Save changes"}</Button>
    </form>
  );
}
