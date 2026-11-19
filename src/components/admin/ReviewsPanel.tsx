import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Stars } from "@/components/shop/Stars";
import { friendlyError } from "@/lib/admin";
import { getSupabase } from "@/lib/supabase";
import { MIN_TESTIMONIALS_TO_SHOW } from "@/lib/testimonials";
import { cn } from "@/lib/utils";

type Review = { id: string; display_name: string; rating: number; title: string | null; body: string; status: "pending" | "approved" | "rejected"; created_at: string; order_id: string };

const TABS = [
  { key: "pending", label: "Awaiting approval" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

export function ReviewsPanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");
  const reviews = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("reviews").select("id, display_name, rating, title, body, status, created_at, order_id").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    void qc.invalidateQueries({ queryKey: ["testimonials"] });
  };
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Review["status"] }) => {
      const { error } = await getSupabase().from("reviews").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Approved. It will show on the site." : v.status === "rejected" ? "Rejected." : "Moved back to pending.");
      refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review deleted.");
      refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const all = reviews.data ?? [];
  const count = (s: Review["status"]) => all.filter((r) => r.status === s).length;
  const approved = count("approved");
  const list = all.filter((r) => r.status === tab);

  return (
    <div>
      <h1 className="type-section">Customer reviews</h1>
      <p className="type-body mt-2 max-w-2xl text-muted-foreground">
        Customers rate their order after it is delivered. Nothing goes public until you approve it.{" "}
        {approved >= MIN_TESTIMONIALS_TO_SHOW
          ? "The testimonials section is live on the site."
          : `The testimonials section stays hidden until ${MIN_TESTIMONIALS_TO_SHOW} reviews are approved (${approved} so far).`}
      </p>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("type-small shrink-0 rounded-full px-4 py-2 font-medium transition-colors", tab === t.key ? "bg-foreground text-background" : "bg-container hover:bg-sage-strong")}>
            {t.label} <span className="opacity-70">({count(t.key)})</span>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {reviews.isPending ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : reviews.isError ? (
          <p className="type-body rounded-2xl bg-container p-6 text-muted-foreground">Couldn't load reviews. Has the latest database migration been run?</p>
        ) : list.length === 0 ? (
          <p className="type-body rounded-2xl bg-container p-8 text-center text-muted-foreground">Nothing here yet.</p>
        ) : (
          list.map((r) => (
            <article key={r.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Stars value={r.rating} />
                  <span className="type-small font-semibold">{r.display_name}</span>
                </div>
                <span className="type-small text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              {r.title && <p className="type-product mt-3">{r.title}</p>}
              <p className="type-small mt-2 whitespace-pre-line text-foreground/85">{r.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.status !== "approved" && (
                  <button type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: r.id, status: "approved" })} className="type-small inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-2 font-semibold text-pepper-foreground disabled:opacity-60">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: r.id, status: "rejected" })} className="type-small inline-flex items-center gap-1.5 rounded-full bg-container px-4 py-2 font-medium hover:bg-sage-strong disabled:opacity-60">
                    <X className="h-4 w-4" /> {r.status === "approved" ? "Take down" : "Reject"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm("Delete this review permanently?")) remove.mutate(r.id);
                  }}
                  className="type-small inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
