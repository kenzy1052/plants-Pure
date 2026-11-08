import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductCardSkeleton } from "@/components/ui/Skeleton";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import ProductCard from "@/components/ui/ProductCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { Product } from "@/lib/types";
import { StyleguideInteractive } from "./interactive";

export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

/** Development reference only: the route does not exist in production builds. */
const SAMPLE: Product[] = [
  { id: "s1", title: "Sample product with a short name", slug: "sample", description: "", ingredients: "", price: 45, weight_grams: 100, stock: 12, is_featured: false, image_urls: [] },
  { id: "s2", title: "Sample featured product with a deliberately long name to test wrapping across lines", slug: "sample", description: "", ingredients: "", price: 80, compare_at_price: 100, weight_grams: 250, stock: 3, is_featured: true, image_urls: [] },
  { id: "s3", title: "Sample sold-out product", slug: "sample", description: "", ingredients: "", price: 60, weight_grams: 0, stock: 0, is_featured: false, image_urls: [] },
];

const SWATCHES: { name: string; cls: string; note: string }[] = [
  { name: "background", cls: "bg-background border border-border", note: "Page ground" },
  { name: "background-alt", cls: "bg-background-alt", note: "Alternate ground, image wells" },
  { name: "surface", cls: "bg-surface border border-border", note: "Lifted: cards, inputs" },
  { name: "inverse", cls: "bg-inverse", note: "The one dark ground" },
  { name: "action", cls: "bg-action", note: "Primary button" },
  { name: "accent", cls: "bg-accent", note: "Saffron: one conversion action per view" },
  { name: "accent-ink", cls: "bg-accent-ink", note: "Accent as text on light" },
  { name: "success", cls: "bg-success", note: "Confirmed" },
  { name: "warning", cls: "bg-warning", note: "Needs attention" },
  { name: "danger", cls: "bg-danger", note: "Error" },
  { name: "border-strong", cls: "bg-border-strong", note: "Control borders (3.1:1)" },
  { name: "border", cls: "bg-border", note: "Decorative rules" },
];

const TYPE: { cls: string; label: string }[] = [
  { cls: "text-display font-display", label: "Display" },
  { cls: "text-h1 font-display", label: "Heading 1" },
  { cls: "text-h2 font-display", label: "Heading 2" },
  { cls: "text-h3 font-display", label: "Heading 3" },
  { cls: "text-product font-display", label: "Product name" },
  { cls: "text-lead", label: "Lead paragraph" },
  { cls: "text-body", label: "Body text" },
  { cls: "text-small", label: "Small text" },
  { cls: "text-caption", label: "Caption" },
];

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="container-page space-y-20 pb-32 pt-10">
      <header>
        <p className="eyebrow text-text-muted">Development reference</p>
        <h1 className="mt-3 text-h1">Design system</h1>
        <p className="mt-4 max-w-prose text-lead text-text-secondary">Specimen Index: ink, paper and one saffron accent. This route exists only in development. Sample products below are placeholders, not catalogue items.</p>
      </header>

      <section aria-labelledby="c">
        <SectionHeading index="01" eyebrow="Colour" title={<span id="c">Semantic tokens</span>} />
        <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          {SWATCHES.map((s) => (
            <li key={s.name}>
              <div className={`h-20 ${s.cls}`} />
              <p className="mt-2 text-small font-semibold">{s.name}</p>
              <p className="text-caption text-text-muted">{s.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="t">
        <SectionHeading index="02" eyebrow="Typography" title={<span id="t">Instrument Serif and Hanken Grotesk</span>} />
        <ul className="mt-8 divide-y divide-border">
          {TYPE.map((t) => (
            <li key={t.label} className="grid gap-2 py-5 md:grid-cols-[10rem_1fr] md:items-baseline">
              <span className="eyebrow text-text-muted">{t.label}</span>
              <span className={t.cls}>Bring nature into your home</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="b">
        <SectionHeading index="03" eyebrow="Buttons" title={<span id="b">Actions</span>} />
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button variant="accent" size="lg">Accent (one per view)</Button>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <ButtonLink href="/shop" variant="secondary" size="sm">Link button (sm)</ButtonLink>
        </div>
      </section>

      <section aria-labelledby="f">
        <SectionHeading index="04" eyebrow="Forms" title={<span id="f">Fields</span>} />
        <form className="mt-8 grid max-w-3xl gap-5 md:grid-cols-2" onSubmit={undefined} aria-label="Sample fields">
          <Field label="Text field" hint="Helper text sits below.">{(a) => <Input {...a} placeholder="Placeholder" />}</Field>
          <Field label="Required field" required>{(a) => <Input {...a} />}</Field>
          <Field label="Field with error" error="This is what an error looks like.">{(a) => <Input {...a} defaultValue="invalid" />}</Field>
          <Field label="Select">{(a) => <Select {...a}><option>Option one</option><option>Option two</option></Select>}</Field>
          <Field label="Disabled">{(a) => <Input {...a} disabled defaultValue="Not editable" />}</Field>
          <Field label="Textarea" className="md:col-span-2">{(a) => <Textarea {...a} />}</Field>
        </form>
      </section>

      <section aria-labelledby="p">
        <SectionHeading index="05" eyebrow="Product card" title={<span id="p">Normal, featured with real compare-at price, sold out, loading</span>} />
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4">
          {SAMPLE.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
          <li><ProductCardSkeleton /></li>
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-8">
          <Price amount={45} size="lg" />
          <Price amount={80} compareAt={100} size="lg" />
          <div className="flex flex-wrap gap-2"><Badge tone="neutral">Neutral</Badge><Badge tone="accent">Accent</Badge><Badge tone="success">Success</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Danger</Badge><Badge tone="outline">Outline</Badge></div>
        </div>
      </section>

      <section aria-labelledby="s">
        <SectionHeading index="06" eyebrow="States" title={<span id="s">Empty, error, breadcrumbs, drawer</span>} />
        <div className="mt-8 space-y-8">
          <Breadcrumbs items={[{ label: "Shop", href: "/shop" }, { label: "Sample product" }]} />
          <EmptyState title="Nothing matches that search" action={<Button variant="secondary">Clear search and filters</Button>}><p>Try a different word, or browse all products.</p></EmptyState>
          <EmptyState tone="error" title="We can’t load the shop right now"><p>Please refresh in a moment.</p></EmptyState>
          <StyleguideInteractive />
        </div>
      </section>
    </div>
  );
}
