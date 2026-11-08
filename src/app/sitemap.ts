import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env/public";
import { listCategories, listProductSlugs } from "@/lib/catalogue/data";
import { shopHref } from "@/lib/catalogue/params";
import { logger, errorFields } from "@/lib/api/logger";

export const dynamic = "force-dynamic";

/**
 * Static pages + every PUBLISHED product and non-empty category, read from the same data layer as the shop.
 * If the database cannot be reached, the static pages are still listed (and the failure is logged);
 * no URLs are invented.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.appUrl.replace(/\/$/, "");
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.5 },
  ];
  try {
    const [categories, products] = await Promise.all([listCategories(), listProductSlugs()]);
    for (const c of categories) if (c.productCount > 0) entries.push({ url: `${base}${shopHref({ category: c.slug })}`, changeFrequency: "daily", priority: 0.7 });
    for (const p of products) entries.push({ url: `${base}/product/${p.slug}`, lastModified: p.updatedAt ?? undefined, changeFrequency: "weekly", priority: 0.8 });
  } catch (err) {
    logger.warn("sitemap.catalogue_unavailable", errorFields(err));
  }
  return entries;
}
