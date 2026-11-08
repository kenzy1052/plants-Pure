/**
 * Shop URL parameters: parsing, validation and link building. Pure functions (no I/O) so the
 * rules are unit-tested. The URL is the single source of truth for search / category / sort / page.
 */
export const PAGE_SIZE = 12;
export const MAX_SEARCH_LENGTH = 80;

export const SORTS = [
  { value: "featured", label: "Featured first" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
] as const;
export type Sort = (typeof SORTS)[number]["value"];
export const DEFAULT_SORT: Sort = "featured";

export type ShopParams = { q: string; category: string; sort: Sort; page: number };

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Keeps letters (any language), digits, spaces, hyphens and apostrophes. Everything else —
 * including the characters that have meaning in PostgREST filters and LIKE patterns
 * (, ( ) % * _ \ : " .) — is removed, so a search term can never alter the query's structure.
 */
export function sanitizeSearch(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH)
    .trim();
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseShopParams(raw: Raw): ShopParams {
  const category = first(raw.category).trim().toLowerCase();
  const sort = first(raw.sort);
  const page = Number.parseInt(first(raw.page), 10);
  return {
    q: sanitizeSearch(first(raw.q)),
    category: SLUG.test(category) && category.length <= 80 ? category : "",
    sort: (SORTS.some((s) => s.value === sort) ? sort : DEFAULT_SORT) as Sort,
    page: Number.isFinite(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** Builds /shop?… containing only non-default values, so URLs stay short and canonical. */
export function shopHref(p: Partial<ShopParams>): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.category) sp.set("category", p.category);
  if (p.sort && p.sort !== DEFAULT_SORT) sp.set("sort", p.sort);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const qs = sp.toString();
  return qs ? `/shop?${qs}` : "/shop";
}

export const hasActiveFilters = (p: ShopParams) => Boolean(p.q || p.category);

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
export function pageWindow(current: number, total: number, radius = 1): (number | null)[] {
  const keep = new Set<number>([1, total]);
  for (let i = current - radius; i <= current + radius; i++) if (i >= 1 && i <= total) keep.add(i);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push(null);
    out.push(n);
  });
  return out;
}
