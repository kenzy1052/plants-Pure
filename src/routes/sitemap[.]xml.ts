import { createFileRoute } from "@tanstack/react-router";
import { getAnonSupabase } from "@/lib/supabase";

const BASE = "https://www.plantsandpure.com";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticPaths = ["/", "/shop", "/about", "/contact"];
        let products: { slug: string; updated_at: string | null }[] = [];
        try {
          const { data } = await getAnonSupabase().from("products").select("slug, updated_at").eq("is_active", true).is("archived_at", null).limit(5000);
          products = (data ?? []) as typeof products;
        } catch {
          /* sitemap still lists static pages */
        }
        const urls = [
          ...staticPaths.map((p) => `<url><loc>${BASE}${p}</loc></url>`),
          ...products.map((p) => `<url><loc>${BASE}/product/${p.slug}</loc>${p.updated_at ? `<lastmod>${new Date(p.updated_at).toISOString()}</lastmod>` : ""}</url>`),
        ];
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, {
          headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
