"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, User } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { publicEnv } from "@/lib/env/public";

/**
 * Signed-in / signed-out affordance for the header.
 *
 * - Reads the user's real session from Supabase Auth (the browser client, so it
 *   stays in sync with the cookies the proxy refreshes). It is presentational only:
 *   `/account` and `/admin` still enforce their own server-side checks.
 * - When signed in, shows a small menu (Account · Admin when the user is an admin ·
 *   Sign out), with the role read from the session user metadata ONLY as a
 *   convenience *hint* — the role is always re-verified server-side from
 *   public.profiles.
 * - When signed out, it is a plain link to /account (the proxy sends signed-out
 *   visitors to sign-in).
 */
export function AccountMenu() {
  const [user, setUser] = useState<{ email: string | null; isAdmin: boolean } | null | "unknown">("unknown");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return;
    let cancelled = false;
    getSupabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data.user) return setUser(null);
        const isAdmin = data.user.app_metadata?.role === "admin";
        setUser({ email: data.user.email ?? null, isAdmin });
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Present nothing until we know the session to avoid a flash of the wrong icon.
  if (user === "unknown") {
    return (
      <span
        className="hidden size-11 place-items-center rounded-control text-text-muted sm:grid"
        aria-hidden="true"
      >
        <User className="size-5" strokeWidth={1.5} />
      </span>
    );
  }

  if (!user) {
    return (
      <Link href="/account" className="hidden sm:grid" aria-label="Account">
        <span className="grid size-11 place-items-center rounded-control text-text transition-colors hover:bg-background-alt">
          <User className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </Link>
    );
  }

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-11 items-center gap-1 rounded-control px-1 text-small font-semibold transition-colors hover:bg-background-alt"
      >
        <User className="size-5" strokeWidth={1.5} aria-hidden="true" />
        <ChevronDown className="size-4 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div
            role="menu"
            aria-label="Account"
            className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-control border border-border-strong bg-surface p-1 shadow-overlay"
          >
            <p className="px-3 pb-1 pt-2 text-caption text-text-muted" aria-hidden="true">
              Signed in as {user.email}
            </p>
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-xs px-3 text-small font-medium hover:bg-background-alt"
            >
              My account
            </Link>
            {user.isAdmin && (
              <Link
                href="/admin/products"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-xs px-3 text-small font-medium hover:bg-background-alt"
              >
                Catalogue admin
              </Link>
            )}
            <form
              action="/auth/sign-out"
              method="post"
              className="border-t border-border pt-1"
              onSubmit={() => setOpen(false)}
            >
              <button
                type="submit"
                role="menuitem"
                className="flex min-h-11 w-full items-center rounded-xs px-3 text-left text-small font-medium text-danger hover:bg-danger-soft"
              >
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
