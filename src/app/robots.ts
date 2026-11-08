import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env/public";

/** Public pages are crawlable; account, checkout, auth, admin, API and the dev reference are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/account", "/admin", "/auth/", "/checkout", "/api/", "/design-system"] }],
    sitemap: `${publicEnv.appUrl}/sitemap.xml`,
  };
}
