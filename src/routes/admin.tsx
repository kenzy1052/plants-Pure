import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { ArrowUpRight, Loader2, LayoutDashboard, Package, ShoppingBag, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { isStaffRole, myProfileQuery } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { OverviewPanel } from "@/components/admin/OverviewPanel";
import { OrdersPanel } from "@/components/admin/OrdersPanel";
import { ProductsPanel } from "@/components/admin/ProductsPanel";
import { ProductEditor } from "@/components/admin/ProductEditor";

export const Route = createFileRoute("/admin")({
  validateSearch: (s) =>
    z.object({ tab: z.enum(["overview", "orders", "products"]).optional().catch(undefined), p: z.string().max(60).optional().catch(undefined) }).parse(s),
  head: () => ({ meta: [{ title: "Admin | Plants & Pure" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Admin,
});

function Admin() {
  const { user, loading } = useAuth();
  const { tab: tabParam, p } = Route.useSearch();
  const navigate = useNavigate();
  const me = useQuery(myProfileQuery(user?.id));

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth/sign-in", search: { next: "/admin" }, replace: true });
  }, [loading, user, navigate]);

  if (loading || !user || me.isPending) {
    return <div className="flex min-h-[70vh] items-center justify-center pt-28"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  const role = me.data?.role;
  if (!isStaffRole(role)) {
    return (
      <div className="container-page flex min-h-[70vh] flex-col items-center justify-center pt-28 text-center">
        <h1 className="type-section">This area is for the Plants & Pure team</h1>
        <p className="type-body mt-3 max-w-md text-muted-foreground">Your account ({user.email}) doesn't have admin access. If it should, the owner can change the role in the database.</p>
        <Button asChild className="mt-6"><Link to="/account">Go to my account</Link></Button>
      </div>
    );
  }
  const isAdmin = role === "admin";
  const tab = isAdmin ? (tabParam ?? "overview") : "orders"; // dispatch staff only handle orders

  const tabs = [
    { key: "overview", label: "Dashboard", icon: LayoutDashboard, show: true },
    { key: "orders", label: "Orders", icon: Package, show: true },
    { key: "products", label: "Products", icon: ShoppingBag, show: isAdmin },
  ] as const;

  return (
    <div className="container-page pb-24 pt-[8.5rem] sm:pt-40">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <aside className="lg:col-span-3">
          <div className="lg:sticky lg:top-32">
            <p className="type-label text-muted-foreground">{isAdmin ? "Admin" : "Dispatch"}</p>
            <p className="type-small mt-1 truncate text-muted-foreground">{user.email}</p>
            <nav aria-label="Admin sections" className="-mx-1 mt-5 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {tabs.filter((t) => t.show).map((t) => (
                <Link key={t.key} to="/admin" search={{ tab: t.key }} aria-current={tab === t.key ? "page" : undefined} className={cn("type-small inline-flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 font-medium transition-colors lg:rounded-2xl", tab === t.key ? "bg-foreground text-background" : "text-foreground/80 hover:bg-container")}>
                  <t.icon className="h-4 w-4" /> {t.label}
                </Link>
              ))}
              <Link to="/shop" className="type-small inline-flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 font-medium text-foreground/80 hover:bg-container lg:mt-2 lg:rounded-2xl"><ArrowUpRight className="h-4 w-4" /> View shop</Link>
              <Link to="/account" className="type-small inline-flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 font-medium text-foreground/80 hover:bg-container lg:rounded-2xl"><UserRound className="h-4 w-4" /> My account</Link>
            </nav>
          </div>
        </aside>
        <section className="min-w-0 lg:col-span-9">
          {tab === "overview" && <OverviewPanel isAdmin={isAdmin} />}
          {tab === "orders" && <OrdersPanel />}
          {tab === "products" && (p ? <ProductEditor key={p} id={p} /> : <ProductsPanel />)}
        </section>
      </div>
    </div>
  );
}
