import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { BUSINESS, CONTACT } from "@/lib/constants/business";
import { shopHref } from "@/lib/catalogue/params";

export const metadata: Metadata = {
  title: "About us",
  description: "Plants & Pure Limited is a natural products business in Accra, Ghana, founded in 2020, dealing in spices, herbs and natural oils.",
  alternates: { canonical: "/about" },
};

/**
 * About. Every statement is the company's own published wording or a plain fact from
 * src/lib/constants/business.ts. It deliberately has no timeline, figures, team, certificates or
 * sourcing claims: the business has not supplied evidence for them (see docs/DECISIONS.md).
 */
export default function AboutPage() {
  const { story, commitments, publishedCategories } = BUSINESS;
  return (
    <>
      <header className="border-b border-border">
        <div className="container-page grid gap-10 pb-14 pt-10 md:pt-16 lg:grid-cols-12 lg:gap-8 lg:pb-20">
          <div className="lg:col-span-8">
            <p className="eyebrow text-text-muted">About us</p>
            <h1 className="mt-5 text-h1">Plants &amp; Pure began in {BUSINESS.foundedYear.value}, from a wish to offer <em className="text-accent-ink">wholesome</em>, natural products.</h1>
          </div>
          <dl className="grid grid-cols-2 gap-6 lg:col-span-3 lg:col-start-10 lg:grid-cols-1 lg:self-end">
            <div>
              <dt className="eyebrow text-text-muted">Founded</dt>
              <dd className="mt-1 font-display text-h3">{BUSINESS.foundedYear.value}</dd>
            </div>
            <div>
              <dt className="eyebrow text-text-muted">Based in</dt>
              <dd className="mt-1 font-display text-h3">{CONTACT.location}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section aria-labelledby="who-title" className="section-space">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-5">
            <SectionHeading index="01" eyebrow="Who we are" title={<span id="who-title">{BUSINESS.legalName.value}</span>} />
          </Reveal>
          <Reveal delay={100} className="space-y-6 text-lead text-text-secondary lg:col-span-6 lg:col-start-7">
            <p>{BUSINESS.descriptor.value}</p>
            <p>Founded in {BUSINESS.foundedYear.value} and based in {CONTACT.location}.</p>
          </Reveal>
        </div>
      </section>

      <section data-surface="inverse" aria-labelledby="mission-title" className="section-space bg-inverse text-text-inverse">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-5">
            <SectionHeading inverse index="02" eyebrow="Our mission" title={<span id="mission-title">What we set out to do</span>} />
          </Reveal>
          <Reveal delay={100} className="lg:col-span-6 lg:col-start-7">
            <ul className="divide-y divide-text-inverse-muted/30 border-y border-text-inverse-muted/30">
              {story.mission.map((m) => (
                <li key={m} className="py-6 font-display text-h3 leading-snug">{m}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="offer-title" className="section-space">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-4">
            <SectionHeading index="03" eyebrow="What we offer" title={<span id="offer-title">Spices, herbs and natural oils</span>} />
          </Reveal>
          <Reveal delay={100} className="lg:col-span-7 lg:col-start-6">
            <ol className="divide-y divide-border border-y border-border">
              {publishedCategories.map((c, i) => (
                <li key={c.name} className="grid grid-cols-[3rem_1fr] gap-4 py-6">
                  <span className="numeral eyebrow pt-2 text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-h3">{c.name}</h3>
                    <p className="mt-2 text-text-secondary">{c.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8">
              <ButtonLink href={shopHref({})} variant="secondary">Shop the collection</ButtonLink>
            </p>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="commit-title" className="section-space border-t border-border bg-background-alt">
        <div className="container-page grid gap-12 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-4">
            <SectionHeading index="04" eyebrow="Commitments" title={<span id="commit-title">What we stand for</span>} lead="In the company’s own words." />
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

      <section aria-label="Contact" className="section-space-sm">
        <div className="container-page flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <p className="max-w-xl font-display text-h3">Questions about a product or an order? <Link href="/contact" className="underline underline-offset-4 decoration-border-strong hover:decoration-text">Get in touch</Link>.</p>
          <p className="text-small text-text-secondary">{CONTACT.hours} · {CONTACT.location}</p>
        </div>
      </section>
    </>
  );
}
