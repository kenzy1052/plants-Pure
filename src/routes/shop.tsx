import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Search, X } from "lucide-react";
import { ProductCard } from "@/components/shop/ProductCard";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { categoriesQuery, PAGE_SIZE, productsQuery, sanitizeSearch, SORTS, type Sort } from "@/lib/catalogue";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  q: z.string().max(80).optional().catch(undefined),
  category: z.string().max(80).regex(/^[a-z0-9-]*$/).optional().catch(undefined),
  sort: z.enum(["featured", "newest", "price-asc", "price-desc"]).optional().catch(undefined),
  page: z.number().int().min(1).max(500).optional().catch(undefined),
});

export const Route = createFileRoute("/shop")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Shop natural spices, herbs & oils | Plants & Pure Ghana" },
      { name: "description", content: "Browse Plants & Pure's quality spices, herbs and oils. Prices in Ghana cedis, delivered or collected in Accra." },
      { property: "og:title", content: "Shop — Plants & Pure" },
      { property: "og:description", content: "Natural spices, herbs and oils from Accra, Ghana." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.plantsandpure.com/shop" }],
  }),
  component: Shop,
});

function Shop() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/shop" });
  const [term, setTerm] = useState(search.q ?? "");
  const sort: Sort = search.sort ?? "featured";
  const page = search.page ?? 1;

  useEffect(() => setTerm(search.q ?? ""), [search.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      const clean = sanitizeSearch(term);
      if (clean !== (search.q ?? "")) navigate({ search: (s) => ({ ...s, q: clean || undefined, page: undefined }), replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useQuery(categoriesQuery());
  const products = useQuery({ ...productsQuery({ q: search.q, category: search.category, sort, page }), placeholderData: (prev) => prev });
  const activeCategory = categories.data?.find((c) => c.slug === search.category);

  return (
    <div>
      <section className="container-page pt-[9rem] sm:pt-[9.5rem]">
        <Reveal>
          <p className="type-small font-semibold text-brand">Shop</p>
          <h1 className="type-page mt-3 font-light">{activeCategory ? activeCategory.name : "The full range"}</h1>
          <p className="type-lead mt-4 max-w-xl text-muted-foreground">
            {search.q ? `Results for “${search.q}”` : "Quality spices, herbs and oils. Pay securely in GH₵ and choose delivery or collection in Accra."}
          </p>
        </Reveal>
      </section>

      <section className="container-page">
        <div className="sticky top-[5.5rem] z-30 mt-8 rounded-[1.75rem] border border-border bg-background/85 p-2 backdrop-blur-xl sm:top-24">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
              <Link
                to="/shop"
                search={(s) => ({ ...s, category: undefined, page: undefined })}
                className={cn("type-small shrink-0 rounded-full px-4 py-2.5 transition-colors", !search.category ? "bg-foreground text-background" : "hover:bg-container")}
              >
                All
              </Link>
              {categories.data?.map((c) => (
                <Link
                  key={c.id}
                  to="/shop"
                  search={(s) => ({ ...s, category: c.slug, page: undefined })}
                  className={cn("type-small shrink-0 rounded-full px-4 py-2.5 transition-colors", search.category === c.slug ? "bg-foreground text-background" : "hover:bg-container")}
                >
                  {c.name} <span className="type-label ml-1 opacity-60">{c.productCount}</span>
                </Link>
              ))}
            </div>
            <div className="flex gap-2">
              <label className="relative flex flex-1 items-center lg:w-64 lg:flex-none">
                <Search className="pointer-events-none absolute left-4 h-4 w-4 text-muted-foreground" />
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search products"
                  aria-label="Search products"
                  className="type-small h-11 w-full rounded-full bg-container pl-10 pr-9 outline-none focus:ring-2 focus:ring-ring"
                />
                {term && (
                  <button type="button" onClick={() => setTerm("")} aria-label="Clear search" className="absolute right-3 rounded-full p-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>
              <select
                value={sort}
                onChange={(e) => navigate({ search: (s) => ({ ...s, sort: e.target.value === "featured" ? undefined : (e.target.value as Sort), page: undefined }) })}
                aria-label="Sort products"
                className="type-small h-11 rounded-full bg-container px-4 outline-none focus:ring-2 focus:ring-ring"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page pb-24 pt-12">
        <div className="mb-6 flex items-center gap-2 text-muted-foreground">
          {products.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
          {products.data && <p className="type-label">{products.data.total} product{products.data.total === 1 ? "" : "s"}</p>}
        </div>

        {products.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-square animate-pulse rounded-[1.25rem] bg-container" />
                <div className="mt-3 h-4 w-2/3 animate-pulse rounded-full bg-container" />
              </div>
            ))}
          </div>
        ) : products.isError ? (
          <div className="rounded-[2rem] bg-container p-12 text-center">
            <p className="type-body text-muted-foreground">We couldn't load products right now.</p>
            <Button className="mt-5" onClick={() => products.refetch()}>
              Try again
            </Button>
          </div>
        ) : products.data.items.length === 0 ? (
          <div className="rounded-[2rem] bg-sage p-12 text-center sm:p-16">
            <h2 className="type-sub text-forest">{search.q ? "No products match your search" : activeCategory ? `No ${activeCategory.name.toLowerCase()} in store yet` : "New products are on their way"}</h2>
            <p className="type-body mx-auto mt-3 max-w-md text-forest/75">
              {search.q ? "Try a different word, or browse all products." : "Our shelves are being stocked. Check back soon, or get in touch to order directly."}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button asChild>
                <Link to="/shop">See all products</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/contact">Contact us</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {products.data.items.map((p, i) => (
                <Reveal key={p.id} delay={(i % 4) * 80}>
                  <ProductCard product={p} priority={i < 4} />
                </Reveal>
              ))}
            </div>
            {products.data.pages > 1 && (
              <nav aria-label="Pagination" className="mt-16 flex items-center justify-center gap-2">
                {Array.from({ length: products.data.pages }).map((_, i) => (
                  <Link
                    key={i}
                    to="/shop"
                    search={(s) => ({ ...s, page: i === 0 ? undefined : i + 1 })}
                    aria-current={page === i + 1 ? "page" : undefined}
                    className={cn("type-small inline-flex h-11 w-11 items-center justify-center rounded-full", page === i + 1 ? "bg-foreground text-background" : "hover:bg-container")}
                  >
                    {i + 1}
                  </Link>
                ))}
              </nav>
            )}
            <p className="sr-only">Showing up to {PAGE_SIZE} products per page.</p>
          </>
        )}
      </section>
    </div>
  );
}
