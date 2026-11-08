import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { AuthShell, authInput, FormMessage, GoogleButton, OrDivider, PasswordInput } from "@/components/site/AuthShell";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { safeNext } from "@/lib/auth";

export const Route = createFileRoute("/auth/sign-up")({
  validateSearch: (s) => z.object({ next: z.string().max(200).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "Create an account | Plants & Pure" },
      { name: "description", content: "Create a Plants & Pure account to track orders and save your delivery details." },
      { property: "og:title", content: "Create an account — Plants & Pure" },
      { property: "og:description", content: "Join Plants & Pure." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignUp,
});

function SignUp() {
  const { next } = Route.useSearch();
  const [form, setForm] = useState({ first: "", last: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.first.trim()) return setError("Please enter your first name.");
    if (!z.string().email().safeParse(form.email.trim()).success) return setError("Enter a valid email address.");
    if (form.password.length < 8) return setError("Use at least 8 characters for your password.");
    setLoading(true);
    const { data, error } = await getSupabase().auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
        data: { first_name: form.first.trim(), last_name: form.last.trim() },
      },
    });
    setLoading(false);
    if (error) return setError(error.message.includes("registered") ? "An account with this email already exists. Try signing in." : "We couldn't create your account. Please try again.");
    if (data.session) window.location.assign(safeNext(next));
    else setSent(true);
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthShell eyebrow="Account" title="Create your account" subtitle="Track orders and save your delivery details for next time.">
      {sent ? (
        <div className="space-y-5">
          <FormMessage tone="success">Check your inbox — we've sent a link to confirm {form.email}.</FormMessage>
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth/sign-in">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
        <GoogleButton next={next} label="Sign up with Google" />
        <OrDivider />
        <form onSubmit={submit} noValidate className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="type-label text-muted-foreground">First name</span>
              <input className={`${authInput} mt-2`} autoComplete="given-name" value={form.first} onChange={set("first")} />
            </label>
            <label className="block">
              <span className="type-label text-muted-foreground">Last name</span>
              <input className={`${authInput} mt-2`} autoComplete="family-name" value={form.last} onChange={set("last")} />
            </label>
          </div>
          <label className="block">
            <span className="type-label text-muted-foreground">Email</span>
            <input className={`${authInput} mt-2`} type="email" autoComplete="email" value={form.email} onChange={set("email")} />
          </label>
          <label className="block">
            <span className="type-label text-muted-foreground">Password</span>
            <div className="mt-2">
              <PasswordInput autoComplete="new-password" value={form.password} onChange={set("password")} />
            </div>
            <span className="type-small mt-1.5 block text-muted-foreground">At least 8 characters.</span>
          </label>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} Create account
          </Button>
          <p className="type-small text-center text-muted-foreground">
            Already have an account?{" "}
            <Link to="/auth/sign-in" search={{ next }} className="link-line text-foreground">Sign in</Link>
          </p>
        </form>
        </div>
      )}
    </AuthShell>
  );
}
