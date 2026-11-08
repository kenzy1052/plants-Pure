# Storefront (Phase 3)

How the public shop works, where the code lives, and how to check it.

## Pages

| Route | Rendering | Data | Notes |
|---|---|---|---|
| `/` | dynamic (server) | `listCategories`, `listProducts({sort:"featured",pageSize:8})` | Category index shows only categories that have published products. Empty/failed catalogue shows an intentional message, never fake products. |
| `/shop` | dynamic | `listCategories`, `listProducts` | Everything is driven by the URL: `?q=&category=&sort=&page=`. 12 per page. Past-the-end pages redirect to the last page. |
| `/product/[slug]` | dynamic | `getProductBySlug`, `getRelatedProducts` | Missing, draft and archived products return a real HTTP 404. Fetch errors reach `error.tsx`. |
| `/about` | static | `src/lib/business.ts` | Only wording the company has published. |
| `/contact` | static + client form | `POST /api/contact` | Real e-mail through Resend, or an honest failure message. |
| `/robots.txt`, `/sitemap.xml` | dynamic | published products and non-empty categories | Private areas disallowed. Falls back to static pages if the database is unreachable. |

## Data layer (`src/lib/catalogue/`)

- `params.ts` — pure URL parsing/building (`parseShopParams`, `shopHref`, `sanitizeSearch`, `pageWindow`). Search text is reduced to letters, digits, space, `-` and `'` so it cannot add PostgREST filter syntax.
- `data.ts` — server-only. Uses a **session-less anon** Supabase client, so a signed-in admin never sees drafts on public pages. Every query filters `is_active = true AND archived_at IS NULL` explicitly *and* RLS enforces the same rule. Explicit column lists (no `select *`; no `sku`, `is_active`, `archived_at`). Stable ordering (`id` tiebreak) so pages never overlap.
- `images.ts` — only `https://res.cloudinary.com/<our cloud>/…` URLs are ever rendered; anything else is dropped. Components also fall back to the placeholder if an image fails at runtime.
- Image source of truth is the `product_images` table (cover first). The deprecated `products.image_urls` column is used only if a product has no `product_images` rows, until Phase 4 removes it.

The browser never queries the database for the catalogue: the pages are server-rendered (verified: zero browser requests to Supabase while browsing shop, product and home).

## Contact form

`src/lib/contact.ts` (shared zod schema) → `src/app/api/contact/route.ts`: same-origin check, 8 KB body limit, rate limit (5 per 10 min per client, in-memory, see D-9), honeypot field, send-once idempotency key per message, `Reply-To` set to the visitor. Responses are truthful: `sent` → success; e-mail disabled → 503 with the business phone/e-mail; provider failure → 502. No message content or personal data is written to logs. HTML in the e-mail is escaped.

## Running the checks

```powershell
npm install
npm run test:unit        # 75 unit tests (run in a shell without your real .env values exported)
npm run test:live        # READ-ONLY checks of the catalogue layer against your real Supabase (needs .env.local); skips if the catalogue is empty
```

Browser QA (needs Chromium; used only in the sandbox): `scripts/qa/mock-supabase.mjs` serves 30 clearly fake "QA product N" records (including a draft, an archived, a sold-out, a no-image and a foreign-image product), then `scripts/qa/storefront.mjs` (functional) and `scripts/qa/visual.mjs` (layout, axe, 5 viewports). The mock is **not** a faithful PostgREST: it proves the pages behave, not that your database queries are right. That is what `test:live` is for.

## Known limits

- No caching yet: home, shop and product are rendered per request (correct, simple; revisit in Phase 9 with real traffic and hosting).
- The product page has no `loading.tsx` on purpose: a streaming loading boundary makes Next send HTTP 200 before `notFound()` runs, which would turn missing/draft products into soft-404s for search engines. Correct status codes were chosen over a skeleton on that one route.
- Stock is shown only as "In stock" / "Sold out" (no counts, no scarcity messages).
- No Open Graph fallback image and no logo file exist yet (not supplied).
