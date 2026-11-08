import { beforeAll, describe, expect, it, type TestContext } from "vitest";
import { getProductBySlug, getRelatedProducts, listCategories, listProducts, listProductSlugs, type ListResult } from "@/lib/catalogue/data";
import type { Category } from "@/lib/types";

/**
 * Runs the storefront queries against the real database and checks their behaviour (not just that they
 * return). Read-only. If the catalogue has no published products yet, the data-dependent checks are skipped
 * and say so; they become meaningful as soon as products are published.
 */
const live = process.env.LIVE_TESTS === "1";
const d = describe.skipIf(!live);

d("storefront data layer against the real database", () => {
  let categories: Category[] = [];
  let all: ListResult;
  beforeAll(async () => {
    categories = await listCategories();
    all = await listProducts({ pageSize: 100 });
  });
  const first = () => all.items[0]!;
  const needProducts = (ctx: TestContext) => {
    if (all.total === 0) ctx.skip(); // nothing published yet: nothing to check
  };

  it("categories load, with numeric counts that add up to the products that have a category", () => {
    expect(Array.isArray(categories)).toBe(true);
    for (const c of categories) expect(Number.isInteger(c.productCount)).toBe(true);
    const categorised = all.items.filter((p) => p.category_id).length;
    if (all.total <= 100) expect(categories.reduce((n, c) => n + c.productCount, 0)).toBe(categorised);
  });

  it("paging is consistent: pages of 2 add up to the total, with no repeats", async (ctx) => {
    needProducts(ctx);
    const seen = new Set<string>();
    const pages = Math.ceil(all.total / 2);
    for (let page = 1; page <= pages; page++) {
      const r = await listProducts({ pageSize: 2, page, sort: "newest" });
      expect(r.total).toBe(all.total);
      for (const p of r.items) {
        expect(seen.has(p.id)).toBe(false);
        seen.add(p.id);
      }
    }
    expect(seen.size).toBe(all.total);
  });

  it("a page past the end is empty, not an error", async (ctx) => {
    needProducts(ctx);
    expect((await listProducts({ pageSize: 2, page: 10_000 })).items).toEqual([]);
  });

  it("price sorting is monotonic", async (ctx) => {
    needProducts(ctx);
    const asc = (await listProducts({ sort: "price-asc", pageSize: 100 })).items.map((p) => p.price);
    const desc = (await listProducts({ sort: "price-desc", pageSize: 100 })).items.map((p) => p.price);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it("searching for a product's own title finds it; nonsense finds nothing", async (ctx) => {
    needProducts(ctx);
    const word = first().title.split(/\s+/)[0]!.replace(/[^\p{L}\p{N}]/gu, "");
    const hit = await listProducts({ q: word });
    expect(hit.items.some((p) => p.id === first().id)).toBe(true);
    expect((await listProducts({ q: "zzqxjvkw" })).total).toBe(0);
  });

  it("category filter returns only that category", async (ctx) => {
    needProducts(ctx);
    const c = categories.find((x) => x.productCount > 0);
    if (!c) return;
    const r = await listProducts({ categoryId: c.id, pageSize: 100 });
    expect(r.total).toBe(c.productCount);
    for (const p of r.items) expect(p.category_id).toBe(c.id);
  });

  it("product detail returns the same record, with only usable images, and related excludes itself", async (ctx) => {
    needProducts(ctx);
    const p = await getProductBySlug(first().slug);
    expect(p?.id).toBe(first().id);
    for (const u of p!.image_urls) expect(u.startsWith("https://res.cloudinary.com/")).toBe(true);
    for (const r of await getRelatedProducts(p!)) expect(r.id).not.toBe(p!.id);
  });

  it("an unknown slug is null, and published slugs match the listing", async () => {
    expect(await getProductBySlug("this-product-does-not-exist-xyz")).toBeNull();
    expect((await listProductSlugs()).length).toBe(all.total);
  });
});
