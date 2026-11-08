import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SORT, hasActiveFilters, pageWindow, parseShopParams, sanitizeSearch, shopHref } from "@/lib/catalogue/params";
import { safeProductImageUrl } from "@/lib/catalogue/images";
import { CatalogueError, __setCatalogueClientForTests, getProductBySlug, getRelatedProducts, listCategories, listProducts, mapProduct } from "@/lib/catalogue/data";

describe("shop URL parameters", () => {
  it("defaults when the URL has nothing or garbage", () => {
    expect(parseShopParams({})).toEqual({ q: "", category: "", sort: DEFAULT_SORT, page: 1 });
    expect(parseShopParams({ sort: "drop table", page: "-3", category: "Not A Slug!!", q: undefined })).toEqual({ q: "", category: "", sort: DEFAULT_SORT, page: 1 });
    expect(parseShopParams({ page: "abc" }).page).toBe(1);
    expect(parseShopParams({ page: "99999999" }).page).toBe(1);
  });
  it("accepts valid values and takes the first of repeated parameters", () => {
    expect(parseShopParams({ q: ["cumin", "x"], category: "culinary-spices", sort: "price-desc", page: "3" })).toEqual({ q: "cumin", category: "culinary-spices", sort: "price-desc", page: 3 });
  });
  it("search text cannot carry filter syntax or wildcards", () => {
    for (const hostile of ["a,b", "x),title.ilike.*", "100%", "a_b", 'q"uote', "x\\y", "a(b)c", "ab*cd", "c:d", "a.b", "<script>"]) {
      expect(sanitizeSearch(hostile)).not.toMatch(/[,()%*_\\:".<>]/);
    }
    expect(sanitizeSearch("  Black   pepper ")).toBe("Black pepper");
    expect(sanitizeSearch("Thé vert-bio d'Accra")).toBe("Thé vert-bio d'Accra");
    expect(sanitizeSearch("x".repeat(500)).length).toBeLessThanOrEqual(80);
  });
  it("builds short canonical links: defaults are omitted, filters survive", () => {
    expect(shopHref({})).toBe("/shop");
    expect(shopHref({ q: "", category: "", sort: "featured", page: 1 })).toBe("/shop");
    expect(shopHref({ category: "herbal-infusions", sort: "price-asc", page: 2, q: "tea" })).toBe("/shop?q=tea&category=herbal-infusions&sort=price-asc&page=2");
    expect(hasActiveFilters(parseShopParams({ q: "a" }))).toBe(true);
    expect(hasActiveFilters(parseShopParams({ sort: "newest" }))).toBe(false);
  });
  it("pagination window keeps first, last and neighbours", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10]);
  });
});

describe("image safety", () => {
  const ok = "https://res.cloudinary.com/demo-cloud/image/upload/v1/plants-and-pure/products/a.jpg";
  it("accepts only our own Cloudinary account over https", () => {
    expect(safeProductImageUrl(ok, "demo-cloud")).toBe(ok);
    expect(safeProductImageUrl("https://res.cloudinary.com/other/image/upload/a.jpg", "demo-cloud")).toBeNull();
    expect(safeProductImageUrl("http://res.cloudinary.com/demo-cloud/a.jpg", "demo-cloud")).toBeNull();
    expect(safeProductImageUrl("https://evil.example/demo-cloud/a.jpg", "demo-cloud")).toBeNull();
    expect(safeProductImageUrl("https://res.cloudinary.com.evil.example/demo-cloud/a.jpg", "demo-cloud")).toBeNull();
    expect(safeProductImageUrl("javascript:alert(1)", "demo-cloud")).toBeNull();
    expect(safeProductImageUrl(null, "demo-cloud")).toBeNull();
    expect(safeProductImageUrl(ok, "")).toBeNull(); // no cloud configured -> nothing is trusted
  });
});

/** A chainable stand-in for the supabase-js query builder that records every call. */
function fakeDb(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const log: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "is", "or", "order", "range", "limit"]) chain[m] = (...a: unknown[]) => (log.push([m, a]), chain);
  chain.maybeSingle = async () => (log.push(["maybeSingle", []]), { data: result.data ?? null, error: result.error ?? null });
  chain.then = (res: (v: unknown) => unknown) => res({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null });
  const tables: string[] = [];
  const client = { from: (t: string) => (tables.push(t), chain) };
  return { client: client as never, log, tables };
}
const calls = (log: [string, unknown[]][], name: string) => log.filter(([m]) => m === name).map(([, a]) => a);

describe("catalogue data layer", () => {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME; // empty in unit tests: images are all rejected by design

  it("every product query is restricted to published, non-archived rows", async () => {
    const db = fakeDb({ data: [], count: 0 });
    __setCatalogueClientForTests(db.client);
    await listProducts({ q: "cumin", categoryId: "c1", sort: "price-asc", page: 2, pageSize: 12 });
    expect(calls(db.log, "eq")).toContainEqual(["is_active", true]);
    expect(calls(db.log, "is")).toContainEqual(["archived_at", null]);
    expect(calls(db.log, "eq")).toContainEqual(["category_id", "c1"]);
    expect(calls(db.log, "or")[0]![0]).toBe("title.ilike.*cumin*,tagline.ilike.*cumin*,search_tsv.wfts(english).cumin");
    expect(calls(db.log, "range")).toEqual([[12, 23]]);
    expect(calls(db.log, "order").map((a) => a[0])).toEqual(["price", "created_at", "id"]);
    // never `select *`, never admin-only columns
    const cols = String(calls(db.log, "select")[0]![0]);
    expect(cols).not.toContain("*");
    for (const secret of ["sku", "archived_at", "is_active", "updated_at", "image_urls", "created_by", "low_stock_threshold"]) expect(cols).not.toContain(secret);

    const d = fakeDb({ data: null });
    __setCatalogueClientForTests(d.client);
    await getProductBySlug("qa-slug-1");
    expect(calls(d.log, "eq")).toContainEqual(["is_active", true]);
    expect(calls(d.log, "is")).toContainEqual(["archived_at", null]);

    const r = fakeDb({ data: [] });
    __setCatalogueClientForTests(r.client);
    await getRelatedProducts({ id: "p1", category_id: "c1" });
    expect(calls(r.log, "eq")).toContainEqual(["is_active", true]);
    expect(calls(r.log, "neq")).toEqual([["id", "p1"]]);
    __setCatalogueClientForTests(undefined);
  });

  it("selects only columns the public role is granted by migration 06 (a column outside the grant would fail on the real database)", async () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261025010000_catalogue_management.sql"), "utf8");
    const grant = /grant select \(([^)]+)\)\s+on public\.products to anon, authenticated/.exec(sql);
    expect(grant, "column grant not found in migration 06").not.toBeNull();
    const granted = new Set(grant![1]!.split(",").map((c) => c.trim()));
    const topLevel = (select: string) => {
      const out: string[] = [];
      let depth = 0, cur = "";
      for (const ch of select) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
      }
      out.push(cur.trim());
      return out.filter((c) => c && !c.includes("("));
    };
    const list = fakeDb({ data: [], count: 0 });
    __setCatalogueClientForTests(list.client);
    await listProducts({});
    const detail = fakeDb({ data: null });
    __setCatalogueClientForTests(detail.client);
    await getProductBySlug("qa-slug-1");
    const related = fakeDb({ data: [] });
    __setCatalogueClientForTests(related.client);
    await getRelatedProducts({ id: "p1", category_id: "c1" });
    for (const d of [list, detail, related]) {
      const cols = topLevel(String(calls(d.log, "select")[0]![0]));
      expect(cols.length).toBeGreaterThan(5);
      for (const c of cols) expect(granted.has(c), `column "${c}" is not granted to the public role`).toBe(true);
    }
    __setCatalogueClientForTests(undefined);
  });

  it("lists only active categories", async () => {
    const db = fakeDb({ data: [] });
    __setCatalogueClientForTests(db.client);
    await listCategories();
    expect(calls(db.log, "eq")).toContainEqual(["is_active", true]);
    __setCatalogueClientForTests(undefined);
  });

  it("does not query at all for malformed slugs or products without a category", async () => {
    const db = fakeDb({ data: [] });
    __setCatalogueClientForTests(db.client);
    for (const bad of ["", "UPPER", "a b", "../x", "a'--", "x".repeat(200)]) expect(await getProductBySlug(bad)).toBeNull();
    expect(await getRelatedProducts({ id: "p1", category_id: undefined })).toEqual([]);
    expect(db.tables).toEqual([]);
    __setCatalogueClientForTests(undefined);
  });

  it("a page past the end is an empty result (the page redirects), other errors throw", async () => {
    __setCatalogueClientForTests(fakeDb({ error: { code: "PGRST103", message: "range" } }).client);
    expect(await listProducts({ page: 9 })).toMatchObject({ items: [], total: 0 });
    __setCatalogueClientForTests(fakeDb({ error: { code: "500", message: "boom" } }).client);
    await expect(listProducts()).rejects.toBeInstanceOf(CatalogueError);
    await expect(getProductBySlug("ok-slug")).rejects.toBeInstanceOf(CatalogueError);
    await expect(listCategories()).rejects.toBeInstanceOf(CatalogueError);
    __setCatalogueClientForTests(undefined);
  });

  it("a page past the end reports the real page count so the shop can redirect to the last page", async () => {
    let from = 0;
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "or", "order"]) chain[m] = () => chain;
    chain.range = (f: number) => ((from = f), chain);
    chain.then = (res: (v: unknown) => unknown) =>
      res(from >= 28 ? { data: null, error: { code: "PGRST103", message: "range" }, count: null } : { data: [], error: null, count: 28 });
    __setCatalogueClientForTests({ from: () => chain } as never);
    expect(await listProducts({ page: 99, pageSize: 12 })).toMatchObject({ items: [], total: 28, pages: 3, page: 99 });
    __setCatalogueClientForTests(undefined);
  });

  it("maps rows: cover image first, foreign/invalid images dropped, numbers normalised, category flattened", () => {
    void cloud;
    const p = mapProduct({
      id: "1", title: "T", slug: "t", price: "12.50", compare_at_price: null, stock: 3, is_featured: false,
      image_urls: ["https://res.cloudinary.com/x/legacy.jpg"], // deprecated column: ignored even if present
      categories: [{ name: "Spices", slug: "spices" }],
      product_images: [
        { url: "https://evil.example/a.jpg", alt_text: null, position: 0, is_cover: false },
        { url: "https://res.cloudinary.com/x/a.jpg", alt_text: " ", position: 1, is_cover: true },
      ],
    });
    expect(p.price).toBe(12.5);
    expect(p.compare_at_price).toBeNull();
    expect(p.image_urls).toEqual([]); // no cloud name configured in unit tests -> nothing trusted
    expect(p.category).toEqual({ name: "Spices", slug: "spices" });
    expect("product_images" in p).toBe(false);
  });
});
