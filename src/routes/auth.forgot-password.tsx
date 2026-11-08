import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { AuthShell, authInput, FormMessage } from "@/components/site/AuthShell";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password | Plants & Pure" },
      { name: "description", content: "Request a link to reset your Plants & Pure account password." },
      { property: "og:title", content: "Reset password — Plants & Pure" },
      { property: "og:description", content: "Reset your Plants & Pure password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!z.string().email().safeParse(email.trim()).success) return setError("Enter a valid email address.");
    setLoading(true);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/reset-password` });
    setLoading(false);
    if (error && !error.message.toLowerCase().includes("not found")) return setError("We couldn't send the email right now. Please try again in a minute.");
    setSent(true);
  };

  return (
    <AuthShell eyebrow="Account" title="Forgot your password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      {sent ? (
        <div className="space-y-5">
          <FormMessage tone="success">If an account exists for {email}, a reset link is on its way.</FormMessage>
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth/sign-in">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <label className="block">
            <span className="type-label text-muted-foreground">Email</span>
            <input className={`${authInput} mt-2`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} Send reset link
          </Button>
          <p className="type-small text-center">
            <Link to="/auth/sign-in" className="link-line text-muted-foreground">Back to sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
