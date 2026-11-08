import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { categoriesQuery } from "@/lib/catalogue";
import { cartCount, useCart } from "@/lib/cart-store";
import { usePageTitle } from "@/lib/page-title";
import { useAuth } from "@/lib/auth";
import { isStaffRole, myProfileQuery } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { ScrollProgress } from "./ScrollProgress";
import { ThemeToggle } from "./ThemeToggle";
import { SearchDialog } from "@/components/shop/SearchDialog";

function IconButton({ label, onClick, children, badge }: { label: string; onClick?: () => void; children: React.ReactNode; badge?: number }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-container">
      {children}
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-gradient px-1 text-[10px] font-semibold text-pepper-foreground tabular-nums">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const pageTitle = usePageTitle((s) => s.title);
  const pageSubtitle = usePageTitle((s) => s.subtitle);
  const lines = useCart((s) => s.lines);
  const openCart = useCart((s) => s.open);
  const { user } = useAuth();
  const me = useQuery(myProfileQuery(user?.id));
  const staff = isStaffRole(me.data?.role);
  const { data: categories } = useQuery(categoriesQuery());
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [count, setCount] = useState(0);
  useEffect(() => setCount(cartCount(lines)), [lines]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    setMenuOpen(false);
    setShopOpen(false);
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navLink = "type-nav link-line py-2 font-semibold text-foreground/85 transition-colors hover:text-foreground data-[status=active]:text-foreground";

  return (
    <>
      <header className={cn("fixed inset-x-0 top-0 z-50 transition-shadow duration-300", scrolled && "shadow-soft")}>
        <div className={cn("relative border-b border-border backdrop-blur-xl transition-colors duration-500", scrolled ? "bg-background/85" : "bg-background")}>
          <nav
            aria-label="Main"
            className="container-page relative flex h-[4.5rem] items-center justify-between gap-4"
            style={{ "--g": "clamp(1rem, 0.4rem + 2.6vw, 3rem)" } as React.CSSProperties}
          >
            {/* Page title (product name) that takes over the left side of the bar once the page heading scrolls away */}
            <div
              aria-hidden={!pageTitle}
              className={cn(
                "absolute inset-y-0 left-[var(--g)] right-[calc(var(--g)_+_8.75rem)] flex items-center gap-2 transition-all duration-300 ease-[var(--ease-settle)] sm:right-[calc(var(--g)_+_13.75rem)] lg:right-[calc(var(--g)_+_11.5rem)]",
                pageTitle ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
              )}
            >
              <Link to="/shop" aria-label="Back to the shop" tabIndex={pageTitle ? 0 : -1} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-container">
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <p className="truncate font-display text-lg leading-tight">{pageTitle}</p>
                {pageSubtitle && <p className="type-small truncate leading-tight text-muted-foreground">{pageSubtitle}</p>}
              </div>
            </div>

            <Link to="/" aria-label="Plants & Pure home" tabIndex={pageTitle ? -1 : 0} className={cn("shrink-0 transition-all duration-300 ease-[var(--ease-settle)]", pageTitle && "pointer-events-none -translate-y-3 opacity-0")}>
              <Logo priority className="h-[3.1rem] transition-transform duration-500 ease-[var(--ease-settle)] hover:scale-105" />
            </Link>

            <ul className={cn("hidden items-center gap-8 transition-all duration-300 ease-[var(--ease-settle)] lg:flex", pageTitle && "pointer-events-none -translate-y-3 opacity-0")}>
              <li>
                <Link to="/" activeOptions={{ exact: true }} className={navLink}>
                  Home
                </Link>
              </li>
              <li className="relative" onMouseEnter={() => setShopOpen(true)} onMouseLeave={() => setShopOpen(false)}>
                <div className="flex items-center gap-1">
                  <Link to="/shop" className={navLink} activeOptions={{ exact: false }}>
                    Shop
                  </Link>
                  <button type="button" aria-label="Show categories" aria-expanded={shopOpen} onClick={() => setShopOpen((v) => !v)} className="rounded-full p-1 text-foreground/70 hover:text-foreground">
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", shopOpen && "rotate-180")} />
                  </button>
                </div>
                <div
                  className={cn(
                    "absolute left-1/2 top-full w-72 -translate-x-1/2 pt-4 transition-all duration-300 ease-[var(--ease-settle)]",
                    shopOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
                  )}
                >
                  <div className="rounded-3xl border border-border bg-popover p-2 shadow-lift">
                    <Link to="/shop" className="flex items-center justify-between rounded-2xl px-4 py-3 hover:bg-container">
                      <span className="type-small font-medium">All products</span>
                    </Link>
                    {categories?.map((c) => (
                      <Link key={c.id} to="/shop" search={{ category: c.slug }} className="flex items-center justify-between rounded-2xl px-4 py-3 hover:bg-container">
                        <span className="type-small">{c.name}</span>
                        <span className="type-label text-muted-foreground">{c.productCount}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </li>
              <li>
                <Link to="/about" className={navLink}>
                  Our story
                </Link>
              </li>
              <li>
                <Link to="/track" className={navLink}>
                  Track order
                </Link>
              </li>
              <li>
                <Link to="/contact" className={navLink}>
                  Contact
                </Link>
              </li>
            </ul>

            <div className="flex items-center gap-0.5">
              <IconButton label="Search products" onClick={() => setSearchOpen(true)}>
                <Search className="h-[18px] w-[18px]" />
              </IconButton>
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              <Link
                to={user ? (staff ? "/admin" : "/account") : "/auth/sign-in"}
                aria-label={user ? (staff ? "Admin" : "My account") : "Sign in"}
                className="hidden h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-container sm:inline-flex"
              >
                <User className="h-[18px] w-[18px]" />
              </Link>
              <IconButton label={`Open cart, ${count} items`} onClick={openCart} badge={count}>
                <ShoppingBag className="h-[18px] w-[18px]" />
              </IconButton>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-container text-foreground lg:hidden"
              >
                {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </nav>
          <ScrollProgress />
        </div>
      </header>

      {/* Mobile menu */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-night text-night-foreground transition-[clip-path] duration-700 ease-[var(--ease-swift)] lg:hidden",
          menuOpen ? "[clip-path:inset(0_0_0_0)]" : "pointer-events-none [clip-path:inset(0_0_100%_0)]",
        )}
        aria-hidden={!menuOpen}
      >
        <div className="container-page flex h-full flex-col pb-10 pt-32">
          <ul className="flex flex-col">
            {[
              { to: "/", label: "Home" },
              { to: "/shop", label: "Shop all" },
              { to: "/about", label: "Our story" },
              { to: "/track", label: "Track order" },
              { to: "/contact", label: "Contact" },
              { to: user ? (staff ? "/admin" : "/account") : "/auth/sign-in", label: user ? (staff ? "Admin" : "My account") : "Sign in" },
            ].map((l, i) => (
              <li key={l.to} className="border-b border-night-border">
                <Link
                  to={l.to}
                  tabIndex={menuOpen ? 0 : -1}
                  className="block py-5 font-display text-4xl tracking-tight transition-transform duration-700"
                  style={{ transitionDelay: `${menuOpen ? 120 + i * 60 : 0}ms`, transform: menuOpen ? "none" : "translateY(20px)" }}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          {categories && categories.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">
              {categories.map((c) => (
                <Link key={c.id} to="/shop" search={{ category: c.slug }} tabIndex={menuOpen ? 0 : -1} className="type-small rounded-full bg-night-2 px-4 py-2 text-night-foreground ring-1 ring-night-border">
                  {c.name}
                </Link>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center justify-between">
            <span className="type-label text-night-muted">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
