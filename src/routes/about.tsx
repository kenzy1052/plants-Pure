import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, HandHeart, Recycle } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { Parallax } from "@/components/site/Parallax";
import { Button } from "@/components/ui/button";
import { BUSINESS } from "@/lib/business";
import { PHOTO } from "@/assets/company";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Our story | Plants & Pure — Quality spices, herbs and oils" },
      { name: "description", content: "Plants & Pure Limited began in September 2020 in Accra, Ghana, offering wholesome, natural spices, herbs and oils — and supporting women entrepreneurs." },
      { property: "og:title", content: "Our story — Plants & Pure" },
      { property: "og:description", content: "Wholesome, natural products from Accra since 2020." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.plantsandpure.com/about" }],
  }),
  component: About,
});

const GLANCE = [
  { label: "Established", value: BUSINESS.foundedLabel },
  { label: "Founder", value: BUSINESS.founder },
  { label: "Industry", value: "Agro-processing: spices, herbs and oils" },
  { label: "Based in", value: "Abladjei, Accra, Ghana" },
];

function About() {
  return (
    <>
      {/* Hero: headline and a short intro beside the company's own photography, then the facts at a glance */}
      <section className="container-page pt-32 sm:pt-40">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-6">
            <p className="type-small font-semibold text-brand">Our story · Since {BUSINESS.foundedYear}</p>
            <h1 className="type-page mt-4">Born from a dream to offer wholesome, natural products.</h1>
            <p className="type-lead mt-6 max-w-xl text-muted-foreground">{BUSINESS.story.origin}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="pepper" size="lg">
                <Link to="/shop">
                  Shop the range <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/contact">Get in touch</Link>
              </Button>
            </div>
          </Reveal>
          <Reveal variant="right" className="relative lg:col-span-6">
            <Parallax speed={0.04}>
              <img src={PHOTO.flatlayChili} alt="Plants & Pure pouches of cinnamon, chilli and all-purpose spice blend with whole spices and wooden spoons" width={1080} height={720} className="aspect-[4/3] w-full rounded-[2rem] object-cover shadow-lift" />
            </Parallax>
            <Parallax speed={-0.07} className="absolute -bottom-8 -left-3 w-[40%] sm:-left-6">
              <img src={PHOTO.pouchesScoop} alt="Plants & Pure spice pouches with a wooden scoop and whole cloves" width={1080} height={720} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-[1.25rem] object-cover ring-[6px] ring-background shadow-lift" />
            </Parallax>
          </Reveal>
        </div>
      </section>

      <section className="container-page pt-20 sm:pt-28">
        <dl className="grid gap-px overflow-hidden rounded-[1.5rem] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {GLANCE.map((g, i) => (
            <Reveal key={g.label} delay={i * 80} className="bg-surface p-6">
              <dt className="type-small text-muted-foreground">{g.label}</dt>
              <dd className="type-product mt-1.5">{g.value}</dd>
            </Reveal>
          ))}
        </dl>
      </section>

      <section className="container-page section-space">
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <h2 className="type-section">Where we began</h2>
          </Reveal>
          <div className="space-y-5 lg:col-span-7">
            <Reveal>
              <p className="type-lead">{BUSINESS.story.belief}</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Mission & vision */}
      <section>
        <div className="grid lg:grid-cols-2">
          <Reveal variant="left" className="bg-brand-gradient p-8 text-pepper-foreground sm:p-14 lg:px-[max(3rem,calc((100vw-88rem)/2+1.5rem))] lg:pr-14">
            <p className="type-small font-semibold text-lime">Our mission</p>
            <p className="type-sub mt-5 leading-snug">{BUSINESS.story.mission}</p>
          </Reveal>
          <Reveal variant="right" className="stage grain relative overflow-hidden p-8 text-night-foreground sm:p-14 lg:pl-14 lg:pr-[max(3rem,calc((100vw-88rem)/2+1.5rem))]">
            <p className="type-small font-semibold text-lime">Our vision</p>
            <p className="type-sub mt-5 leading-snug">{BUSINESS.story.vision}</p>
          </Reveal>
        </div>
      </section>

      {/* Values */}
      <section className="container-page section-space">
        <Reveal>
          <p className="type-small font-semibold text-brand">Core values</p>
          <h2 className="type-section mt-2 max-w-2xl">Five values, summed up as EATHI.</h2>
          <p className="type-body mt-4 max-w-2xl text-muted-foreground">They apply to how we grow, process and sell our products, how we treat our customers and each other, and how we deal with regulators and partners.</p>
        </Reveal>
        <ul className="mt-10 grid gap-px overflow-hidden rounded-[1.75rem] border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {BUSINESS.values.map((v, i) => (
            <Reveal as="li" key={v.name} delay={i * 90} className="bg-surface p-6 transition-colors duration-500 hover:bg-sage lg:p-7">
              <span className="font-display text-6xl leading-none text-brand-gradient">{v.letter}</span>
              <h3 className="type-sub mt-6">{v.name}</h3>
              <p className="type-small mt-3 text-muted-foreground">{v.body}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Quality commitment */}
      <section>
        <div className="relative">
          <div className="container-page section-space grid items-start gap-12 lg:grid-cols-12">
            <Reveal className="lg:col-span-5">
              <p className="type-small font-semibold text-olive">Quality commitment</p>
              <h2 className="type-section mt-2">Every product is a promise of quality.</h2>
              <p className="type-body mt-4 max-w-md text-muted-foreground">Our customers deserve the best. We apply these principles throughout our operations.</p>
            </Reveal>
            <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
              {BUSINESS.commitments.map((c, i) => (
                <Reveal as="li" key={c} delay={(i % 2) * 90} className="flex items-start gap-3 rounded-[1.25rem] border border-border bg-surface p-5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime-gradient text-lime-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <p className="type-small font-medium">{c}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Community & sustainability */}
      <section className="container-page section-space">
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal className="rounded-[1.75rem] border border-border bg-surface p-8 sm:p-10">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient text-pepper-foreground">
              <HandHeart className="h-5 w-5" />
            </span>
            <h2 className="type-sub mt-6">Empowering women entrepreneurs</h2>
            <p className="type-body mt-3 text-muted-foreground">{BUSINESS.community.women}</p>
          </Reveal>
          <Reveal delay={120} className="rounded-[1.75rem] border border-border bg-surface p-8 sm:p-10">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime-gradient text-lime-foreground">
              <Recycle className="h-5 w-5" />
            </span>
            <h2 className="type-sub mt-6">Sustainable practices</h2>
            <p className="type-body mt-3 text-muted-foreground">Caring for the planet is part of who we are. We aim to reflect this in:</p>
            <ul className="mt-4 space-y-2">
              {BUSINESS.community.sustainability.map((x) => (
                <li key={x} className="type-small flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime-gradient" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="container-page pb-8 text-center sm:pb-12">
        <Reveal>
          <h2 className="type-section mx-auto max-w-2xl">Healthy living on the go.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild variant="pepper" size="lg">
              <Link to="/shop">
                Shop now <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/contact">Get in touch</Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </>
  );
}
