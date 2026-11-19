import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getOrderReviewState, submitOrderReview } from "@/lib/growth.functions";
import "@/components/site/growth.css";

const WORDS = ["", "Not good", "Could be better", "Good", "Very good", "Loved it"];

/**
 * "How was your order?" Shown on the tracking page once an order is delivered/collected.
 * The review is saved as pending and only appears on the site after an admin approves it.
 */
export function ReviewForm({ code, delivered }: { code: string; delivered: boolean }) {
  const getState = useServerFn(getOrderReviewState);
  const submit = useServerFn(submitOrderReview);
  const [state, setState] = useState<"loading" | "hidden" | "open" | "done">("loading");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trap = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!delivered) {
      setState("hidden");
      return;
    }
    let off = false;
    getState({ data: { code } })
      .then((r) => {
        if (off) return;
        setState(r.ok && r.data.eligible ? (r.data.reviewed ? "done" : "open") : "hidden");
      })
      .catch(() => !off && setState("hidden"));
    return () => {
      off = true;
    };
  }, [code, delivered]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "loading" || state === "hidden") return null;

  if (state === "done") {
    return (
      <div role="status" className="mt-6 flex items-start gap-3 rounded-2xl bg-sage p-5 text-forest">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-olive" />
        <p className="type-small">Thank you for your review. It will appear on our site once our team has approved it. Every word helps other cooks choose well.</p>
      </div>
    );
  }

  const shown = hover || rating;
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (rating === 0) return setError("Please choose a star rating.");
    if (body.trim().length < 10) return setError("Please tell us a little more (at least 10 characters).");
    setBusy(true);
    try {
      const res = await submit({ data: { code, rating, title: title || undefined, body, website: trap.current?.value ?? "" } });
      if (res.ok) {
        setState("done");
        toast.success("Thank you! Your review is on its way to our team.");
      } else {
        if (res.code === "already_reviewed") setState("done");
        setError(res.error);
      }
    } catch {
      setError("We couldn't save your review. Please check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6" noValidate>
      <p className="type-sub">How was your experience?</p>
      <p className="type-small mt-1 text-muted-foreground">Your honest review helps other customers, and helps us keep getting better.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="star-input" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} data-on={n <= shown} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => setRating(n)}>
              <Star className="h-8 w-8" fill={n <= shown ? "currentColor" : "none"} strokeWidth={n <= shown ? 0 : 1.6} />
            </button>
          ))}
        </div>
        <span className="type-small font-semibold text-olive" aria-live="polite">{WORDS[shown]}</span>
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Headline (optional)" aria-label="Review headline" className="mt-4 h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:border-foreground focus:ring-4 focus:ring-ring/15" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={800} rows={4} placeholder="What did you love? How were the delivery and the products?" aria-label="Your review" className="mt-3 w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus:border-foreground focus:ring-4 focus:ring-ring/15" />
      <input ref={trap} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      {error && <p role="alert" className="type-small mt-3 text-destructive">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="type-small text-muted-foreground">Only your first name and last initial are shown.</p>
        <Button type="submit" variant="pepper" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Submit review
        </Button>
      </div>
    </form>
  );
}
