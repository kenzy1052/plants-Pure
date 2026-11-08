"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

const MIN_PASSWORD = 10;

/**
 * Lets a signed-in customer change their own password while a session exists.
 * Uses the browser client (their own session), so the database authorisation
 * (RLS on auth.users) still applies — there is no admin or service-role key here.
 */
export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    const confirm = String(f.get("confirm") ?? "");
    if (password.length < MIN_PASSWORD) {
      setMsg({ kind: "error", text: `Use a password of at least ${MIN_PASSWORD} characters.` });
      setBusy(false);
      return;
    }
    if (password !== confirm) {
      setMsg({ kind: "error", text: "The two passwords don't match." });
      setBusy(false);
      return;
    }
    const { error } = await getSupabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMsg({
        kind: "error",
        text: error.code === "same_password" ? "The new password must differ from your current one." : "We couldn't update your password. Please try again.",
      });
    } else {
      setMsg({ kind: "ok", text: "Your password has been updated." });
      e.currentTarget.reset();
    }
  }

  return (
    <form onSubmit={changePassword} className="space-y-5" aria-label="Change password">
      <Field label="New password" required hint={`At least ${MIN_PASSWORD} characters.`}>
        {(a) => <Input {...a} name="password" type="password" minLength={MIN_PASSWORD} autoComplete="new-password" />}
      </Field>
      <Field label="Confirm new password" required>
        {(a) => <Input {...a} name="confirm" type="password" minLength={MIN_PASSWORD} autoComplete="new-password" />}
      </Field>
      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "border-l-2 border-danger pl-3 text-small font-medium text-danger" : "border-l-2 border-success pl-3 text-small font-medium text-success"}>
          {msg.text}
        </p>
      )}
      <Button type="submit" variant="secondary" loading={busy}>{busy ? "Updating…" : "Update password"}</Button>
    </form>
  );
}
