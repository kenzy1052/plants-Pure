import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { subscribeToUpdates } from "@/lib/growth.functions";
import "./growth.css";

/** Footer e-mail sign-up. Honeypot-protected; the server saves one row per address and sends a welcome e-mail through Resend. */
export function SubscribeForm({ source = "footer" }: { source?: string }) {
  const subscribe = useServerFn(subscribeToUpdates);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const trap = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setMessage(null);
    try {
      const res = await subscribe({ data: { email, source, website: trap.current?.value ?? "" } });
      if (res.ok) {
        setState("done");
        setMessage(res.data.status === "already" ? "You're already on the list. Lovely to see you again!" : "You're in. Check your inbox for a warm hello from us.");
      } else {
        setState("idle");
        setMessage(res.error);
      }
    } catch {
      setState("idle");
      setMessage("We couldn't sign you up just now. Please check your connection and try again.");
    }
  };

  if (state === "done") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-white/15 p-4 text-white">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-lime" />
        <p className="type-small font-medium">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="subscribe-field">
        <label htmlFor={`sub-${source}`} className="sr-only">
          Email address
        </label>
        <input id={`sub-${source}`} type="email" inputMode="email" autoComplete="email" required placeholder="Your email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        {/* honeypot: invisible to people, irresistible to bots */}
        <input ref={trap} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <button type="submit" className="subscribe-btn" disabled={state === "busy"}>
          {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Join <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {message && (
        <p role="alert" className="type-small mt-3 text-white">
          {message}
        </p>
      )}
    </form>
  );
}
