import type { ReactNode } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { PHOTO } from "@/assets/company";
import { BUSINESS } from "@/lib/business";
import { getSupabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

/** "Continue with Google" — Supabase OAuth. Needs the Google provider switched on in Supabase (see README). */
export function GoogleButton({ next, label = "Continue with Google" }: { next?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null);
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    const { error } = await getSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      setBusy(false);
      setErr("Google sign-in isn't available right now. Please use your email and password.");
    }
  };
  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className="type-body inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-input bg-background font-semibold transition-colors hover:bg-container disabled:opacity-60">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
            <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
        )}
        {label}
      </button>
      {err && <p role="alert" className="type-small mt-2 text-destructive">{err}</p>}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="type-label text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function AuthShell({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="pt-[6.75rem]">
      <div className="grid min-h-[calc(100vh-6.75rem)] lg:grid-cols-2">
        <div className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <p className="type-label text-muted-foreground">{eyebrow}</p>
            <h1 className="type-section mt-3">{title}</h1>
            {subtitle && <p className="type-body mt-3 text-muted-foreground">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <div className="relative hidden overflow-hidden lg:block">
          <img src={PHOTO.pouchesStudio} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/10 to-transparent" />
          <p className="absolute bottom-10 left-10 right-10 font-display text-4xl leading-tight text-pepper-foreground">{BUSINESS.tagline}.</p>
        </div>
      </div>
    </div>
  );
}

export const authInput =
  "type-body h-12 w-full rounded-2xl border border-input bg-background px-4 outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-foreground focus:ring-4 focus:ring-ring/15";

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${authInput} pr-12`} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`type-small rounded-2xl p-4 ${tone === "error" ? "bg-destructive/10 text-destructive" : "bg-sage text-foreground"}`}>
      {children}
    </p>
  );
}
