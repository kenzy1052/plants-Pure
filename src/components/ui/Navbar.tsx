"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, Search, ShoppingBag } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useCartStore } from "@/context/cart-store";
import { CONTACT } from "@/lib/constants/business";
import { cn } from "@/lib/utils";

/**
 * Foodo-inspired Navigation Bar
 *
 * Design: transparent pill/floating container with backdrop blur.
 * Links use .nav-link class for animated underline on hover/active.
 * Logo left · nav center · icons right — desktop.
 * Logo left · hamburger right — mobile.
 */
const NAV = [
  { href: "/",        label: "Home" },
  { href: "/about",   label: "Our Story" },
  { href: "/shop",    label: "Shop" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const openCart = useCartStore((s) => s.openCart);
  const count = items.reduce((n, i) => n + i.quantity, 0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [bump, setBump] = useState(false);
  const first = useRef(true);

  // Close panels on navigation (adjusting state during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
    setSearchOpen(false);
  }

  // Brief feedback when the cart count actually changes.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setBump(true);
    const t = setTimeout(() => setBump(false), 260);
    return () => clearTimeout(t);
  }, [count]);

  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => searchRef.current?.focus());
  }, [searchOpen]);

  const icon    = "size-[1.1rem]";
  const iconBtn = "relative grid place-items-center w-9 h-9 rounded-[9px] text-text transition-all duration-150 hover:bg-surface-hover active:scale-95";

  return (
    <>
      {/* ── Foodo-style floating pill header ─────────────────────────── */}
      <header className="sticky top-0 z-[var(--z-header)]">
        <div className="container-page py-2.5">
          <div className="relative flex items-center gap-2 rounded-[40px] border border-border/70 bg-background/80 px-4 py-1.5 backdrop-blur-md shadow-sm">

            {/* Mobile hamburger */}
            <button
              type="button"
              className={cn(iconBtn, "md:hidden")}
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
            >
              <Menu className={icon} strokeWidth={1.75} aria-hidden="true" />
            </button>

            {/* Wordmark — left */}
            <Link href="/" className="shrink-0 rounded-[28px] py-0.5" aria-label="Plants &amp; Pure — home">
              <span className="font-display text-[1.25rem] leading-none tracking-tight text-text">
                Plants&nbsp;<em className="not-italic text-accent">&amp;</em>&nbsp;Pure
              </span>
            </Link>

            {/* Desktop nav — center */}
            <nav aria-label="Primary" className="hidden flex-1 md:flex justify-center">
              <ul className="flex items-center gap-0.5">
                {NAV.map((l) => {
                  const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href + "/"));
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={active ? "page" : undefined}
                        className={cn("nav-link px-3.5 py-2 rounded-[20px] text-[0.875rem]", active && "text-accent")}
                      >
                        {l.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Right icons */}
            <div className="ml-auto flex items-center gap-0.5">
              <button type="button" className={iconBtn} onClick={() => setSearchOpen(true)} aria-label="Search products" aria-haspopup="dialog">
                <Search className={icon} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <ThemeToggle />
              <AccountMenu />
              <button type="button" className={iconBtn} onClick={openCart} aria-label={`Open cart, ${count} ${count === 1 ? "item" : "items"}`} aria-haspopup="dialog">
                <ShoppingBag className={icon} strokeWidth={1.75} aria-hidden="true" />
                {count > 0 && (
                  <span aria-hidden="true" className={cn("absolute -top-0.5 -right-0.5 grid min-w-[1.125rem] h-5 place-items-center rounded-pill bg-accent px-1 text-[0.625rem] font-bold leading-none text-text tracking-wide", bump && "anim-bump")}>
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile menu ─────────────────────────────────────────────── */}
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" side="left">
        <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-(--gutter) py-6">
          <ul className="divide-y divide-border border-y border-border">
            {NAV.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex min-h-14 items-center font-display text-h3">{l.label}</Link>
              </li>
            ))}
            <li><Link href="/account" className="flex min-h-14 items-center font-display text-h3">Account</Link></li>
          </ul>
          <div className="mt-8 space-y-1 text-small text-text-secondary">
            <p className="eyebrow text-text-muted">Contact</p>
            <p><a className="underline underline-offset-4" href={`tel:${CONTACT.primaryTel}`}>{CONTACT.primaryPhone}</a></p>
            <p><a className="underline underline-offset-4" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></p>
            <p>{CONTACT.hours}</p>
          </div>
        </nav>
      </Drawer>

      {/* ── Search sheet ────────────────────────────────────────────── */}
      <Drawer open={searchOpen} onClose={() => setSearchOpen(false)} title="Search" side="top">
        <form
          role="search"
          action="/shop"
          method="get"
          className="container-page flex w-full flex-col gap-3 py-6 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
            setSearchOpen(false);
            router.push(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop");
          }}
        >
          <label htmlFor="site-search" className="sr-only">Search products</label>
          <input
            id="site-search"
            ref={searchRef}
            name="q"
            type="search"
            placeholder="Search spices, herbs, oils…"
            autoComplete="off"
            className="form-control form-control-input flex-1"
            maxLength={80}
          />
          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-[10px] bg-action px-6 font-semibold text-text-inverse hover:bg-action-hover transition-colors duration-150 whitespace-nowrap">
            Search
          </button>
        </form>
      </Drawer>
    </>
  );
}
