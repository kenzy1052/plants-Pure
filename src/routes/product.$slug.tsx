import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, ShieldCheck, Truck } from "lucide-react";
import { ProductCard, Price } from "@/components/shop/ProductCard";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { StickyBuyBar } from "@/components/shop/StickyBuyBar";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { cldUrl, fetchRelated, productQuery } from "@/lib/catalogue";
import { useCart } from "@/lib/cart-store";
import { formatGHS } from "@/lib/money";
import { usePageTitle } from "@/lib/page-title";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData(productQuery(params.slug));
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData, params }) => {
    const p = loaderData?.product;
    if (!p) return { meta: [{ title: "Product not found | Plants & Pure" }] };
    const desc = (p.tagline || p.description || `${p.title} from Plants & Pure, Accra.`).slice(0, 155);
    const image = cldUrl(p.images[0]?.url, 1200, { h: 630 });
    const url = `https://www.plantsandpure.com/product/${params.slug}`;
    return {
      meta: [
        { title: `${p.title} | Plants & Pure Ghana` },
        { name: "description", content: desc },
        { property: "og:title", content: `${p.title} — Plants & Pure` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.title,
            description: p.description || p.tagline || undefined,
            image: p.images.map((i) => i.url),
            category: p.category?.name,
            brand: { "@type": "Brand", name: "Plants & Pure" },
            offers: {
              "@type": "Offer",
              price: p.price.toFixed(2),
              priceCurrency: "GHS",
              availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              url,
            },
          }),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center pt-28 text-center">
      <h1 className="type-section">We couldn't find that product</h1>
      <p className="type-body mt-3 text-muted-foreground">It may have been removed or is no longer available.</p>
      <Button asChild className="mt-6">
        <Link to="/shop">Back to the shop</Link>
      </Button>
    </div>
  ),
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { data: product } = useSuspenseQuery(productQuery(slug));
  const p = product!;
  const [qty, setQty] = useState(1);
  const add = useCart((s) => s.add);
  const setBarTitle = usePageTitle((s) => s.set);
  const related = useQuery({ queryKey: ["related", p.id], queryFn: () => fetchRelated(p), staleTime: 60_000 });
  const soldOut = p.stock <= 0;
  const lowStock = !soldOut && p.stock <= 5;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  // New product → start again from one unit.
  useEffect(() => setQty(1), [p.id]);

  // Once the big heading scrolls under the header, the product name moves into the header and stays there.
  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        const gone = !!e && !e.isIntersecting && e.boundingClientRect.top < 96;
        setBarTitle(gone ? { title: p.title, subtitle: formatGHS(p.price) } : null);
      },
      { rootMargin: "-80px 0px 0px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      setBarTitle(null);
    };
  }, [p.title, p.price, setBarTitle]);

  // Phones/tablets: the photo eases back (dims and shrinks a little) as the details card slides over it.
  useEffect(() => {
    const el = galleryRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      el.style.setProperty("--p", Math.min(1, Math.max(0, window.scrollY / (el.offsetHeight || 1))).toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [p.id]);

  const crumbs = (
    <nav aria-label="Breadcrumb" className="type-small flex items-center gap-1.5 text-muted-foreground">
      <Link to="/shop" className="link-line hover:text-foreground">Shop</Link>
      {p.category && (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/shop" search={{ category: p.category.slug }} className="link-line hover:text-foreground">{p.category.name}</Link>
        </>
      )}
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="truncate text-foreground">{p.title}</span>
    </nav>
  );

  return (
    <div className="pt-[4.5rem] lg:pt-32">
      <div className="container-page hidden lg:block">{crumbs}</div>

      <div className="lg:container-page lg:mt-8 lg:grid lg:grid-cols-12 lg:gap-14">
        {/* The photo has its own space and stays put while the card scrolls over it */}
        <div ref={galleryRef} className="sticky top-[4.5rem] z-0 lg:top-28 lg:col-span-7 lg:self-start">
          <div className="max-lg:[opacity:calc(1_-_var(--p,0)_*_0.45)] max-lg:[transform:scale(calc(1_-_var(--p,0)_*_0.06))] max-lg:origin-top">
            <ProductGallery images={p.images} title={p.title} hero />
          </div>
          <Link
            to="/shop"
            aria-label="Back to the shop"
            className="absolute left-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-soft backdrop-blur lg:hidden"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>

        {/* Details: a soft rounded card that slides up over the photo */}
        <div className="relative z-10 -mt-8 rounded-t-[2rem] bg-surface px-5 pb-12 pt-3 shadow-[0_-18px_40px_-22px_rgb(0_0_0/0.4)] sm:px-8 lg:col-span-5 lg:mt-0 lg:rounded-[2rem] lg:border lg:border-border lg:p-8 lg:shadow-soft">
          <div aria-hidden className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-border lg:hidden" />
          {p.category && <p className="type-label text-muted-foreground">{p.category.name}</p>}
          <h1 ref={titleRef} className="type-page mt-3 scroll-mt-24">{p.title}</h1>
          {p.tagline && <p className="type-lead mt-4 text-muted-foreground">{p.tagline}</p>}
          <div className="mt-6 flex items-baseline gap-4">
            <Price price={p.price} compareAt={p.compare_at_price} className="type-sub" />
            {p.weight_grams ? <span className="type-label text-muted-foreground">{p.weight_grams} g</span> : null}
          </div>
          <p className={cn("type-small mt-3", soldOut ? "text-destructive" : lowStock ? "text-pepper" : "text-olive")}>
            {soldOut ? "Currently sold out" : lowStock ? `Only ${p.stock} left in stock` : "In stock"}
          </p>

          <ul className="mt-8 grid gap-3 rounded-3xl bg-container p-5">
            <li className="type-small flex items-center gap-3"><Truck className="h-4 w-4 shrink-0 text-olive" /> Delivery or collection in Accra — options shown at checkout</li>
            <li className="type-small flex items-center gap-3"><ShieldCheck className="h-4 w-4 shrink-0 text-olive" /> Secure payment in GHS through Paystack</li>
          </ul>

          <div className="mt-10 divide-y divide-border border-y border-border">
            {p.description && <Detail title="Description" open>{p.description}</Detail>}
            {p.flavor_notes && p.flavor_notes.length > 0 && (
              <Detail title="Flavour notes">
                <div className="flex flex-wrap gap-2">
                  {p.flavor_notes.map((n) => (
                    <span key={n} className="type-small rounded-full bg-sage px-3 py-1 text-forest">{n}</span>
                  ))}
                </div>
              </Detail>
            )}
            {p.culinary_uses && <Detail title="How to use">{p.culinary_uses}</Detail>}
            {p.ingredients && <Detail title="Ingredients">{p.ingredients}</Detail>}
          </div>
        </div>
      </div>

      {related.data && related.data.length > 0 && (
        <section className="container-page relative z-10 bg-background section-space">
          <Reveal>
            <h2 className="type-section">You may also like</h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {related.data.map((r, i) => (
              <Reveal key={r.id} delay={i * 80}>
                <ProductCard product={r} />
              </Reveal>
            ))}
          </div>
        </section>
      )}
      <div className="h-24" />

      <StickyBuyBar title={p.title} price={p.price} compareAt={p.compare_at_price} stock={p.stock} qty={qty} onQty={setQty} onAdd={() => add(p, qty)} />
    </div>
  );
}

function Detail({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <span className="type-label">{title}</span>
        <Plus className="h-4 w-4 transition-transform duration-300 group-open:rotate-45" />
      </summary>
      <div className="type-body mt-4 whitespace-pre-line text-muted-foreground">{children}</div>
    </details>
  );
}
