import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalogue/data";
import { shopHref } from "@/lib/catalogue/params";
import { publicEnv } from "@/lib/env/public";
import { BUSINESS } from "@/lib/constants/business";
import type { Product } from "@/lib/types";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { ButtonLink } from "@/components/ui/Button";
import ProductCard from "@/components/ui/ProductCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGallery } from "./gallery";
import { PurchasePanel } from "./purchase-panel";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  let product: Product | null = null;
  try {
    product = await getProductBySlug(slug);
  } catch {
    return { title: "Product" };
  }
  if (!product) return { title: "Product not found", robots: { index: false, follow: false } };
  const description = clip(product.tagline || product.description || `${product.title} from Plants & Pure, Accra.`, 160);
  const image = product.images?.[0]?.url;
  return {
    title: product.title,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: { title: product.title, description, type: "website", url: `/product/${product.slug}`, ...(image ? { images: [{ url: image, alt: product.images?.[0]?.alt ?? product.title }] } : {}) },
  };
}

/** Structured data from real record values only: no ratings, no reviews, no invented fields. */
function productJsonLd(p: Product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    ...(p.description ? { description: clip(p.description, 500) } : {}),
    ...(p.image_urls.length ? { image: p.image_urls } : {}),
    brand: { "@type": "Brand", name: BUSINESS.shortName },
    offers: {
      "@type": "Offer",
      url: `${publicEnv.appUrl}/product/${p.slug}`,
      priceCurrency: "GHS",
      price: p.price.toFixed(2),
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug); // throws CatalogueError -> app/error.tsx (retry)
  if (!product) notFound(); // missing, draft and archived products are indistinguishable by design

  let related: Product[] = [];
  try {
    related = await getRelatedProducts(product, 4);
  } catch {
    /* related products are optional: the page works without them */
  }

  const soldOut = product.stock <= 0;
  const notes = (product.flavor_notes ?? []).filter(Boolean);
  const crumbs = [
    { label: "Shop", href: "/shop" },
    ...(product.category ? [{ label: product.category.name, href: shopHref({ category: product.category.slug }) }] : []),
    { label: product.title },
  ];

  return (
    <div className="container-page pb-24 pt-6 md:pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)).replace(/</g, "\\u003c") }} />
      <Breadcrumbs items={crumbs} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
          <ProductGallery title={product.title} images={product.images ?? []} soldOut={soldOut} />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {product.weight_grams ? <p className="eyebrow numeral text-text-muted">{product.weight_grams} g</p> : null}
            {soldOut ? <Badge tone="neutral">Sold out</Badge> : <Badge tone="success">In stock</Badge>}
            {product.is_featured && !soldOut && <Badge tone="accent">Featured</Badge>}
          </div>
          <h1 className="mt-3 text-h1">{product.title}</h1>
          {product.tagline && <p className="mt-3 text-lead text-text-secondary">{product.tagline}</p>}
          <Price amount={product.price} compareAt={product.compare_at_price} size="lg" className="mt-6" />

          <PurchasePanel product={product} />

          {product.description && (
            <section className="mt-10 border-t border-border pt-8" aria-labelledby="about-heading">
              <h2 id="about-heading" className="eyebrow text-text-muted">About this product</h2>
              <p className="mt-4 whitespace-pre-line text-text-secondary">{product.description}</p>
            </section>
          )}
          {notes.length > 0 && (
            <section className="mt-8 border-t border-border pt-8" aria-labelledby="notes-heading">
              <h2 id="notes-heading" className="eyebrow text-text-muted">Flavour notes</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {notes.map((n) => (
                  <li key={n}>
                    <Badge tone="outline">{n}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {product.culinary_uses && (
            <section className="mt-8 border-t border-border pt-8" aria-labelledby="uses-heading">
              <h2 id="uses-heading" className="eyebrow text-text-muted">How to use</h2>
              <p className="mt-4 whitespace-pre-line text-text-secondary">{product.culinary_uses}</p>
            </section>
          )}
          {product.ingredients && (
            <section className="mt-8 border-t border-border pt-8" aria-labelledby="ingredients-heading">
              <h2 id="ingredients-heading" className="eyebrow text-text-muted">Ingredients</h2>
              <p className="mt-4 whitespace-pre-line text-text-secondary">{product.ingredients}</p>
            </section>
          )}
          {soldOut && (
            <p className="mt-10 border-t border-border pt-6 text-small text-text-secondary">
              Looking for something similar? <a className="underline underline-offset-4" href={product.category ? shopHref({ category: product.category.slug }) : "/shop"}>Browse {product.category ? product.category.name : "the shop"}</a>.
            </p>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-24 border-t border-border pt-12">
          <SectionHeading eyebrow="More from" title={<span id="related-heading">{product.category?.name ?? "the collection"}</span>} />
          <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4">
            {related.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
          <p className="mt-10">
            <ButtonLink href="/shop" variant="secondary">All products</ButtonLink>
          </p>
        </section>
      )}
    </div>
  );
}
