# Phase 2 completion report — Brand art direction, design system and UI foundation

Status: **implementation complete; awaiting your approval before Phase 3.** Everything marked "verified" below was actually run; everything not run is listed under "Not verified".

After copying this code into your folder, run **`npm install`** (two dev dependencies were added: `playwright-core`, `axe-core`), then `npm run dev`.

---

## A. Art direction summary

"Specimen Index": a spice catalogued like a botanical specimen: numbered sections, hairline rules, an editorial serif for display, a clean grotesk for interface text. Warm stone paper, blue-black ink, **one** saffron accent and a single dark clove band. Nothing from the original site's look survives (its muted green, centred hero, four feature blocks and rounded category cards): the palette, type, composition and component shapes are all new; only the real content (name, descriptor, categories, story, commitments, contact details) is preserved.

The home hero is type-led. No genuine product or hero photograph exists yet, and inventing products, packaging or 3D objects is forbidden by the brief. Full rationale and rules: `docs/DESIGN_SYSTEM.md` §1.

## B. Design tokens (locations)

- `src/app/globals.css`: palette (`--p-*`), semantic colours, type scale, radii, shadows, z-index, motion tokens, helpers (`container-page`, `section-space`, `.eyebrow`, `.numeral`, skip link, reveal, skeleton, reduced-motion block).
- `src/app/layout.tsx` + `src/app/fonts/`: self-hosted Instrument Serif and Hanken Grotesk (SIL OFL, licences included).
- Computed contrast pairs and the anti-repetition rules: `docs/DESIGN_SYSTEM.md` §2.

## C. Component inventory

Button/ButtonLink, Field/Input/Select/Textarea, Badge, Price, QuantityStepper, Skeleton/ProductCardSkeleton, EmptyState, Breadcrumbs, Drawer (native `<dialog>`), Navbar, Footer, Wordmark (typeset stand-in), SectionHeading, Reveal, ProductCard, CartDrawer, CartHydrator. Table with behaviour notes: `docs/DESIGN_SYSTEM.md` §3. A development-only `/design-system` page shows every state and returns 404 in production (verified).

Header navigation contains only pages that exist (Shop, Account). Search is a real GET search into `/shop?q=`. The cart count is the real cart state. There are no decorative controls.

## D. Responsive behaviour (viewports actually tested)

360, 390, 768, 1024 and 1440 px, in headless Chromium. Behaviour per area: `docs/DESIGN_SYSTEM.md` §4. No horizontal overflow at any size on any page tested.

## E. Motion specification

`docs/DESIGN_SYSTEM.md` §5. Scroll reveal (below-the-fold only, IntersectionObserver, once), drawer slides, cart-count bump, image hover zoom, skeleton shimmer; all disabled under `prefers-reduced-motion`. No animation library. **3D and parallax were deliberately deferred**, with the reason and a Phase 8 plan documented.

## F. Accessibility and performance findings (checks actually run)

- **axe-core (WCAG 2.0/2.1/2.2 A + AA)**: 0 violations on every page at every viewport, after one fix: the product-card button's accessible name now starts with its visible text (WCAG 2.5.3).
- **Contrast**: computed token pairs (all ≥ 4.5:1 for text; form borders 3.1:1), plus a script that measures every link/button label on four pages. It exposed one real bug (below) and one low-contrast disabled label, now fixed.
- **Keyboard**: skip link is the first Tab stop; Enter opens the cart dialog, Escape closes it, focus returns to the cart button; the search sheet opens with its input focused and submits to `/shop?q=`; adding to cart opens the drawer and updates the count.
- **Performance** (production build, mobile viewport, local data, uncompressed transfer): home ≈ 51 KB HTML, 51 KB CSS, 822 KB JS, 76 KB fonts; layout shift 0.00 (home, shop), 0.006 (product). JavaScript size is dominated by React, Next and the Supabase client. This is a sandbox measurement without CDN compression; real-device and Lighthouse numbers belong to Phase 9.

**Bugs found by this QA and fixed (not cosmetic)**
1. `tailwind-merge` mistook our type-scale classes (`text-small`, `text-body`) for colours and silently dropped `text-text-inverse`, so every primary button had ink text on an ink background. axe did not flag it. Fixed in `cn()`, guarded by `tests/unit/cn.test.ts`, and the QA script now measures label contrast.
2. Product-card button name did not contain its visible text (above).
3. Section labels (`.eyebrow`) on `<h2>` rendered in the serif.
4. Mobile product page: the Add-to-cart button collapsed to a thin bar.
5. The saved cart included the drawer's open/closed state and was read before first paint (hydration mismatch risk, "empty cart" flash). Now only items are saved, and the cart loads after first paint; checkout shows a loading state until then.

## G. Files changed

Full list: `git show --stat a19f443`. In summary:

- **New:** UI primitives (`src/components/ui/*`), `CartHydrator`, `use-products`, `home-products`, `shop/shop-client`, `design-system` route, fonts, `docs/DESIGN_SYSTEM.md`, `tests/unit/cn.test.ts`, `scripts/qa/*`.
- **Rewritten (presentation only):** home, shop, product, checkout (form and summary), checkout callback, sign-in/up/reset forms, account and profile form, navbar, footer, cart drawer, product card, `globals.css`, `layout.tsx`.
- **Small logic changes (all intended):** shop filters now live in the URL (`?q=&category=&sort=`) and category chips work; cart store persistence as above; `business.ts` gained the published story and commitments wording and category DB slugs.
- **Not touched:** database schema and migrations, authentication logic, Paystack/webhook/payment logic, the API routes, email, Cloudinary. The payment and RPC contract tests still pass.

**Content decisions to know about**
- Removed from the product page: the hard-coded "Natural ingredients" and "No artificial preservatives or additives" icons (they appeared on every product regardless of its data) and the "Culinary & Wellness Guide" label (a health-adjacent claim). Product sections now appear only when the product has that data.
- The home hero says "Spices, herbs and natural oils from Accra." I avoided "made in Accra", which is not published.

## H. Verification results (all executed in this session)

| Check | Result |
|---|---|
| `tsc --noEmit` | Clean |
| `npm run lint` | Clean (0 errors, 0 warnings) |
| `npm run build` | Succeeds |
| Unit tests | **57 / 57 pass** (55 existing + 2 new) |
| Database tests (scratch PostgreSQL 16) | **100 / 100 pass**, including the app↔DB contract test |
| `npm run smoke` against the production server | All checks pass |
| `/design-system` in production | 404 (verified) |
| Visual + accessibility script, production build, 5 viewports × 11 pages, plus keyboard, checkout-with-cart and contrast checks | **243 checks pass, 0 fail** |
| Same script on the dev-only `/design-system` page (dev server) | 24 checks pass, 0 fail (one overflow, a non-wrapping badge row, was fixed first) |
| `npm audit --omit=dev` | 0 vulnerabilities |

Method note: the sandbox cannot reach Supabase, so the browser checks ran against `scripts/qa/mock-supabase.mjs`, a tiny local stand-in serving clearly fake records (every name starts "QA ") to exercise long names, sold out, featured, compare-at price and missing images. That data never touches a real database and is not shipped in the app.

**Not verified (please treat as open):**
- Anything against your real Supabase data or real photographs; the live catalogue is empty, so the real-data look is unseen.
- Firefox, Safari and real phones (only headless Chromium was used).
- Screen-reader testing by a person (only automated axe and keyboard scripts).
- The mobile-menu drawer's keyboard behaviour specifically (cart and search dialogs were tested; the menu uses the same `Drawer`, but I did not test it separately).
- The account page and profile form visually (they need a signed-in session; they were converted and type-checked but not screenshotted), and the payment-callback "paid", "failed" and "cancelled" states (only the "unknown payment" state was rendered).
- Realtime stock updates (the mock has no websocket).
- Lighthouse and real-network performance.

## I. Phase 3 readiness

Ready: shell, tokens, primitives, product discovery, product page, checkout presentation.

Needs your input before or during Phase 3 (also in `docs/DECISIONS.md`):
1. **Approve or redirect the direction** (palette, fonts, "Specimen Index" idea).
2. **Approve the story and commitments wording** on the home page (it is the company's own published text from the original site; "Ethically sourced ingredients", "No artificial preservatives or additives" and similar are the company's claims and need your confirmation).
3. **Supply the assets** in `docs/DESIGN_SYSTEM.md` §8: real logo, product packshots, hero photograph, facility photograph.
4. **Confirm category names and slugs.** The home index links to `/shop?category=<slug>` using the database slugs (`culinary-spices`, `herbal-infusions`, `pure-botanical-oils`); the website's names are Spices, Herbs, Natural Oils.
5. Policy text (shipping, returns, privacy, terms) still needs business decisions; none was invented.

Phase 3 scope that this phase intentionally left out: category pages and navigation, About/Contact/FAQ/policy pages, pagination, related products, per-product SEO metadata and structured data, editorial content, removal of the unused `canvas-confetti` dependency.

**Stopping here until you approve Phase 3.**
