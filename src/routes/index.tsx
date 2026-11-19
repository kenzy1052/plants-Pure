import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { ImmersiveHero } from "@/components/site/ImmersiveHero";
import { Reveal } from "@/components/site/Reveal";
import { Parallax } from "@/components/site/Parallax";
import { ProductCard } from "@/components/shop/ProductCard";
import { RangeShowcase } from "@/components/site/RangeShowcase";
import { JourneyTimeline } from "@/components/site/JourneyTimeline";
import { Testimonials } from "@/components/site/Testimonials";
import { Button } from "@/components/ui/button";
import { productsQuery } from "@/lib/catalogue";
import { BUSINESS, CONTACT } from "@/lib/business";
import { PHOTO, STUDIO_RANGE } from "@/assets/company";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plants & Pure — Quality spices, herbs and oils from Accra, Ghana" },
      { name: "description", content: "Quality spices, herbs and oils from Plants & Pure Limited, Accra — healthy living on the go. Shop online and pay securely in Ghana cedis." },
      { property: "og:title", content: "Plants & Pure — Quality spices, herbs and oils" },
      { property: "og:description", content: "Wholesome, natural spices, herbs and oils from Accra, Ghana — healthy living on the go." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.plantsandpure.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Plants & Pure Limited",
          url: "https://www.plantsandpure.com",
          foundingDate: "2020",
          email: "plantsandpure@gmail.com",
          telephone: "+233596083867",
          address: { "@type": "PostalAddress", addressLocality: "Accra", addressCountry: "GH" },
          sameAs: [CONTACT.instagram, CONTACT.facebook, CONTACT.tiktok],
        }),
      },
    ],
  }),
  component: Home,
});

function SectionHead({ title, kicker, action }: { title: string; kicker?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <Reveal>
        {kicker && <p className="type-small font-semibold text-brand">{kicker}</p>}
        <h2 className="type-section mt-2 max-w-2xl">{title}</h2>
      </Reveal>
      {action && <Reveal delay={120}>{action}</Reveal>}
    </div>
  );
}

function Home() {
  const [tab, setTab] = useState<string>("");
  const products = useQuery({ ...productsQuery({ pageSize: 8, category: tab || undefined }), placeholderData: (prev) => prev });

  return (
    <>
      <ImmersiveHero />

      {/* Shop by range */}
      <section className="container-page pt-10 sm:pt-16">
        <SectionHead
          kicker="Shop by range"
          title="Spices, herbs and oils, with cereals on the way."
          action={
            <Link to="/shop" className="type-small inline-flex items-center gap-1 font-semibold hover:text-brand">
              All products <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <div className="mt-10">
          <RangeShowcase />
        </div>
      </section>

      {/* E-commerce: the shop on the home page */}
      <section id="shop" className="container-page scroll-mt-28 pt-20 sm:pt-28">
        <SectionHead
          kicker="Shop online"
          title="Add to your kitchen in a few taps."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/shop">View all products</Link>
            </Button>
          }
        />

        <Reveal delay={80} className="mt-8 flex gap-2 overflow-x-auto pb-1 rail" role="tablist" aria-label="Filter products by range">
          {[{ slug: "", name: "All" }, ...BUSINESS.publishedCategories.map((c) => ({ slug: c.dbSlug, name: c.name }))].map((t) => (
            <button
              key={t.slug || "all"}
              type="button"
              role="tab"
              aria-selected={tab === t.slug}
              onClick={() => setTab(t.slug)}
              className={cn(
                "type-small shrink-0 rounded-full px-5 py-2.5 font-medium transition-[background-color,color,box-shadow] duration-300",
                tab === t.slug ? "bg-brand-gradient text-pepper-foreground shadow-[0_12px_28px_-14px_var(--color-pepper)]" : "bg-container text-foreground hover:bg-sage-strong",
              )}
            >
              {t.name}
            </button>
          ))}
        </Reveal>

        <div className="mt-8" aria-live="polite">
          {products.isPending ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-[1.5rem] border border-border bg-surface">
                  <div className="aspect-square animate-pulse bg-container" />
                  <div className="space-y-2 p-4">
                    <div className="h-4 w-2/3 animate-pulse rounded-full bg-container" />
                    <div className="h-4 w-1/3 animate-pulse rounded-full bg-container" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.isError ? (
            <p className="type-body rounded-[1.5rem] bg-container p-10 text-center text-muted-foreground">We couldn't load products right now. Please refresh the page.</p>
          ) : products.data.items.length === 0 ? (
            <div className="rounded-[1.5rem] bg-sage p-12 text-center">
              <h3 className="type-sub">{tab ? "Nothing in this range yet" : "New products are on their way"}</h3>
              <p className="type-body mx-auto mt-3 max-w-md text-muted-foreground">Our shelves are being stocked. Check back soon, or contact us to order directly.</p>
              <Button asChild className="mt-6">
                <Link to="/contact">Contact us</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {products.data.items.map((p, i) => (
                <Reveal key={p.id} delay={(i % 4) * 80} variant="scale">
                  <ProductCard product={p} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Studio range: endless loop, no background panel */}
      <section className="pt-20 sm:pt-28">
        <div className="container-page">
          <SectionHead
            kicker="The range"
            title="Every bottle, shot in the studio."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/shop">
                  Shop the range <ArrowRight />
                </Link>
              </Button>
            }
          />
        </div>
        <div className="loop-viewport mt-10" aria-label="Plants & Pure product range" style={{ "--loop-duration": `${STUDIO_RANGE.length * 6}s` } as React.CSSProperties}>
          <div className="loop-track">
            {[1, 2].flatMap((copy) =>
              STUDIO_RANGE.map((item) => (
                <Link
                  key={`${copy}-${item.name}`}
                  to="/shop"
                  search={{ q: item.search }}
                  data-loop-copy={copy}
                  aria-hidden={copy === 2 ? true : undefined}
                  tabIndex={copy === 2 ? -1 : undefined}
                  aria-label={copy === 1 ? `Shop ${item.name}` : undefined}
                  className="group relative w-[13.5rem] shrink-0 sm:w-[16rem]"
                >
                  <div className="relative aspect-[3/4] overflow-hidden rounded-[1.25rem] bg-night transition-[box-shadow,transform] duration-500 ease-[var(--ease-settle)] group-hover:-translate-y-1.5 group-hover:shadow-lift">
                    <img src={item.src} alt={copy === 1 ? `${item.name} by Plants & Pure` : ""} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-settle)] group-hover:scale-105" />
                  </div>
                  <p className="type-small mt-3 font-medium">{item.name}</p>
                </Link>
              )),
            )}
          </div>
        </div>
      </section>

      {/* Pouches & bottles */}
      <section className="container-page pt-20 sm:pt-28">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <Reveal variant="left" className="lg:col-span-6">
            <div className="relative">
              <Parallax speed={0.04}>
                <img src={PHOTO.pouchesStudio} alt="Plants & Pure spice pouches and a wooden scoop of herbs in a studio" width={1080} height={720} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-[2rem] object-cover shadow-lift" />
              </Parallax>
              <Parallax speed={-0.07} className="absolute -bottom-8 -right-3 w-[42%] sm:-right-6">
                <img src={PHOTO.pouchesScoop} alt="Plants & Pure spice pouches with a wooden scoop and whole cloves" width={1080} height={720} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-[1.25rem] object-cover ring-[6px] ring-background shadow-lift" />
              </Parallax>
            </div>
          </Reveal>
          <Reveal variant="right" className="lg:col-span-6 lg:pl-6">
            <p className="type-small font-semibold text-brand">Two ways to buy</p>
            <h2 className="type-section mt-2">Pouches for the pantry. Bottles for the table.</h2>
            <p className="type-body mt-5 max-w-lg text-muted-foreground">
              Our spices come in pouches and in shaker bottles. Choose the pack that suits the way you cook.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-border bg-surface p-5">
                <p className="type-sub">Pouches</p>
                <p className="type-small mt-2 text-muted-foreground">A pantry-friendly pack for everyday cooking.</p>
              </div>
              <div className="rounded-[1.25rem] border border-border bg-surface p-5">
                <p className="type-sub">Shaker bottles</p>
                <p className="type-small mt-2 text-muted-foreground">Season straight from the bottle, at the stove or the table.</p>
              </div>
            </div>
            <Button asChild variant="pepper" size="lg" className="mt-8">
              <Link to="/shop">
                Browse every pack <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* Values — EATHI */}
      <section className="container-page pt-24 sm:pt-32">
        <SectionHead kicker="What guides us" title="Five values, one standard: EATHI." />
        <ul className="mt-10 grid gap-px overflow-hidden rounded-[1.75rem] border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {BUSINESS.values.map((v, i) => (
            <Reveal as="li" key={v.name} delay={i * 90} className="group bg-surface p-6 transition-colors duration-500 hover:bg-sage lg:p-7">
              <span className="font-display text-6xl leading-none text-brand-gradient">{v.letter}</span>
              <h3 className="type-sub mt-6">{v.name}</h3>
              <p className="type-small mt-3 text-muted-foreground">{v.body}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Story */}
      <section className="pt-24 sm:pt-32">
        <div className="w-full bg-brand-gradient text-pepper-foreground">
          <div className="container-page grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2 lg:gap-16">
            <Reveal className="relative">
              <img src={PHOTO.flatlayPouches} alt="Plants & Pure pouches of rosemary, garlic and cinnamon with whole spices" width={1080} height={720} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-[1.5rem] object-cover shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)]" />
            </Reveal>
            <Reveal delay={120}>
              <p className="type-small font-semibold text-lime">Since {BUSINESS.foundedLabel}</p>
              <h2 className="type-section mt-2">A dream to make life a little more beautiful and healthy.</h2>
              <p className="type-body mt-5 max-w-lg text-pepper-foreground/85">{BUSINESS.story.origin}</p>
              <p className="type-body mt-3 max-w-lg text-pepper-foreground/85">{BUSINESS.story.paragraphs[1]}</p>
              <Button asChild variant="inverse" size="lg" className="mt-8">
                <Link to="/about">
                  Read our story <ArrowRight />
                </Link>
              </Button>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Our journey */}
      <section id="our-journey" className="container-page scroll-mt-28 pt-24 sm:pt-32">
        <SectionHead kicker="Our journey so far" title="From a home kitchen to nationwide delivery." />
        <Reveal as="p" delay={80} className="type-lead mt-4 max-w-2xl text-muted-foreground">
          Here's how we've grown, while staying true to our values.
        </Reveal>
        <Reveal delay={120} className="mt-10">
          <JourneyTimeline id="journey-home" />
        </Reveal>
      </section>

      {/* Customer reviews: hidden until enough have been approved */}
      <Testimonials />

      {/* Stockists */}
      <section id="stockists" className="container-page scroll-mt-28 pt-24 sm:pt-32">
        <SectionHead
          kicker="Find us in store"
          title="On the shelves of supermarkets and health shops across Greater Accra."
        />
        <Reveal delay={80} className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESS.stockists.map((s) => (
            <div key={s.name} className="rounded-[1.25rem] border border-border bg-surface p-5 transition-colors duration-300 hover:border-pepper/40">
              <p className="type-product">{s.name}</p>
              <p className="type-small mt-2 flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>{s.where.join(", ")}</span>
              </p>
            </div>
          ))}
        </Reveal>
        <Reveal as="p" className="type-small mt-5 text-muted-foreground">
          Stockist list current as at November 2026. Prefer to order direct? Call {CONTACT.phones[0]?.label} or <Link to="/contact" className="font-semibold text-brand underline-offset-4 hover:underline">send us a message</Link>.
        </Reveal>
      </section>

      {/* Closing banner */}
      <section className="container-page pt-24 sm:pt-32">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <h2 className="type-hero font-light">Healthy living on the go.</h2>
            <p className="type-lead mt-6 max-w-lg text-muted-foreground">Spices, herbs and oils prepared with care in Accra. Order online for delivery or collection, or find us in a store near you.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild variant="pepper" size="lg">
                <Link to="/shop">
                  Start shopping <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/contact">Contact us</Link>
              </Button>
            </div>
          </Reveal>
          <Reveal variant="scale" delay={120} className="relative lg:col-span-5">
            <img src={PHOTO.pouchesRow} alt="A row of Plants & Pure spice pouches" width={1080} height={720} loading="lazy" decoding="async" className="aspect-[3/2] w-full rounded-[1.5rem] object-cover shadow-lift" />
          </Reveal>
        </div>
      </section>
    </>
  );
}
