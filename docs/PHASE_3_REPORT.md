# Phase 3 completion report — Complete storefront

Status: **implementation complete; awaiting your approval before Phase 4.** "Verified" means I ran it in this session; everything not run is under "Not verified".

After copying the code run **`npm install`** (the unused `canvas-confetti` packages were removed, so `package-lock.json` changed), then `npm run dev`. Optional but recommended once your catalogue has products: **`npm run test:live`** (read-only checks of the catalogue queries against your real Supabase).

---

## 1. Pages completed

- **Home** — real categories (with published-product counts) and featured products from the database; story and commitments in the company's own published words; "How ordering works" (statements about our own system only); contact strip. Intentional empty/error states if the catalogue is empty or unreachable.
- **Shop** — server-side search, category filter, sort (featured, newest, price low/high) and pagination, all combined through URL parameters; 12 per page; no full-catalogue download; loading skeleton, no-results, empty-catalogue, unknown-category and error states; mobile "Filter & sort" drawer; clear-filters link.
- **Product detail** — gallery with fallback, price (sale price only if the product really has a compare-at price), description, flavour notes / how to use / ingredients **only when the data exists**, In stock / Sold out, quantity limited to stock, add to cart (existing cart store), breadcrumbs, related products from the same category. Missing, draft and archived products return a real **HTTP 404**.
- **About** — only verified wording (2020, Accra, mission, published commitments, the three categories). No timeline, figures, team or certificates.
- **Contact** — verified e-mail, both phone numbers, hours, location, Instagram, Facebook; form that sends a real e-mail through Resend or says honestly that it could not.
- **Supporting** — branded 404, error page with retry, `robots.txt`, `sitemap.xml`, navigation and footer updated (Shop, About, Contact).
- **Not built (needs your decisions, nothing invented):** FAQ and policy pages (shipping, returns, privacy, terms).

## 2. Files changed

30 tracked files modified/removed, plus new files. Main groups (full list: `git status` / the Phase 3 commit):

- **New data layer:** `src/lib/catalogue/{params,images,data}.ts`.
- **New pages/routes:** `src/app/{about,contact}/`, `src/app/api/contact/route.ts`, `src/app/shop/{shop-filters,loading}.tsx`, `src/app/product/[slug]/{gallery,purchase-panel}.tsx`, `not-found.tsx`, `error.tsx`, `robots.ts`, `sitemap.ts`.
- **New components/libs:** `Pagination`, `src/lib/contact.ts`, `src/lib/email/contact-message.ts`.
- **Rewritten:** home, shop and product pages (server components); `ProductCard` (image fallback); `Navbar`, `Footer`, `layout.tsx` (metadata base and title template); `Field` (stable `id`); small additions to `types.ts` and `email/send.ts` (`replyTo`).
- **Removed:** the Phase 2 client-side data access (`use-products`, `home-products`, `shop-client`, `catalogue.ts`) and the unused `canvas-confetti` dependency.
- **Tests/QA/docs:** `tests/unit/{storefront,contact}.test.ts`, `tests/live/catalogue.live.test.ts`, `vitest.live.config.ts`, `scripts/qa/{mock-supabase,visual,storefront}.mjs`, `docs/{STOREFRONT,DECISIONS,DESIGN_SYSTEM,PHASE_3_REPORT}.md`.
- **Not touched:** database schema/migrations, authentication, Paystack and webhook logic, payment RPCs, uploads.

## 3. Data integration

- The catalogue is read **on the server** with a session-less anon Supabase client. Every query filters `is_active = true AND archived_at IS NULL` explicitly, in addition to the RLS policy, so drafts and archived products cannot appear even for a signed-in admin.
- Explicit column lists; no `sku`, `is_active` or `archived_at` is selected or rendered.
- Images come from `product_images` (cover first); only `res.cloudinary.com/<your cloud>` URLs are rendered; broken images fall back to the placeholder at runtime. The old `image_urls` column is a transitional fallback until Phase 4.
- Search text is reduced to safe characters before it reaches the query; verified with a hostile string.
- Cart: unchanged store; add-to-cart from cards and product pages, survives refresh (verified).

## 4. Functional verification (all executed)

| Check | Result |
|---|---|
| `tsc --noEmit`, `npm run lint` | Clean |
| `npm run build` | Succeeds |
| Unit tests (clean environment) | **75 / 75** (57 before Phase 3 + 18 new) |
| Database tests (scratch PostgreSQL 16) | **100 / 100** |
| `npm run smoke` against the production server | All pass |
| `/design-system` in production | 404 |
| New functional browser script (`storefront.mjs`) | **74 checks pass, 0 fail** |
| Visual + accessibility script (`visual.mjs`), 5 viewports × 23 page variants | **463 checks pass, 0 fail** |
| Secret scan of `.next/static` for the fake service-role, Paystack, Cloudinary and Resend secrets | Not found in any client bundle |
| Browser requests to the database while browsing home/shop/product | 0 |

What the 74 functional checks cover: 12/12/4 paging of 28 published products; draft and archived never visible (shop, search, sitemap, product URL); out-of-range page redirects; search; category filter and the empty and unknown category states; both price sorts; search + category + sort + paging combined; the mobile drawer; product page data, optional sections absent when empty, related products excluding itself, canonical/title/Open Graph, JSON-LD (real price, GHS, availability, no ratings); sold-out state; foreign-host image dropped; add to cart and refresh; exact `mailto:`/`tel:`/social links; contact form validation, focus on first error, the **real failure path** (Resend unreachable → the form says so, no fake success); robots and sitemap contents; internal-link crawl; reduced-motion; keyboard focus outline.

**Real defects found by this QA and fixed (not cosmetic):**
1. A page number past the end redirected to page 1 instead of the last page (the data layer did not know the page count). Fixed and unit-tested.
2. The contact form's labels were not bound to their inputs (axe: "form elements must have labels") — a real accessibility bug. Fixed in `Field`.
3. Missing/draft product URLs returned HTTP 200 (soft 404) because of a streaming loading boundary. Removed it on that route (decision D-14).
4. Pagination "Next ›" wrapped onto two lines on desktop. Fixed.

## 5. Responsive and accessibility checks

- Widths 360, 390, 768, 1024, 1440 (headless Chromium): no horizontal overflow on any page; screenshots inspected for home, shop (desktop and mobile), product, contact.
- **axe-core (WCAG 2.0–2.2 A/AA): 0 violations** on all pages at all five widths after fix 2.
- Keyboard: skip link, focus outline on product links, form focus to first invalid field; reduced motion shows all content immediately.
- Touch targets ≥ 44 px on pagination, filters, quantity stepper, buttons.

## 6. Known limitations / not verified

- **Not run against your real Supabase.** The sandbox cannot reach it. Tested with fake query-shape unit tests, an in-sandbox mock that is *not* a faithful PostgREST, and a `test:live` suite you can run. Please run `npm run test:live` after adding a few products; it checks paging consistency, sorting, search, category filtering and detail/related queries. Until then, treat real-database behaviour (especially the combined `ilike`/full-text search filter) as unverified.
- Resend success path: unit-tested with a stubbed provider and rendered in the UI through a faked response; **no real e-mail was sent**. Needs your Resend key and a verified sender.
- Only Chromium; no Firefox, Safari or real phones. No human screen-reader test.
- Real photography, logo and Open Graph image do not exist, so every card shows the "photo coming soon" placeholder and the layout with real product images is unseen.
- Lighthouse / real-network performance and layout-shift were not re-measured in Phase 3 (Phase 2 figures were CLS 0.00–0.006); the client bundle was not re-profiled. Deferred to Phase 9.
- In-memory rate limiting does not hold across serverless instances (D-9).
- Category names/slugs and the second phone number are unconfirmed; FAQ/policy pages are not built.

## 7. Security and performance notes

- No secrets in client bundles (scanned). Contact route: same-origin check, size-limited JSON, zod validation, honeypot, rate limit, send-once idempotency, escaped HTML, no personal data in logs.
- Public pages cannot reach drafts/archived items; admin-only columns never selected; product JSON-LD contains only real data (no invented ratings or reviews).
- Pages are rendered per request (no caching) to keep price and stock correct; the database queries are paginated and indexed (the Phase 1 GIN index covers search). Caching strategy is a Phase 9 item with the hosting decision.

## 8. Phase 4 readiness

Ready: the storefront reads everything through one data layer, so Phase 4 schema work (variants, image cleanup, inventory) has a single place to adapt.

Please decide / supply (also in `docs/DECISIONS.md`):
1. Approve or amend the Phase 3 design and copy (About, commitments, "How ordering works").
2. Confirm category names and slugs (and whether database category descriptions may be shown).
3. Confirm the second phone number and opening hours.
4. Policy and FAQ content (delivery, returns, privacy, terms), and delivery zones/fees.
5. Real products, packshots, logo, hero/facility photography.
6. Whether product variants (pack sizes) are needed in Phase 4 (D-8), and the stock reservation rule (D-7).
7. Hosting choice (D-10).

**Stopping here until you approve Phase 4.**
