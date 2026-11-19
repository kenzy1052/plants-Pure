import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unsubscribeFromUpdates } from "@/lib/growth.functions";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s) => z.object({ token: z.string().max(64).optional().catch(undefined) }).parse(s),
  head: () => ({ meta: [{ title: "Unsubscribe | Plants & Pure" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Unsubscribe,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Unsubscribe() {
  const { token } = Route.useSearch();
  const run = useServerFn(unsubscribeFromUpdates);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const valid = Boolean(token && UUID.test(token));

  // A click is required (rather than unsubscribing on page load) so e-mail link scanners can't do it by accident.
  const confirm = async () => {
    if (!token) return;
    setState("busy");
    try {
      const res = await run({ data: { token } });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center pt-28 text-center">
      {state === "done" ? (
        <>
          <CheckCircle2 className="h-10 w-10 text-olive" />
          <h1 className="type-section mt-5">You've been unsubscribed.</h1>
          <p className="type-body mt-3 max-w-md text-muted-foreground">We're sorry to see you go. You're always welcome back, and our door (and shop) stays open.</p>
          <Button asChild className="mt-8"><Link to="/">Back to the shop</Link></Button>
        </>
      ) : (
        <>
          <h1 className="type-section">Unsubscribe from updates?</h1>
          <p className="type-body mt-3 max-w-md text-muted-foreground">{valid ? "You'll stop receiving news and offers from Plants & Pure. Order receipts will still reach you." : "This unsubscribe link looks incomplete. Please use the link in your latest email, or contact us."}</p>
          {state === "error" && <p role="alert" className="type-small mt-4 text-destructive">Something went wrong. Please try again.</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {valid && (
              <Button variant="pepper" onClick={confirm} disabled={state === "busy"}>
                {state === "busy" && <Loader2 className="animate-spin" />} Yes, unsubscribe me
              </Button>
            )}
            <Button asChild variant="outline"><Link to="/">Keep me subscribed</Link></Button>
          </div>
        </>
      )}
    </div>
  );
}
