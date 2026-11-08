# Phase 4 completion report — Product catalogue, database integrity and inventory

Status: **implementation complete; awaiting your approval before Phase 5.** I have not started Phase 5. "Verified" means I ran it in this session. Migration 06 has **not** been applied to your real Supabase project (this environment cannot reach it): see section 7.

After copying the code run **`npm install`** (no dependency was added in Phase 4, but run it anyway after copying), then `npm run dev`. Before the admin screens work you must apply migration 06 (section 7).

---

## 1. Schema changes (migration `20261025010000_catalogue_management.sql`)

Additive, re-runnable, deletes nothing. Full rationale: `docs/CATALOGUE.md`.

- **categories:** `is_active`; case-insensitive unique name; the foreign key from products is now `ON DELETE RESTRICT` (it used to silently set products' category to null).
- **products:** `currency`, `created_by`, `updated_by`, `version` (optimistic locking), `low_stock_threshold`, and a derived `status` (draft / published / archived) computed from the existing `is_active` + `archived_at` (no second source of truth); case-insensitive unique SKU; price/stock/weight/title/slug CHECK constraints; index on status.
- **Rules as triggers (hold for every writer, including the SQL editor and the service role):** publication requirements (name, slug, description ≥ 10 characters, price > 0, **active** category, cover image); exactly one cover on a published product; slug locked while published; archived products read-only; no deletion of live or ordered products; a category cannot be deactivated while live products use it, and a product cannot be published into an inactive category.
- **Admin functions (15):** `admin_save_product`, `admin_set_product_status`, `admin_delete_product`, `admin_adjust_stock`, `admin_set_stock`, `admin_save_category`, `admin_delete_category`, `admin_add_product_image`, `admin_set_cover_image`, `admin_reorder_product_images`, `admin_update_image_alt`, `admin_remove_product_image`, `admin_list_products`, `admin_get_product`, `admin_list_categories`.
- **Privacy:** the public role can no longer read `sku`, `created_by`, `updated_by`, `version`, `low_stock_threshold`, `status` or `image_urls`; inactive categories are invisible to visitors (RLS).
- **Audit:** product/category/image changes are written to `audit_log` with the real actor; stock changes to `inventory_movements`.
- **Not changed:** `products.image_urls` stays (deprecated, unused, unreadable to the public). I need your approval to drop it.

## 2. Product operations

Create draft · edit (stale-edit protection, duplicate name/slug/SKU messages, strict server validation: prices ≤ 2 decimals, ranges, single-line titles, unknown fields rejected) · publish / unpublish / archive / restore (the database returns what is missing and the screen lists it in words) · delete (only a product that is not live and appears in no order) · category create / edit / activate / deactivate / delete.

## 3. Image handling

Signed direct upload to Cloudinary → server-side confirmation against Cloudinary itself (format, size ≤ 5 MB, our account, fresh upload) → recorded through `admin_add_product_image`. First photo becomes the cover; one cover always; reorder (buttons), change cover, alt text, remove. Removal deletes the database row first and the Cloudinary file only afterwards and only if no other row uses it. A published product cannot lose its last photo. Orphan script hardened: it now refuses to delete a file a product still uses (the tag is removed after the database insert, so a failed untag could otherwise have exposed a live photo).

## 4. Inventory

Atomic relative adjustments under a row lock (reasons: restock, adjustment, return, correction), stocktake (`set`), never below 0 or above 1,000,000, every change in the `inventory_movements` ledger with actor and note, history shown on the product screen. The existing rule is unchanged (D-7): stock is decremented on **verified payment**; checkout and payments were not touched. Stock updates do not re-check publication rules, so a sale can never fail because of catalogue content.

## 5. Security

- Admin routes: same-origin → rate limit → signed in → `profiles.role = 'admin'` → UUID ids → strict zod → database function running **as the signed-in admin** (not the service role; the function checks `is_admin()` itself).
- `/admin` pages: anonymous → sign-in; customer → plain 404; `noindex`; disallowed in robots.txt.
- Verified: customer gets 403 and anonymous 401 from every admin endpoint tested; cross-site POST refused; customer cannot obtain an upload signature; a refused request creates nothing.
- No secret appears in the client bundle (scan of `.next/static`).
- Weaknesses that remain: rate limiting is still in-memory (Phase 9, D-9); no CSP yet (Phase 9).

## 6. Files changed

New: `supabase/migrations/20261025010000_catalogue_management.sql`, `supabase/rollback/…down.sql`; `src/lib/admin/{schemas,db-errors,route,catalogue,thumb}.ts`; `src/app/api/admin/**` (7 routes); `src/app/admin/**` (layout, products list, new, edit with image/publication/stock panels, categories); `src/components/ui/ConfirmDialog.tsx`; `tests/db/catalogue.test.ts`, `tests/unit/admin.test.ts`; `scripts/lib/orphans.mjs`; `scripts/qa/{admin-gateway,admin}.mjs`; `docs/{CATALOGUE,PHASE_4_REPORT}.md`.
Modified: `src/app/api/uploads/confirm/route.ts` (now acts as the admin through the database function); `src/lib/catalogue/data.ts` (no longer selects `image_urls`; active categories only; legacy image fallback removed); `scripts/cloudinary-orphans.mjs`; `scripts/qa/mock-supabase.mjs` (now enforces the public column grants and hides inactive categories); tests (`security`, `payments`, `app-contract`, `helpers`, `integrations`, `storefront`) adapted to the publication rules; `docs/{DATABASE,DECISIONS,INTEGRATIONS}.md`.

## 7. Migrations, and whether they were applied

- **Applied to the real Supabase project:** migrations 01–05 (your confirmation). **Migration 06: NOT applied.** I cannot reach your project.
- Verified on a scratch PostgreSQL 16 loaded with the real baseline dump + 01–05: 06 applies cleanly; the rollback script runs and keeps every row; 06 re-applies after rollback and can be run a further time on top of itself without error.
- **Order for production (details in `docs/CATALOGUE.md`):** back up → deploy the Phase 4 code → run migration 06 → sign in as admin. Do **not** run 06 under the Phase 3 code (it reads `image_urls`, which 06 makes unreadable to the public role, and the shop would error).
- After 06, any live product without a photo or category keeps selling but cannot be edited until it has them: check with the query in `docs/CATALOGUE.md`.

## 8. Tests (actual results)

| Check | Result | Against |
|---|---|---|
| `tsc --noEmit`, `npm run lint` | clean | — |
| `npm run build` | succeeds | — |
| Unit tests | **106 / 106** (75 before) | mocks |
| Database tests | **178 / 178** (100 before; 78 new in `catalogue.test.ts`) | **real PostgreSQL 16** |
| Admin browser QA (`scripts/qa/admin.mjs`) | **74 / 74** | real PostgreSQL via a QA gateway (fake Auth) |
| Storefront browser QA | **74 / 74** | mock catalogue that now enforces the column grants |
| Visual + accessibility (axe WCAG 2.2 AA), 5 viewports | **463 / 463** | mock catalogue |
| Admin pages axe (list, edit, categories; desktop and 390 px) | 0 violations | gateway |
| `npm run smoke` | all pass | prod build |
| Secret scan of the client bundle | none found | — |

**Real-database tests cover:** lifecycle and every publication rule; stale edits (two concurrent saves: exactly one wins); duplicate names/slugs/SKUs; category rules; image rules (single cover, reorder, last-photo, cascade); stock (10 concurrent restocks all apply exactly once; 8 concurrent removals never go below zero; ledger; actor attribution); authorisation (anon, customer, admin, service role) and column privacy; audit actor; migration idempotence and rollback.
**Mock-based:** unit tests of validation, error mapping, route authorisation order and the Cloudinary/confirm logic (Cloudinary is mocked).

**Defects found by this QA and fixed:** (1) reorder failed through the API for array arguments (QA-gateway bug, fixed there; the app was correct); (2) a page past the end of the admin product list showed a misleading "No products yet" (now redirects to the last page); (3) the delete-draft dialog described the rule wrongly (the database blocks live or ordered products only); (4) the edit page's right-hand column overflowed the page once photos existed and the categories table leaked an invisible element past its scroll area (both fixed, checked at 1280 px and 390 px); (5) empty SKU from the form was rejected instead of meaning "no SKU"; (6) the orphan script could have deleted a live photo whose tag removal had failed.

## 9. Known limitations — **not verified**

- **Migration 06 on your real Supabase project** — not run. Behaviour of PostgREST's column-level privileges and RLS on the real service is expected but unconfirmed; `npm run test:live` (read-only) should be run once it is applied.
- **Real Cloudinary:** signing, the browser upload, server confirmation and deletion were tested only with mocks and with seeded image rows. The actual network round trip is untested (api.cloudinary.com is unreachable here). **Please upload one real photo as the first check.**
- **Real Supabase Auth:** the admin screens were exercised through a QA gateway with fake sessions; the real sign-in flow and the first-admin promotion (`docs/DATABASE.md`) were not.
- Cloudinary orphan sweep needs `SUPABASE_SERVICE_ROLE_KEY` to delete; its network calls are unverified (pure logic is unit-tested).
- No bulk import and no drag-and-drop ordering; no image cropping tool; no product-level audit viewer in the UI (data is in `audit_log`).
- Rate limiting is per server instance (in-memory).
- **Variants are not built** (decision D-19; design in `docs/CATALOGUE.md`). All products are one sellable unit with one price and one stock count.
- The catalogue is empty until you add products; no product, category, price or photo was invented.

## 10. Phase 5 readiness

Ready, provided you apply migration 06 and confirm the first admin can sign in. Phase 5 (authentication and account security) can build on: server-side role checks (`requireRole`), the profile/role guard from Phase 1, the admin gating pattern, and the real-database test harness. Needs from you:

1. Approval to apply migration 06 (and the order in section 7), and confirmation once applied.
2. Category names and slugs (official), and your first products with photos.
3. Variants decision (pack sizes) before Phase 6.
4. Approval to drop `products.image_urls`.
5. Still open from earlier phases: delivery zones and fees, policies/FAQ wording, second phone number, logo/photography, hosting, e-mail sender domain.
