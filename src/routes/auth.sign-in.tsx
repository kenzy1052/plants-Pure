import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { AuthShell, authInput, FormMessage, GoogleButton, OrDivider, PasswordInput } from "@/components/site/AuthShell";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { safeNext } from "@/lib/auth";
import { landingFor } from "@/lib/profile";

export const Route = createFileRoute("/auth/sign-in")({
  validateSearch: (s) => z.object({ next: z.string().max(200).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "Sign in | Plants & Pure" },
      { name: "description", content: "Sign in to your Plants & Pure account to see your orders and check out faster." },
      { property: "og:title", content: "Sign in — Plants & Pure" },
      { property: "og:description", content: "Access your Plants & Pure account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!z.string().email().safeParse(email.trim()).success) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    setLoading(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(error.message.toLowerCase().includes("confirm") ? "Please confirm your email first — check your inbox for the link." : "That email and password don't match. Please try again.");
      return;
    }
    navigate({ to: await landingFor(next, safeNext) });
  };

  return (
    <AuthShell eyebrow="Account" title="Welcome back" subtitle="Sign in to see your orders and check out faster.">
      <div className="space-y-5">
      <GoogleButton next={next} />
      <OrDivider />
      <form onSubmit={submit} noValidate className="space-y-5">
        <label className="block">
          <span className="type-label text-muted-foreground">Email</span>
          <input className={`${authInput} mt-2`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="type-label text-muted-foreground">Password</span>
            <Link to="/auth/forgot-password" className="type-small link-line text-muted-foreground">Forgot password?</Link>
          </span>
          <div className="mt-2">
            <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </label>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Sign in
        </Button>
        <p className="type-small text-center text-muted-foreground">
          New here?{" "}
          <Link to="/auth/sign-up" search={{ next }} className="link-line text-foreground">Create an account</Link>
        </p>
      </form>
      </div>
    </AuthShell>
  );
}
