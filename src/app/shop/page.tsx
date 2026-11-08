import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listCategories, listProducts, type ListResult } from "@/lib/catalogue/data";
import { hasActiveFilters, parseShopParams, shopHref, SORTS } from "@/lib/catalogue/params";
import type { Category } from "@/lib/types";
import ProductCard from "@/components/ui/ProductCard";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CONTACT } from "@/lib/constants/business";
import { ShopFilters, type FilterLink } from "./shop-filters";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = parseShopParams(await searchParams);
  let categoryName: string | null = null;
  if (p.category) {
    try {
      categoryName = (await listCategories()).find((c) => c.slug === p.category)?.name ?? null;
    } catch {
      /* metadata falls back to the generic title */
    }
  }
  const title = p.q ? `Search results for “${p.q}”` : categoryName ? `${categoryName}` : "Shop";
  return {
    title,
    description: categoryName
      ? `${categoryName} from Plants & Pure, Accra. Browse and order online.`
      : "Spices, herbs and natural oils from Plants & Pure, Accra. Browse and order online.",
    alternates: { canonical: shopHref({ category: categoryName ? p.category : "", page: p.q ? 1 : p.page }) },
    // Search results and re-sorted lists are not separate pages worth indexing.
    robots: p.q || p.sort !== "featured" ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }: Props) {
  const params = parseShopParams(await searchParams);

  let categories: Category[] = [];
  let result: ListResult | null = null;
  let failed = false;
  const category = (c: Category[]) => c.find((x) => x.slug === params.category);
  try {
    categories = await listCategories();
    const active = category(categories);
    if (!params.category || active) {
      result = await listProducts({ q: params.q, categoryId: active?.id ?? null, sort: params.sort, page: params.page });
    }
  } catch {
    failed = true;
  }
  const activeCategory = category(categories);
  const unknownCategory = !failed && Boolean(params.category) && !activeCategory;

  // A page past the end (e.g. after filters changed) goes to the last real page, not a blank grid.
  if (result && params.page > 1 && result.items.length === 0) {
    redirect(shopHref({ ...params, page: result.pages > 0 ? result.pages : 1 }));
  }

  const visibleCategories = categories.filter((c) => c.productCount > 0);
  const totalPublished = categories.reduce((n, c) => n + c.productCount, 0);
  const filtered = hasActiveFilters(params);
  const activeFilterCount = Number(Boolean(params.q)) + Number(Boolean(params.category)) + Number(params.sort !== "featured");

  const categoryLinks: FilterLink[] = [
    { key: "", label: "All", href: shopHref({ q: params.q, sort: params.sort }), active: !params.category },
    ...visibleCategories.map((c) => ({
      key: c.slug,
      label: c.name,
      count: c.productCount,
      href: shopHref({ q: params.q, sort: params.sort, category: c.slug }),
      active: c.slug === params.category,
    })),
  ];
  const sortLinks: FilterLink[] = SORTS.map((s) => ({ key: s.value, label: s.label, href: shopHref({ ...params, sort: s.value, page: 1 }), active: s.value === params.sort }));

  return (
    <div className="container-page pb-24">
      <header className="border-b border-border pb-8 pt-10 md:pt-14">
        <p className="eyebrow text-text-muted">{activeCategory ? "Category" : "Collection"}</p>
        <h1 className="mt-3 text-h1">{activeCategory ? activeCategory.name : params.q ? "Search" : "Shop"}</h1>
        <p className="mt-4 max-w-prose text-lead text-text-secondary">
          {params.q ? <>Results for “{params.q}”.</> : "Natural spices, herbs and oils from Plants & Pure, Accra."}
        </p>
      </header>

      {failed && (
        <EmptyState className="mt-10" tone="error" title="We can’t load the shop right now" action={<ButtonLink href={shopHref(params)} variant="secondary">Try again</ButtonLink>}>
          <p>
            Please try again in a moment, or contact us on {CONTACT.primaryPhone}.
          </p>
        </EmptyState>
      )}

      {!failed && totalPublished === 0 && !unknownCategory && (
        <EmptyState
          className="mt-10"
          title="The collection is being prepared"
          action={<ButtonLink href={`mailto:${CONTACT.email}`} variant="secondary">Email us</ButtonLink>}
        >
          <p>Our online catalogue is not published yet. Contact us on {CONTACT.primaryPhone} to ask about spices, herbs and oils.</p>
        </EmptyState>
      )}

      {!failed && (totalPublished > 0 || unknownCategory) && (
        <>
          <div className="mt-8 grid gap-6">
            <form role="search" action="/shop" method="get" aria-label="Search products" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Search the shop" className="flex-1">
                {(a) => <Input {...a} type="search" name="q" defaultValue={params.q} placeholder="Name or description" autoComplete="off" enterKeyHint="search" maxLength={80} />}
              </Field>
              {params.category && <input type="hidden" name="category" value={params.category} />}
              {params.sort !== "featured" && <input type="hidden" name="sort" value={params.sort} />}
              <Button type="submit" variant="primary" className="sm:w-32">
                Search
              </Button>
            </form>

            <ShopFilters
              categories={categoryLinks}
              sorts={sortLinks}
              activeCount={activeFilterCount}
              clearHref={filtered || params.sort !== "featured" ? "/shop" : null}
            />
          </div>

          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-4">
            <p className="text-small text-text-secondary numeral" role="status" aria-live="polite">
              {result ? `${result.total} ${result.total === 1 ? "product" : "products"}` : "No products"}
              {activeCategory ? ` in ${activeCategory.name}` : ""}
              {params.q ? ` matching “${params.q}”` : ""}
              {result && result.pages > 1 ? ` · page ${result.page} of ${result.pages}` : ""}
            </p>
            {filtered && (
              <ButtonLink href="/shop" variant="quiet" size="sm">
                Clear search and filters
              </ButtonLink>
            )}
          </div>

          {result && result.items.length > 0 ? (
            <>
              <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4">
                {result.items.map((p, i) => (
                  <li key={p.id}>
                    <ProductCard product={p} priority={i < 4} />
                  </li>
                ))}
              </ul>
              <Pagination className="mt-16" current={result.page} pages={result.pages} hrefFor={(n) => shopHref({ ...params, page: n })} />
            </>
          ) : (
            <EmptyState
              className="mt-8"
              title={unknownCategory ? "We can’t find that category" : params.q ? "Nothing matches that search" : "No products in this category yet"}
              action={<ButtonLink href="/shop" variant="secondary">{filtered ? "Clear search and filters" : "Browse all products"}</ButtonLink>}
            >
              <p>{unknownCategory ? "The link may be out of date." : "Try a different word, or browse all products."}</p>
            </EmptyState>
          )}
        </>
      )}
    </div>
  );
}
