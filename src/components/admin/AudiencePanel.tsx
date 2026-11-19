import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { friendlyError, rpc } from "@/lib/admin";
import { formatGHS } from "@/lib/money";
import { cn } from "@/lib/utils";

type Contact = { id: string; full_name: string | null; phone: string | null; email: string | null; source: "order" | "call" | "admin"; opted_out: boolean; notes: string | null; created_at: string; orders: number; spent: number | string };
type Subscriber = { id: string; email: string; first_name: string | null; source: string; status: "active" | "unsubscribed"; subscribed_at: string };
type Audience = { subscribers: Subscriber[]; contacts: Contact[] };

const SOURCE_LABEL: Record<Contact["source"], string> = { order: "Paid order", call: "Phoned us", admin: "Added by team" };

function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Everyone we may contact with promotions/updates: customers who paid or phoned, and e-mail subscribers. One row per person. */
export function AudiencePanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"customers" | "subscribers">("customers");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  const data = useQuery({ queryKey: ["admin-audience"], queryFn: () => rpc<Audience>("admin_audience") });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-audience"] });

  const add = useMutation({
    mutationFn: () => rpc("admin_add_contact", { p_name: form.name, p_phone: form.phone, p_email: form.email, p_notes: form.notes || null }),
    onSuccess: () => {
      toast.success("Saved. If this person was already on the list, their details were merged.");
      setForm({ name: "", phone: "", email: "", notes: "" });
      refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const optOut = useMutation({
    mutationFn: (v: { id: string; out: boolean }) => rpc("admin_set_contact_opt_out", { p_id: v.id, p_opted_out: v.out }),
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  });

  const needle = q.trim().toLowerCase();
  const contacts = useMemo(() => (data.data?.contacts ?? []).filter((c) => !needle || [c.full_name, c.phone, c.email].some((v) => v?.toLowerCase().includes(needle))), [data.data, needle]);
  const subs = useMemo(() => (data.data?.subscribers ?? []).filter((s) => !needle || [s.email, s.first_name].some((v) => v?.toLowerCase().includes(needle))), [data.data, needle]);
  const reachable = (data.data?.contacts ?? []).filter((c) => !c.opted_out).length;
  const active = (data.data?.subscribers ?? []).filter((s) => s.status === "active").length;

  return (
    <div>
      <h1 className="type-section">Audience</h1>
      <p className="type-body mt-2 max-w-2xl text-muted-foreground">
        Customers who pay or phone us are saved automatically (one entry per person, matched by phone number and email), and website visitors who subscribe appear under Subscribers. Download a CSV to import into Resend, WhatsApp Business or your SMS tool.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5"><p className="type-label text-muted-foreground">Customers</p><p className="type-sub mt-1">{data.data?.contacts.length ?? "–"} <span className="type-small font-normal text-muted-foreground">({reachable} can be contacted)</span></p></div>
        <div className="rounded-2xl border border-border bg-surface p-5"><p className="type-label text-muted-foreground">Email subscribers</p><p className="type-sub mt-1">{data.data?.subscribers.length ?? "–"} <span className="type-small font-normal text-muted-foreground">({active} active)</span></p></div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mt-6 rounded-2xl border border-border bg-surface p-5"
      >
        <p className="type-product">Add someone who phoned or messaged</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" aria-label="Name" className="h-11 rounded-xl border border-input bg-background px-4 outline-none focus:border-foreground" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (e.g. 0596083867)" aria-label="Phone" inputMode="tel" className="h-11 rounded-xl border border-input bg-background px-4 outline-none focus:border-foreground" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email (optional)" aria-label="Email" type="email" className="h-11 rounded-xl border border-input bg-background px-4 outline-none focus:border-foreground" />
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Note (optional)" aria-label="Note" className="h-11 rounded-xl border border-input bg-background px-4 outline-none focus:border-foreground" />
        </div>
        <Button type="submit" size="sm" variant="pepper" className="mt-4" disabled={add.isPending || (!form.phone.trim() && !form.email.trim())}>
          {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Save contact
        </Button>
      </form>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist">
          {(["customers", "subscribers"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("type-small rounded-full px-4 py-2 font-medium capitalize transition-colors", tab === t ? "bg-foreground text-background" : "bg-container hover:bg-sage-strong")}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-10 w-44 rounded-full border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-foreground" />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              tab === "customers"
                ? downloadCsv("plants-pure-customers.csv", [["Name", "Phone", "Email", "Source", "Paid orders", "Total spent (GHS)", "Opted out"], ...(data.data?.contacts ?? []).map((c) => [c.full_name ?? "", c.phone ?? "", c.email ?? "", SOURCE_LABEL[c.source], c.orders, Number(c.spent), c.opted_out ? "yes" : "no"])])
                : downloadCsv("plants-pure-subscribers.csv", [["Email", "First name", "Source", "Status", "Subscribed"], ...(data.data?.subscribers ?? []).map((s) => [s.email, s.first_name ?? "", s.source, s.status, s.subscribed_at.slice(0, 10)])])
            }
          >
            <Download /> CSV
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
        {data.isPending ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : data.isError ? (
          <p className="type-body p-6 text-muted-foreground">Couldn't load the audience. Has the latest database migration been run?</p>
        ) : tab === "customers" ? (
          <table className="type-small w-full min-w-[640px] text-left">
            <thead className="border-b border-border text-muted-foreground"><tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Email</th><th className="p-3">Source</th><th className="p-3 text-right">Orders</th><th className="p-3 text-right">Spent</th><th className="p-3 text-right">Contact</th></tr></thead>
            <tbody>
              {contacts.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No customers yet.</td></tr>}
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{c.full_name ?? "—"}</td>
                  <td className="p-3">{c.phone ?? "—"}</td>
                  <td className="p-3">{c.email ?? "—"}</td>
                  <td className="p-3">{SOURCE_LABEL[c.source]}</td>
                  <td className="p-3 text-right tabular-nums">{c.orders}</td>
                  <td className="p-3 text-right tabular-nums">{Number(c.spent) > 0 ? formatGHS(Number(c.spent)) : "—"}</td>
                  <td className="p-3 text-right">
                    <button type="button" onClick={() => optOut.mutate({ id: c.id, out: !c.opted_out })} className={cn("rounded-full px-3 py-1 text-xs font-semibold", c.opted_out ? "bg-destructive/10 text-destructive" : "bg-sage text-forest")}>
                      {c.opted_out ? "Opted out" : "OK to contact"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="type-small w-full min-w-[520px] text-left">
            <thead className="border-b border-border text-muted-foreground"><tr><th className="p-3">Email</th><th className="p-3">Name</th><th className="p-3">Source</th><th className="p-3">Status</th><th className="p-3 text-right">Joined</th></tr></thead>
            <tbody>
              {subs.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No subscribers yet.</td></tr>}
              {subs.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{s.email}</td>
                  <td className="p-3">{s.first_name ?? "—"}</td>
                  <td className="p-3 capitalize">{s.source}</td>
                  <td className="p-3"><span className={cn("rounded-full px-3 py-1 text-xs font-semibold", s.status === "active" ? "bg-sage text-forest" : "bg-container text-muted-foreground")}>{s.status === "active" ? "Active" : "Unsubscribed"}</span></td>
                  <td className="p-3 text-right text-muted-foreground">{new Date(s.subscribed_at).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
