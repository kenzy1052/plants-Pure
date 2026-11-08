import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { safeNext } from "@/lib/auth";
import { landingFor } from "@/lib/profile";

/** Landing page for email confirmation links. The client exchanges the code, then continues. */
export const Route = createFileRoute("/auth/callback")({
  validateSearch: (s) => z.object({ next: z.string().max(200).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "Signing you in | Plants & Pure" },
      { name: "description", content: "Completing sign-in to Plants & Pure." },
      { property: "og:title", content: "Plants & Pure" },
      { property: "og:description", content: "Completing sign-in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const sb = getSupabase();
    const t = setTimeout(async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) navigate({ to: await landingFor(next, safeNext) });
      else setFailed(true);
    }, 900);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center pt-28 text-center">
      {failed ? (
        <>
          <h1 className="type-section">This link has expired</h1>
          <p className="type-body mt-3 text-muted-foreground">Please sign in, or request a new confirmation email.</p>
          <a href="/auth/sign-in" className="type-small link-line mt-6">Go to sign in</a>
        </>
      ) : (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
