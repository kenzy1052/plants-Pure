import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Check, Loader2, LogOut, MapPin, Package, LayoutDashboard, ShieldCheck, Store, UserRound, Lock, ShoppingBag, Wallet, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authInput, FormMessage, PasswordInput } from "@/components/site/AuthShell";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { formatGHS } from "@/lib/money";
import { cn } from "@/lib/utils";
import { FULFILMENT_STEPS, stepLabels, statusLabel, trackingCode } from "@/lib/tracking";
import { isStaffRole, myProfileQuery, type Profile } from "@/lib/profile";
import { ReceivedButton } from "@/components/shop/ReceivedButton";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "orders", label: "My orders", icon: Package },
  { key: "profile", label: "My details", icon: UserRound },
  { key: "address", label: "Delivery address", icon: MapPin },
  { key: "security", label: "Password", icon: Lock },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export const Route = createFileRoute("/account")({
  validateSearch: (s) => z.object({ tab: z.enum(["dashboard", "orders", "profile", "address", "security"]).optional().catch(undefined) }).parse(s),
  head: () => ({
    meta: [
      { title: "My account | Plants & Pure" },
      { name: "description", content: "Your Plants & Pure dashboard, orders and delivery details." },
      { property: "og:title", content: "My account — Plants & Pure" },
      { property: "og:description", content: "Your Plants & Pure account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Account,
});

type Order = {
  id: string;
  order_number: number;
  public_id: string;
  created_at: string;
  total_amount: number;
  payment_status: string;
  fulfillment_status: string;
  order_items: { product_title: string; quantity: number }[];
  delivery_zones: { name: string; is_pickup: boolean } | { name: string; is_pickup: boolean }[] | null;
};
const isPickup = (o: Order) => Boolean((Array.isArray(o.delivery_zones) ? o.delivery_zones[0] : o.delivery_zones)?.is_pickup);

const PAY: Record<string, { label: string; tone: string }> = {
  paid: { label: "Paid", tone: "bg-sage text-forest" },
  pending: { label: "Awaiting payment", tone: "bg-warning-soft text-warning" },
  failed: { label: "Payment failed", tone: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", tone: "bg-container text-muted-foreground" },
  refunded: { label: "Refunded", tone: "bg-container text-muted-foreground" },
  review: { label: "Under review", tone: "bg-warning-soft text-warning" },
};

function Account() {
  const { user, loading } = useAuth();
  const { tab: tabParam } = Route.useSearch();
  const tab: TabKey = tabParam ?? "dashboard";
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth/sign-in", search: { next: "/account" }, replace: true });
  }, [loading, user, navigate]);

  const profile = useQuery(myProfileQuery(user?.id));
  const orders = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("orders")
        .select("id, order_number, public_id, created_at, total_amount, payment_status, fulfillment_status, order_items(product_title, quantity), delivery_zones(name, is_pickup)")
        .eq("user_id", user!.id) // staff can read every order; this page only ever shows the signed-in person's own
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Order[];
    },
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center pt-28">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const first = profile.data?.first_name || (user.user_metadata?.given_name as string | undefined) || (user.user_metadata?.first_name as string | undefined);
  const staff = isStaffRole(profile.data?.role);
  const signOut = async () => {
    await getSupabase().auth.signOut();
    qc.removeQueries({ queryKey: ["my-orders"] });
    qc.removeQueries({ queryKey: ["my-profile"] });
    navigate({ to: "/" });
  };

  return (
    <div className="container-page pb-24 pt-[8.5rem] sm:pt-40">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Left tabs */}
        <aside className="lg:col-span-3">
          <div className="lg:sticky lg:top-32">
            <p className="type-label text-muted-foreground">My account</p>
            <p className="type-product mt-1 truncate">{first ? `Hello, ${first}` : "Hello"}</p>
            <p className="type-small truncate text-muted-foreground">{user.email}</p>
            <nav aria-label="Account sections" className="-mx-1 mt-5 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  to="/account"
                  search={{ tab: t.key }}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={cn("type-small inline-flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 font-medium transition-colors lg:rounded-2xl", tab === t.key ? "bg-foreground text-background" : "text-foreground/80 hover:bg-container")}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </Link>
              ))}
              {staff && (
                <Link to="/admin" className="type-small inline-flex shrink-0 items-center gap-2.5 rounded-full bg-brand-gradient px-4 py-2.5 font-semibold text-pepper-foreground lg:mt-2 lg:rounded-2xl">
                  <ShieldCheck className="h-4 w-4" /> Admin
                </Link>
              )}
              <button type="button" onClick={signOut} className="type-small inline-flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 font-medium text-foreground/80 hover:bg-container lg:mt-2 lg:rounded-2xl">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </nav>
          </div>
        </aside>

        <section className="min-w-0 lg:col-span-9" aria-live="polite">
          {tab === "dashboard" && <DashboardTab first={first} orders={orders} />}
          {tab === "orders" && <OrdersTab orders={orders} />}
          {tab === "profile" && (profile.data !== undefined ? <ProfileForm userId={user.id} email={user.email ?? ""} initial={profile.data} /> : <Skeleton />)}
          {tab === "address" && (profile.data !== undefined ? <AddressForm userId={user.id} initial={profile.data} /> : <Skeleton />)}
          {tab === "security" && <PasswordForm />}
        </section>
      </div>
    </div>
  );
}

const Skeleton = () => <div className="h-64 animate-pulse rounded-[1.5rem] bg-container" />;

function StatusSteps({ o }: { o: Order }) {
  if (o.payment_status !== "paid") return null;
  if (o.fulfillment_status === "cancelled") return <p className="type-small mt-4 text-muted-foreground">This order was cancelled.</p>;
  if (o.fulfillment_status === "on_hold") return <p className="type-small mt-4 rounded-xl bg-warning-soft p-3 text-warning">On hold — we'll contact you shortly.</p>;
  const idx = FULFILMENT_STEPS.findIndex((s) => s.key === o.fulfillment_status);
  const labels = stepLabels(isPickup(o));
  return (
    <ol className="mt-5 grid grid-cols-4 gap-2">
      {labels.map((l, i) => (
        <li key={l} className="min-w-0">
          <div className={cn("h-1.5 rounded-full", i <= idx ? "bg-brand-gradient" : "bg-container")} />
          <p className={cn("type-label mt-2 flex items-center gap-1 leading-tight", i <= idx ? "text-foreground" : "text-muted-foreground")}>
            {i <= idx && <Check className="h-3 w-3 shrink-0 text-pepper" />}
            <span>{l}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

function OrderCard({ o }: { o: Order }) {
  const qc = useQueryClient();
  const s = PAY[o.payment_status] ?? { label: o.payment_status, tone: "bg-container" };
  return (
    <article className="rounded-[1.25rem] border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="type-product">Order #{o.order_number}</p>
          <p className="type-small text-muted-foreground">{new Date(o.created_at).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("type-label rounded-full px-3 py-1.5", s.tone)}>{s.label}</span>
          {o.payment_status === "paid" && <span className="type-label rounded-full bg-container px-3 py-1.5">{statusLabel(o.fulfillment_status, isPickup(o))}</span>}
        </div>
      </div>
      <p className="type-small mt-4 text-muted-foreground">{o.order_items.map((i) => `${i.quantity} × ${i.product_title}`).join(" · ")}</p>
      <StatusSteps o={o} />
      {o.payment_status === "paid" && o.fulfillment_status === "dispatched" && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-sage p-4">
          <p className="type-small min-w-0 flex-1 text-forest">{isPickup(o) ? "Your order is ready. Collected it already?" : "Your order is on its way. Has it arrived?"}</p>
          <ReceivedButton code={trackingCode(o.order_number, o.public_id)} pickup={isPickup(o)} onDone={() => qc.invalidateQueries({ queryKey: ["my-orders"] })} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="type-body font-bold tabular-nums">{formatGHS(o.total_amount)}</p>
        {o.payment_status === "paid" && (
          <Link to="/track" search={{ code: trackingCode(o.order_number, o.public_id) }} className="type-small font-semibold text-pepper hover:underline">
            Track · {trackingCode(o.order_number, o.public_id)}
          </Link>
        )}
      </div>
    </article>
  );
}

function DashboardTab({ first, orders }: { first?: string; orders: ReturnType<typeof useQuery<Order[]>> }) {
  const list = orders.data ?? [];
  const paid = list.filter((o) => o.payment_status === "paid");
  const spent = paid.reduce((a, o) => a + Number(o.total_amount), 0);
  const open = paid.filter((o) => !["delivered", "cancelled"].includes(o.fulfillment_status));
  const done = paid.filter((o) => o.fulfillment_status === "delivered");
  const stats = [
    { icon: ShoppingBag, label: "Orders placed", value: String(paid.length) },
    { icon: Wallet, label: "Total spent", value: formatGHS(spent) },
    { icon: Truck, label: "In progress", value: String(open.length) },
    { icon: Store, label: "Delivered / collected", value: String(done.length) },
  ];
  const latest = list[0];
  return (
    <div>
      <h1 className="type-page">{first ? `Welcome back, ${first}` : "Welcome back"}</h1>
      <p className="type-body mt-2 text-muted-foreground">Here's a quick look at your orders with Plants & Pure.</p>
      <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label} className="rounded-[1.25rem] border border-border bg-surface p-4 sm:p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sage text-olive"><s.icon className="h-4 w-4" /></span>
            <p className="type-sub mt-4 tabular-nums">{orders.isPending ? "–" : s.value}</p>
            <p className="type-small text-muted-foreground">{s.label}</p>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex items-center justify-between">
        <h2 className="type-sub">Latest order</h2>
        {list.length > 1 && <Link to="/account" search={{ tab: "orders" }} className="type-small font-semibold hover:text-brand">See all orders</Link>}
      </div>
      <div className="mt-4">
        {orders.isPending ? <Skeleton /> : orders.isError ? (
          <FormMessage tone="error">We couldn't load your orders right now.</FormMessage>
        ) : latest ? (
          <OrderCard o={latest} />
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-border p-10 text-center">
            <Package className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="type-body mt-3 text-muted-foreground">Your orders will appear here once you place your first one.</p>
            <Button asChild className="mt-5"><Link to="/shop">Start shopping</Link></Button>
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersTab({ orders }: { orders: ReturnType<typeof useQuery<Order[]>> }) {
  return (
    <div>
      <h1 className="type-page">My orders</h1>
      <div className="mt-8 space-y-3">
        {orders.isPending ? <Skeleton /> : orders.isError ? (
          <FormMessage tone="error">We couldn't load your orders right now.</FormMessage>
        ) : orders.data.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border p-10 text-center">
            <Package className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="type-body mt-3 text-muted-foreground">Your order history appears here once you place your first order.</p>
            <Button asChild className="mt-5"><Link to="/shop">Start shopping</Link></Button>
          </div>
        ) : (
          orders.data.map((o) => <OrderCard key={o.id} o={o} />)
        )}
      </div>
    </div>
  );
}

function useSaveProfile(userId: string) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (values: Record<string, string>) => {
    setError(null);
    setSaving(true);
    const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null]));
    const { error } = await getSupabase().from("profiles").update(clean).eq("id", userId);
    setSaving(false);
    if (error) return setError("We couldn't save your details. Please try again.");
    qc.invalidateQueries({ queryKey: ["my-profile"] });
    toast.success("Saved");
  };
  return { save, saving, error, setError };
}

const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={cn("block", className)}>
    <span className="type-label text-muted-foreground">{label}</span>
    <div className="mt-2">{children}</div>
  </label>
);

function ProfileForm({ userId, email, initial }: { userId: string; email: string; initial: Profile | null }) {
  const [f, setF] = useState({ first_name: initial?.first_name ?? "", last_name: initial?.last_name ?? "", phone: initial?.phone ?? "" });
  const { save, saving, error, setError } = useSaveProfile(userId);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.first_name.trim()) return setError("Please enter your first name.");
        if (f.phone && !/^[0-9+()\-\s]{6,32}$/.test(f.phone)) return setError("Enter a valid phone number.");
        void save(f);
      }}
      className="max-w-xl"
    >
      <h1 className="type-page">My details</h1>
      <p className="type-body mt-2 text-muted-foreground">Change your name and phone number.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Field label="First name"><input className={authInput} value={f.first_name} onChange={set("first_name")} maxLength={80} autoComplete="given-name" /></Field>
        <Field label="Last name"><input className={authInput} value={f.last_name} onChange={set("last_name")} maxLength={80} autoComplete="family-name" /></Field>
        <Field label="Phone" className="sm:col-span-2"><input className={authInput} type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
        <Field label="Email" className="sm:col-span-2"><input className={`${authInput} opacity-60`} value={email} disabled readOnly /></Field>
      </div>
      {error && <div className="mt-4"><FormMessage tone="error">{error}</FormMessage></div>}
      <Button type="submit" className="mt-6" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save changes</Button>
    </form>
  );
}

function AddressForm({ userId, initial }: { userId: string; initial: Profile | null }) {
  const [f, setF] = useState({ delivery_address: initial?.delivery_address ?? "", delivery_area: initial?.delivery_area ?? "" });
  const { save, saving, error } = useSaveProfile(userId);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(f);
      }}
      className="max-w-xl"
    >
      <h1 className="type-page">Delivery address</h1>
      <p className="type-body mt-2 text-muted-foreground">Save where you'd like your orders delivered.</p>
      <div className="mt-8 grid gap-4">
        <Field label="Address (house number, street, landmark)"><input className={authInput} value={f.delivery_address} onChange={set("delivery_address")} maxLength={500} autoComplete="street-address" /></Field>
        <Field label="Area / town"><input className={authInput} value={f.delivery_area} onChange={set("delivery_area")} maxLength={120} placeholder="e.g. East Legon" /></Field>
      </div>
      {error && <div className="mt-4"><FormMessage tone="error">{error}</FormMessage></div>}
      <Button type="submit" className="mt-6" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save address</Button>
    </form>
  );
}

function PasswordForm() {
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) return setMsg({ tone: "error", text: "Use at least 8 characters." });
    setSaving(true);
    const { error } = await getSupabase().auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return setMsg({ tone: "error", text: "We couldn't change your password. Please try again." });
    setPw("");
    setMsg({ tone: "success", text: "Password updated." });
  };
  return (
    <form onSubmit={save} className="max-w-xl">
      <h1 className="type-page">Password</h1>
      <p className="type-body mt-2 text-muted-foreground">Choose a new password. If you signed up with Google, this lets you also sign in with your email.</p>
      <div className="mt-8"><Field label="New password"><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field></div>
      {msg && <div className="mt-4"><FormMessage tone={msg.tone}>{msg.text}</FormMessage></div>}
      <Button type="submit" className="mt-6" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Change password</Button>
    </form>
  );
}
