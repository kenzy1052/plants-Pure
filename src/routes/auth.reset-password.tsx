import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell, FormMessage, PasswordInput } from "@/components/site/AuthShell";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password | Plants & Pure" },
      { name: "description", content: "Set a new password for your Plants & Pure account." },
      { property: "og:title", content: "New password — Plants & Pure" },
      { property: "og:description", content: "Set a new Plants & Pure password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The recovery link signs the visitor in (PKCE code exchange handled by the client).
  useEffect(() => {
    if (!authLoading) setReady(true);
  }, [authLoading]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("The two passwords don't match.");
    setLoading(true);
    const { error } = await getSupabase().auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return setError("We couldn't update your password. The link may have expired — request a new one.");
    navigate({ to: "/account" });
  };

  return (
    <AuthShell eyebrow="Account" title="Choose a new password">
      {!ready ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : !user ? (
        <div className="space-y-5">
          <FormMessage tone="error">This reset link is invalid or has expired.</FormMessage>
          <Button asChild className="w-full">
            <Link to="/auth/forgot-password">Request a new link</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <label className="block">
            <span className="type-label text-muted-foreground">New password</span>
            <div className="mt-2"><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          </label>
          <label className="block">
            <span className="type-label text-muted-foreground">Confirm password</span>
            <div className="mt-2"><PasswordInput autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          </label>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} Save password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
