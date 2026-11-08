import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import ProductCard from "@/components/ui/ProductCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { BUSINESS, CONTACT } from "@/lib/constants/business";
import { listCategories, listProducts } from "@/lib/catalogue/data";
import { shopHref } from "@/lib/catalogue/params";
import type { Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const SHOWN = 8;

/**
 * Home — "Specimen Index" direction. Composition (each block differs on purpose):
 *   hero (type-led, asymmetric, category index as the right-hand column)
 *   → fact ledger strip → collection (live catalogue) → story (the one dark ground)
 *   → commitments (ruled list, not cards) → contact.
 * All words are the company's published wording (src/lib/constants/business.ts).
 * Photography slots (hero plate, production-facility image) are documented in
 * docs/DESIGN_SYSTEM.md; the layout does not depend on them being present.
 */
export default async function HomePage() {
  const { story, commitments } = BUSINESS;

  // Real catalogue data only. A failure is shown as such; nothing is invented to fill the gap.
  let categories: Category[] = [];
  let products: Product[] = [];
  let total = 0;
  let failed = false;
  try {
    const [cats, list] = await Promise.all([listCategories(), listProducts({ sort: "featured", pageSize: SHOWN })]);
    categories = cats.filter((c) => c.productCount > 0);
    products = list.items;
    total = list.total;
  } catch {
    failed = true;
  }

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
           HERO — Cinematic Botanical Atelier
           ═══════════════════════════════════════════════════════════ */}
      <section aria-labelledby="hero-title" className="border-b border-border overflow-hidden relative">
        {/* Decorative botanical gradient orbs */}
        <div className="pointer-events-none absolute -left-[15%] top-[15%] h-[60vh] w-[60vh] rounded-full opacity-[0.07] blur-[80px]" style={{ background: "radial-gradient(circle, #183B2D 0%, transparent 70%)" }} aria-hidden="true" />
        <div className="pointer-events-none absolute -right-[8%] top-[40%] h-[40vh] w-[40vh] rounded-full opacity-[0.05] blur-[60px]" style={{ background: "radial-gradient(circle, #DDAA35 0%, transparent 70%)" }} aria-hidden="true" />

        <div className="container-page relative py-20 md:py-28 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow anim-hero-up delay-100">Plants &amp; Pure Limited &nbsp;·&nbsp; Accra, Ghana</p>
            <h1
              id="hero-title"
              className="anim-hero-up delay-200"
              style={{ fontFamily: "var(--font-newyork), Georgia, serif", fontSize: "clamp(2.75rem, 2rem + 5vw, 5.5rem)", letterSpacing: "-0.02em", fontWeight: 300, lineHeight: "1.05", color: "var(--p-forest)", marginTop: "1.5rem" }}
            >
              Bring <em style={{ fontStyle: "normal", color: "var(--p-saffron)" }}>nature</em>{" "}
              into your home.
            </h1>
            <p className="anim-hero-up delay-300 mt-6 max-w-xl mx-auto text-lead text-text-secondary" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
              {BUSINESS.descriptor.value} Premium spices, herbs and botanical oils from Accra, Ghana.
            </p>
            {/* CTA */}
            <div className="anim-hero-up delay-400 mt-10 flex flex-wrap items-center justify-center gap-4">
              <a
                href="/shop"
                className="inline-flex h-13 items-center gap-2.5 rounded-[12px] bg-action px-8 py-3.5 text-[0.9375rem] font-semibold text-text-inverse transition-all duration-150 hover:bg-action-hover hover:shadow-lg active:scale-95"
                style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
              >
                Shop the collection
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
              <a href="#index" className="inline-flex h-13 items-center gap-2 rounded-[12px] border border-border-strong px-7 py-3.5 text-[0.9375rem] font-semibold text-text transition-colors duration-150 hover:border-text hover:bg-surface active:scale-95" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
                Browse categories
              </a>
            </div>

            {/* Elegant divider with dots */}
            <div className="anim-hero-in delay-600 mt-16 flex items-center gap-4" aria-hidden="true">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-1.5 w-1.5 rounded-full bg-accent opacity-50" />
                ))}
              </div>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
            </div>
          </div>
        </div>
      </section>

          <nav id="index" aria-labelledby="index-title" className="lg:col-span-5 lg:pt-3">
            <p id="index-title" className="eyebrow flex items-center gap-3 text-text-muted">
              <span>Index</span>
              <span aria-hidden="true" className="h-px flex-1 bg-border-strong" />
            </p>
            {categories.length > 0 ? (
              <ol className="mt-2 divide-y divide-border border-b border-border">
                {categories.map((c, i) => (
                  <li key={c.id}>
                    <Link href={shopHref({ category: c.slug })} className="group grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-3 py-5 transition-colors hover:bg-background-alt md:px-2">
                      <span className="numeral eyebrow text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <span>
                        <span className="block font-display text-h3">{c.name}</span>
                        <span className="mt-1 block text-small text-text-secondary numeral">
                          {c.productCount} {c.productCount === 1 ? "product" : "products"}
                        </span>
                      </span>
                      <ArrowUpRight className="size-5 translate-y-1 text-text-muted transition-transform duration-(--duration-base) ease-(--ease-settle) group-hover:-translate-y-0 group-hover:translate-x-0.5 group-hover:text-text" strokeWidth={1.5} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 max-w-xs text-text-secondary">
                {failed ? "Categories can’t be loaded right now." : "Our online categories will appear here once products are published."}
              </p>
            )}
          </nav>
        </div>

        {/* fact ledger */}
        <div className="container-page">
        <dl className="grid grid-cols-1 border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
          {[
            ["Founded", String(BUSINESS.foundedYear.value)],
            ["Based in", CONTACT.location],
            ["Open", CONTACT.hours],
          ].map(([k, v]) => (
            <div key={k} className="py-5 sm:px-6 sm:first:pl-0">
              <dt className="eyebrow text-text-muted">{k}</dt>
              <dd className="mt-1 font-display text-h3">{v}</dd>
            </div>
          ))}
        </dl>
        </div>
      </section>

      {/* ---------------------------------------------------------- COLLECTION */}
      <section aria-labelledby="collection-title" className="section-space">
        <div className="container-page">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading index="01" eyebrow="The collection" title={<span id="collection-title">Shop the range</span>} />
            <ButtonLink href="/shop" variant="secondary">
              All products
            </ButtonLink>
          </Reveal>
          <div className="mt-12">
            {failed ? (
              <EmptyState title="We can’t load the collection right now" tone="error" action={<ButtonLink href="/shop" variant="secondary">Try the shop page</ButtonLink>}>
                <p>Please refresh in a moment, or contact us on {CONTACT.primaryPhone}.</p>
              </EmptyState>
            ) : products.length === 0 ? (
              <EmptyState title="The collection is being prepared" action={<ButtonLink href={`mailto:${CONTACT.email}`} variant="secondary">Email us</ButtonLink>}>
                <p>Our online catalogue is not published yet. Contact us on {CONTACT.primaryPhone} to ask about spices, herbs and oils.</p>
              </EmptyState>
            ) : (
              <>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4">
                  {products.map((p, i) => (
                    <li key={p.id}>
                      <ProductCard product={p} priority={i < 4} />
                    </li>
                  ))}
                </ul>
                {total > SHOWN && (
                  <p className="mt-12">
                    <Link href="/shop" className="font-semibold underline underline-offset-4">
                      View all {total} products
                    </Link>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- STORY */}
      <section data-surface="inverse" aria-labelledby="story-title" className="section-space bg-inverse text-text-inverse">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-5">
            <SectionHeading inverse index="02" eyebrow="Our story" title={<span id="story-title">Wholesome, natural products</span>} />
          </Reveal>
          <Reveal delay={120} className="lg:col-span-6 lg:col-start-7">
            <p className="font-display text-h3 leading-snug">{story.origin}</p>
            <div className="mt-10 border-t border-text-inverse-muted/30 pt-6">
              <p className="eyebrow text-text-inverse-muted">Our mission</p>
              <ul className="mt-4 space-y-4 text-lead text-text-inverse-muted">
                {story.mission.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------------------- COMMITMENTS */}
      <section aria-labelledby="commitments-title" className="section-space">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-4">
            <SectionHeading index="03" eyebrow="Commitments" title={<span id="commitments-title">What we stand for</span>} lead="In the company’s own words." />
          </Reveal>
          <Reveal delay={100} className="lg:col-span-7 lg:col-start-6">
            <ol className="divide-y divide-border border-y border-border">
              {commitments.map((c, i) => (
                <li key={c} className="grid grid-cols-[3rem_1fr] items-baseline gap-4 py-5">
                  <span className="numeral eyebrow text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-display text-h3">{c}</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ ORDERING */}
      <section aria-labelledby="ordering-title" className="section-space-sm border-t border-border">
        <div className="container-page">
          <Reveal>
            <SectionHeading index="04" eyebrow="How ordering works" title={<span id="ordering-title">From cart to doorstep, in the open</span>} />
          </Reveal>
          <Reveal delay={100}>
            <ol className="mt-10 grid gap-8 border-t border-border pt-8 md:grid-cols-3 md:gap-10">
              {[
                ["Choose", "Add products to your cart. Prices are in Ghana cedis (GH₵) and are checked again by our server when you pay."],
                ["Delivery", "Delivery options and fees are shown at checkout, before you pay. Nothing is added afterwards."],
                ["Pay securely", "You pay on Paystack’s own page. We never see or store your card or mobile-money details."],
              ].map(([t, d], i) => (
                <li key={t}>
                  <p className="numeral eyebrow text-text-muted">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 text-h3">{t}</h3>
                  <p className="mt-3 text-text-secondary">{d}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------- CONTACT */}
      <section aria-labelledby="contact-title" className="section-space-sm bg-background-alt">
        <Reveal className="container-page flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <SectionHeading index="05" eyebrow="Talk to us" title={<span id="contact-title">Questions about a product or an order?</span>} lead={`We’re available ${CONTACT.hours}.`} />
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={`tel:${CONTACT.primaryTel}`} variant="primary" size="lg">
              Call {CONTACT.primaryPhone}
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="lg">
              Contact us
            </ButtonLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
