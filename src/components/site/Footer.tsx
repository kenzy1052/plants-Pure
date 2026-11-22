import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Facebook, Instagram } from "lucide-react";
import { BUSINESS, CONTACT } from "@/lib/business";
import { testimonialsQuery, testimonialsVisible } from "@/lib/testimonials";
import { Logo } from "./Logo";
import { SubscribeForm } from "./SubscribeForm";
import "./growth.css";

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.6 6.7a5.6 5.6 0 0 1-3.4-1.9 5.6 5.6 0 0 1-1.3-3.1h-3.4v13.4a2.8 2.8 0 1 1-2-2.7V9.1a6.2 6.2 0 1 0 5.4 6.1V9.4a9 9 0 0 0 4.7 1.5V7.5a5.6 5.6 0 0 1-.1-.8z" />
    </svg>
  );
}

const SOCIALS = [
  { href: CONTACT.tiktok, label: "TikTok", handle: CONTACT.tiktokHandle, icon: <TiktokIcon className="h-5 w-5" /> },
  { href: CONTACT.instagram, label: "Instagram", handle: CONTACT.instagramHandle, icon: <Instagram className="h-5 w-5" /> },
  { href: CONTACT.facebook, label: "Facebook", handle: "Plants & Pure", icon: <Facebook className="h-5 w-5" /> },
  { href: CONTACT.linkedin, label: "LinkedIn", handle: "Plants & Pure Limited", icon: <LinkedinIcon className="h-5 w-5" /> },
] as const;

export function Footer() {
  const reviews = useQuery(testimonialsQuery());
  const showReviews = testimonialsVisible(reviews.data);

  return (
    <footer className="mt-24 bg-night text-night-foreground">
      <div className="container-page grid gap-12 pt-16 pb-14 sm:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Logo className="h-24" />
          <p className="type-small mt-4 max-w-xs text-night-muted">{BUSINESS.descriptor}</p>
          <ul className="type-small mt-6 space-y-2.5 text-night-foreground/90">
            <li>{CONTACT.location} · {CONTACT.hours}</li>
            <li><a href={`mailto:${CONTACT.email}`} className="link-line">{CONTACT.email}</a></li>
            {CONTACT.phones.map((p) => (
              <li key={p.tel}><a href={`tel:${p.tel}`} className="link-line">{p.label}</a></li>
            ))}
          </ul>
        </div>

        <nav aria-label="Shop" className="lg:col-span-2">
          <p className="type-label text-lime">Shop</p>
          <ul className="type-small mt-4 space-y-2.5">
            <li><Link to="/shop" className="link-line">All products</Link></li>
            <li><Link to="/shop" search={{ category: "culinary-spices" }} className="link-line">Spices</Link></li>
            <li><Link to="/shop" search={{ category: "herbal-infusions" }} className="link-line">Herbs</Link></li>
            <li><Link to="/shop" search={{ category: "pure-botanical-oils" }} className="link-line">Natural oils</Link></li>
          </ul>
        </nav>

        <nav aria-label="Help" className="lg:col-span-2">
          <p className="type-label text-lime">Help</p>
          <ul className="type-small mt-4 space-y-2.5">
            <li><Link to="/track" className="link-line">Track an order</Link></li>
            <li><Link to="/account" className="link-line">My account</Link></li>
            <li><Link to="/contact" className="link-line">Contact us</Link></li>
            <li><Link to="/about" className="link-line">Our story</Link></li>
            {showReviews && <li><Link to="/testimonials" className="link-line">Customer reviews</Link></li>}
            <li><Link to="/" hash="stockists" className="link-line">Find us in store</Link></li>
          </ul>
        </nav>

        <div className="lg:col-span-4">
          <p className="type-label text-lime">Follow the story</p>
          <p className="type-small mt-3 max-w-xs text-night-muted">
            Be a part of our growing family, and help our business by liking, sharing and subscribing to all our social media handles.
          </p>
          <ul className="mt-5 flex flex-nowrap items-center gap-3">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noreferrer noopener" className="social-circle" aria-label={`${s.label}: ${s.handle}`} title={s.label}>
                  {s.icon}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Join the circle */}
      <div id="subscribe" className="container-page scroll-mt-28 pb-14">
        <div className="subscribe-card grid items-center gap-8 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <p className="type-label text-lime">Join the Plants &amp; Pure circle</p>
            <h2 className="type-section mt-3 text-white">Be the first to know.</h2>
            <p className="type-body mt-3 max-w-md text-white/85">Fresh batches, new ranges (cereals are coming!), kitchen tips and members-only offers, sent to your inbox only when it's worth your time.</p>
          </div>
          <div className="lg:col-span-6">
            <SubscribeForm />
            <p className="type-small mt-3 text-white/75">No spam, ever. Unsubscribe with one click.</p>
          </div>
        </div>
      </div>

      <div className="border-t border-night-border">
        <div className="container-page flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-small text-night-muted">© {BUSINESS.foundedYear}–{new Date().getFullYear()} {BUSINESS.legalName}. All rights reserved.</p>
          <p className="type-small text-night-muted">Prices in Ghana cedis (GH₵)</p>
        </div>
      </div>
    </footer>
  );
}
