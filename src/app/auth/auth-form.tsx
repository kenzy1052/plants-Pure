"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/api/safe-next";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

const MIN_PASSWORD = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TITLES: Record<Mode, string> = { "sign-in": "Sign in", "sign-up": "Create your account", forgot: "Reset your password", reset: "Choose a new password" };
const SUBTITLES: Record<Mode, string> = {
  "sign-in": "Welcome back. Orders, addresses and more, in one place.",
  "sign-up": "Create an account to track orders and speed up checkout.",
  forgot: "Enter the e-mail you signed up with and we'll send a reset link.",
  reset: "Pick a new password. Keep it at least 10 characters.",
};

export function AuthForm({ mode, next, initialError }: { mode: Mode; next?: string; initialError?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const confirm = String(f.get("confirm") ?? "");
    const origin = window.location.origin;
    const target = safeNext(next);

    if ((mode === "sign-up" || mode === "reset") && password.length < MIN_PASSWORD) {
      setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (mode === "sign-up" && !EMAIL.test(email)) {
      setError("Enter a valid e-mail address.");
      return;
    }
    if ((mode === "sign-up" || mode === "reset") && password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.code === "email_not_confirmed" ? "Please confirm your e-mail address first. Check your inbox for the link." : "That e-mail and password don't match.");
        } else {
          window.location.assign(target); // full navigation so server components see the new session
        }
      } else if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(target)}`,
            data: { first_name: String(f.get("first_name") ?? "").trim(), last_name: String(f.get("last_name") ?? "").trim() },
          },
        });
        if (error) setError("We couldn't create your account. Check your details and try again.");
        // Same message whether or not the address is already registered (no account enumeration).
        else setNotice("Check your e-mail for a confirmation link. If you already have an account, sign in or reset your password.");
      } else if (mode === "forgot") {
        await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?type=recovery` });
        setNotice("If an account exists for that address, a reset link is on its way.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) setError("We couldn't update your password. The link may have expired — request a new one.");
        else window.location.assign("/account"); // eslint-disable-line @next/next/no-location-assign-relative-destination -- full navigation: new session
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const link = "underline underline-offset-4 hover:text-text";
  return (
    <div className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-md">
        <p className="eyebrow text-text-muted">Account</p>
        <h1 className="mt-3 text-h2">{TITLES[mode]}</h1>
        <p className="mt-3 text-text-secondary">{SUBTITLES[mode]}</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-5 border-t border-border pt-8">
          {mode === "sign-up" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name">{(a) => <Input {...a} name="first_name" autoComplete="given-name" maxLength={60} />}</Field>
              <Field label="Last name">{(a) => <Input {...a} name="last_name" autoComplete="family-name" maxLength={60} />}</Field>
            </div>
          )}
          {mode !== "reset" && (
            <Field label="E-mail" required>{(a) => <Input {...a} name="email" type="email" autoComplete="email" />}</Field>
          )}
          {mode !== "forgot" && (
            <Field label={mode === "reset" ? "New password" : "Password"} required hint={mode !== "sign-in" ? `At least ${MIN_PASSWORD} characters.` : undefined}>
              {(a) => <Input {...a} name="password" type="password" minLength={mode === "sign-in" ? undefined : MIN_PASSWORD} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} />}
            </Field>
          )}
          {(mode === "sign-up" || mode === "reset") && (
            <Field label="Confirm password" required>
              {(a) => <Input {...a} name="confirm" type="password" minLength={MIN_PASSWORD} autoComplete="new-password" />}
            </Field>
          )}
          {error && <p role="alert" className="border-l-2 border-danger pl-3 text-small font-medium text-danger">{error}</p>}
          {notice && <p role="status" className="border-l-2 border-success pl-3 text-small font-medium text-success">{notice}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
            {busy ? "Please wait…" : TITLES[mode]}
          </Button>
        </form>
        <div className="mt-8 space-y-2 border-t border-border pt-6 text-small text-text-secondary">
          {mode === "sign-in" && (
            <>
              <p><Link className={link} href="/auth/forgot-password">Forgot your password?</Link></p>
              <p>New here? <Link className={link} href={`/auth/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link></p>
            </>
          )}
          {mode === "sign-up" && <p>Already registered? <Link className={link} href="/auth/sign-in">Sign in</Link></p>}
          {(mode === "forgot" || mode === "reset") && <p><Link className={link} href="/auth/sign-in">Back to sign in</Link></p>}
        </div>
      </div>
    </div>
  );
}
