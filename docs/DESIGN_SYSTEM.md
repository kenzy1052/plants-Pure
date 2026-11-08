# Design system — "Specimen Index"

Phase 2 of the Plants & Pure rebuild. This is the single reference for how the storefront looks and behaves. If this file and the code disagree, the code wins and this file is a bug.

---

## 1. Art direction

**Idea.** A spice or herb is catalogued the way a botanist's specimen is: numbered, named, labelled, laid out on a clean sheet. The interface borrows that structure, not the botany clichés (no leaves, no green, no watercolour textures).

| Element | Treatment |
|---|---|
| Ground | Warm stone paper (`#f3f0e9`), with a slightly deeper linen (`#e9e4d8`) for alternate bands and image wells |
| Ink | Blue-black (`#16191d`) for text and the primary action |
| Accent | **Saffron** (`#e3a21a`). One conversion action per view, the "Featured" badge, the wordmark ampersand, focus colour on dark grounds. Never a large background. |
| Dark ground | One warm near-black, "clove" (`#2b1e1a`), used for the story band and footer only |
| Display type | Instrument Serif (condensed, editorial), regular and italic. Italic is used for one emphasised word per headline. |
| UI type | Hanken Grotesk (variable), for body, labels, buttons |
| Structure | Thin hairline rules, index numerals (`01 — Collection`), generous space, a 12-column grid with asymmetric splits. Almost no shadows, almost no rounded corners (4 px controls, pill only for chips and badges). |

**Why it is different from the original site.** The original uses a muted green (`#4a7c59`), a centred hero, four icon feature blocks and rounded category cards. This system shares none of: palette, type, layout, composition or component shapes. What it keeps is the real content: name, descriptor, categories, story, commitments, contact details.

**Honesty rules baked into the components**
- A struck-through price appears only if the database holds a `compare_at_price` greater than `price`.
- "Sold out" appears only when `stock <= 0`. There is no "only 3 left", countdown, rating, review count or "bestseller" anywhere, because none of that data exists.
- Detail sections on a product page (flavour notes, how to use, ingredients) render only when the product has that data.
- Empty and error states say what is true ("The collection is being prepared") and give the real phone number / e-mail.
- Story and commitment copy on the home page is the company's published wording from the original site. **It still needs the business's approval** (open question in `docs/DECISIONS.md`).

---

## 2. Tokens

Defined once in `src/app/globals.css`. Two layers:

1. **Palette** (`--p-*` in `:root`): raw values. Never used directly in components.
2. **Semantic** (`@theme`): what components use. Tailwind generates utilities from these (`bg-background`, `text-text-muted`, `border-border-strong`, `bg-accent`…). Tailwind's default palette is removed (`--color-*: initial`), so an arbitrary colour cannot be used by accident.

### Colour (semantic)

| Token | Value | Use |
|---|---|---|
| `background` | paper | Page |
| `background-alt` | linen | Alternate band, image wells, hover wells |
| `surface` | card `#fbf9f4` | Inputs, order summary, anything lifted |
| `inverse` | clove | The dark band and the footer |
| `text` / `text-secondary` / `text-muted` | ink / `#41474d` / `#5f656a` | Primary / supporting / metadata text |
| `text-inverse` / `text-inverse-muted` | paper / `#c9c3b5` | Text on dark |
| `border` / `border-strong` | `#d6d0c2` / `#8f8878` | Decorative rules / control borders |
| `action`, `action-hover` | ink, black | Primary button |
| `accent`, `accent-hover`, `accent-ink` | saffron, `#f0b73a`, `#7a4f00` | Accent ground; accent as **text** on light |
| `success`, `warning`, `danger` (+ `-soft`) | `#2b6a3b`, `#8a5200`, `#ae2a1f` | States, always with words, never colour alone |
| `disabled`, `disabled-text` | `#ddd8cb`, `#5c5748` | Disabled controls |
| `overlay` | ink at 55 % | Behind drawers |

**Contrast (computed, WCAG 2.2):** text on paper 15.5:1; secondary 8.3:1; muted 5.2:1 (4.65:1 on linen); accent-ink 6.3:1; ink on saffron 7.9:1; disabled text 5.1:1; form borders 3.1:1 (3:1 is the non-text minimum).

**Anti-repetition rules**
1. One accent button per view.
2. Dark clove ground appears at most once in the page body, plus the footer.
3. Never put two coloured (non-neutral) panels next to each other.
4. Section grounds alternate paper → linen → clove with a reason (story = clove, contact = linen); no gradients, no glow, no glassmorphism.
5. Saffron is never used for body text on a light ground; use `accent-ink`.

### Type scale (fluid)

| Utility | Range | Used for |
|---|---|---|
| `text-display` | 52 → 128 px | Home hero only |
| `text-h1` | 40 → 80 px | Page titles |
| `text-h2` | 32 → 56 px | Section headings |
| `text-h3` | 24 → 34 px | Sub-headings, ledger values, prices (large) |
| `text-product` | 22 px | Product names |
| `text-lead` | 18 → 22 px | Intro paragraphs |
| `text-body` / `text-small` / `text-caption` | 16 / 14 / 12 px | Text, metadata, hints |
| `.eyebrow` | 12 px caps, 0.14 em | Labels, index numerals (always sans) |
| `.numeral` | tabular figures | Prices, quantities, order numbers |

Fonts are self-hosted through `next/font/local` (`src/app/layout.tsx`, files in `src/app/fonts/`, SIL OFL licences alongside). Total font transfer is about 76 KB, with size-adjusted fallbacks so text does not jump when the fonts load (measured layout shift 0.00 on home and shop, 0.006 on a product page).

### Spacing, layout, shape, depth, motion

- `container-page` (max 87 rem, fluid gutter `clamp(1rem, 0.4rem + 2.6vw, 2.75rem)`), `section-space` and `section-space-sm` (fluid vertical rhythm). Pages need only these three.
- Radii: `none`, `xs` 2 px, `control` 4 px, `pill`. Shadows: `overlay` (drawers) and `lift` (reserved). z-index: header 40, overlay 50, drawer 60, toast 80.
- Durations 120 / 220 / 420 / 700 ms; easings `settle` (entrances) and `standard` (state changes).

---

## 3. Component inventory

All in `src/components/ui/` unless stated. Every one is a plain function component with no animation library.

| Component | Notes |
|---|---|
| `Button`, `ButtonLink`, `buttonStyles()` | Variants primary / accent / secondary / quiet; sizes sm (36 px), md (44 px), lg (56 px). `loading` sets `aria-busy` and disables. |
| `Field`, `Input`, `Select`, `Textarea` | Label always visible, hint, error (`role="alert"`, linked by `aria-describedby`), required marker plus screen-reader "(required)". |
| `Badge` | Neutral / accent / success / warning / danger / outline. |
| `Price` | Uses `formatGHS`; compare-at price only when real, with an sr-only "Was". |
| `QuantityStepper` | 44 px targets, labelled, polite live value. |
| `ProductCard` | 4:5 image frame, stretched link on the name, weight (if present), price, Add to cart; sold-out state; `fit` cover/contain for lifestyle vs packshot photos; missing image → neutral placeholder, never a stock photo. |
| `Skeleton`, `ProductCardSkeleton` | Decorative, hidden from assistive tech; the parent announces "Loading". |
| `EmptyState` | Neutral (`role="status"`) or error (`role="alert"`) with an optional next step. |
| `Breadcrumbs` | `nav` + ordered list, current page `aria-current`. |
| `Drawer` | Native `<dialog>` (`showModal`): real focus trap, Escape, inert background, focus returns to the opener, backdrop click and scroll lock. Sides right / left / top. |
| `Navbar` | Sticky; wordmark, Shop, search sheet (real GET search), account, cart with real count. Mobile menu in a left drawer. |
| `Footer` | Content only from `src/lib/constants/business.ts` (phone, e-mail, hours, location, Instagram, Facebook). |
| `Wordmark` | Typeset stand-in. **Replace with the real logo when supplied; it is not a redrawn logo.** |
| `SectionHeading`, `Reveal` | Index numeral + eyebrow + serif heading; scroll reveal (see §5). |
| `components/cart/CartDrawer`, `CartHydrator` | Cart panel with empty state, steppers, subtotal and Checkout. `CartHydrator` loads the saved cart after first paint. |

**Navigation contains only pages that exist** (Shop, Account). Categories, About, Contact, FAQs and policy pages are Phase 3; none were added as dead links or decorative controls.

**Dev-only reference:** `/design-system` shows every token and component state with clearly labelled sample data. It returns 404 in production builds (verified).

---

## 4. Responsive behaviour

Mobile-first. Checked at **360, 390, 768, 1024 and 1440 px**.

| Area | Mobile | Tablet | Desktop |
|---|---|---|---|
| Header | Menu button (left drawer), wordmark, search, cart | Same | Inline nav, search, account, cart |
| Home hero | Headline, CTAs, then the category index | Same, wider | Headline left, category index right |
| Product grid | 2 columns | 2–3 | 4 |
| Product page | Gallery, then details | Same | Two columns, gallery sticks below the header |
| Checkout | Form, then summary | Same | Form left, summary right and sticky |
| Targets | All buttons, inputs, steppers and chips ≥ 44 px | | |

No page creates horizontal scroll (guarded by `overflow-x: clip` on `body` and checked by the QA script).

---

## 5. Motion specification

Principles: motion explains state; nothing essential depends on it; no animation library.

| Motion | Spec |
|---|---|
| Scroll reveal | Opacity + 14 px rise, 700 ms `settle`, once. **Only elements below the fold are armed**; anything visible at load is never hidden. IntersectionObserver only (no scroll listeners). |
| Drawers | Slide 420 ms `settle`; closing is instant so it never delays the user |
| Cart count | 220 ms "bump" only when the count really changes |
| Product image | 3 % zoom on hover, 420 ms |
| Skeleton | Soft shimmer while data loads |
| Buttons | 120–220 ms colour change; 1 px press |
| Reduced motion | `prefers-reduced-motion: reduce` removes the reveal, shimmer, slide and bump and all transitions |

**3D and parallax: deliberately not implemented in Phase 2.** The brief allows 3D only when it supports the real products. There are no product or packaging photographs yet, and a 3D object would have to be invented (which the brief forbids). Plan for Phase 8: (1) obtain product packshots; (2) if justified, a single lightweight scroll-linked product reveal with CSS transforms or one small WebGL scene, lazy-loaded, disabled on low-power devices and reduced motion, with the static image as the fallback; (3) measure before and after.

---

## 6. Accessibility

Built in: skip link; a single `<main>`; one `h1` per page; visible focus ring on every interactive element (colour flips to saffron on dark grounds); labels on all inputs; errors announced and described; dialogs are native; `aria-current` on navigation and breadcrumbs; live regions for result counts and cart changes; no information by colour alone; text 16 px minimum for body.

Fixed during QA: the product-card button's accessible name now begins with its visible text (WCAG 2.5.3 Label in Name): `Add to cart: <product>`.

Bugs found and fixed during QA, worth remembering:
- `tailwind-merge` treated our type-scale utilities (`text-small`) as colours and silently removed `text-text-inverse`, producing ink-on-ink button labels that automated axe checks did not flag. `cn()` in `src/lib/utils.ts` now knows the scale, and `tests/unit/cn.test.ts` guards it. The QA script also computes the contrast of every link and button label.
- `.eyebrow` headings inherited the serif from `h2`; the class now sets the sans family.

---

## 7. Performance and cost

- Production build, mobile viewport, warm cache, **uncompressed** transfer: home ≈ 51 KB HTML + 51 KB CSS + 822 KB JS + 76 KB fonts; shop and product similar. This is measured in the sandbox against local data, with no CDN compression; real-device figures remain to be measured in Phase 9. JavaScript is dominated by React, Next and the Supabase client; no 3D or animation libraries are loaded.
- Images use `next/image` with explicit `sizes`; the first four product cards load with priority, the rest lazily.
- $0: Instrument Serif and Hanken Grotesk are OFL, `lucide-react` is the only icon set, no new runtime dependency was added. Dev dependencies added: `playwright-core` and `axe-core` (open source) for QA.

---

## 8. Assets needed from the business (nothing has been invented)

| Asset | Why | Spec |
|---|---|---|
| **Real logo** (vector or high-res PNG, light and dark versions) | Replaces the typeset `Wordmark` | SVG preferred |
| **Product packshots**, one per product, consistent lighting | Product cards and pages | 4:5, at least 1600 px tall, plain background (`fit="contain"`) or lifestyle (`fit="cover"`) |
| **Hero photograph** of the real products | The hero is type-led until this exists | 4:5 for mobile, 16:9 for desktop |
| **Production-facility photograph** (the original site hosts one) | Story section | 3:2, at least 1800 px wide |
| **Alt text** for each image | Accessibility | One sentence describing what is shown |

---

## 9. QA — how to repeat the checks

```bash
npm install
npm run build && npm run start                    # production server
node scripts/qa/mock-supabase.mjs &               # sandbox only: fake "QA ..." records
node scripts/qa/visual.mjs http://localhost:3000 qa-output
QA_PAGES=/design-system node scripts/qa/visual.mjs http://localhost:3001 qa-output   # against `next dev -p 3001`
```

Against real Supabase, drop the mock and point `NEXT_PUBLIC_SUPABASE_URL` at your project. The script checks, for each page at 5 widths: HTTP status, horizontal overflow, console errors, axe-core (WCAG 2.0/2.1/2.2 A and AA), and saves a full-page screenshot; then keyboard behaviour of the cart and search dialogs, the checkout flow with a saved cart, and link/button label contrast.

## 10. Phase 3 additions and what remains

Added in Phase 3: `Pagination`; shop filter/sort controls (inline chips + sort menu from `md`, a "Filter & sort" drawer below it); product gallery with runtime image fallback; contact form fields (`Field` now accepts a stable `id`, the label is always bound to the control); branded 404 and error pages. See `docs/STOREFRONT.md`.

Still open: FAQ and policy pages (need business text), real photography and logo, 3D/parallax (Phase 8), editorial content.
