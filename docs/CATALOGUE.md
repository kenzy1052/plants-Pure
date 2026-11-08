# Catalogue management (Phase 4)

How products, categories, photos and stock are modelled, changed and protected. Everything here is enforced in PostgreSQL (migration 06); the admin screens and API are convenience on top. A direct call to the database API, the SQL editor or the service role cannot skip the rules either.

## Product lifecycle

`draft → published → archived`, and `archived → draft`. The status is **derived** from two existing columns, so there is no second source of truth:

| Status | `is_active` | `archived_at` | In the shop? |
|---|---|---|---|
| draft | false | null | no |
| published | true | null | yes |
| archived | false | set | no (kept for old orders) |

**To publish** a product must have: a name, a web address (slug), a description of at least 10 characters, a price above GH₵ 0, an **active** category, and at least one photo with exactly one cover. If anything is missing the database refuses with `PUBLICATION_REQUIREMENTS` and a list of what is missing; the admin screen shows that list in words. A published product can never lose its last photo, its cover, or have its category deactivated.

**Other rules:** the slug is locked while published (links must not break); an archived product is read-only until restored to draft; a product cannot be deleted while live or if it appears in any order (archive it instead); category names are unique ignoring case; a category cannot be deleted while products use it, or deactivated while live products use it.

**Stale edits:** every product has a `version`. Saving sends the version it was based on; if someone else saved first, the save is refused (`STALE_PRODUCT`) rather than overwriting. Stock changes do not bump the version (they are relative and safe to interleave).

## Photos

Upload path: browser → `/api/uploads/sign` (admin only, short-lived signature) → Cloudinary directly → `/api/uploads/confirm`. The server then asks Cloudinary what was really uploaded (format, size, address, "unconfirmed" tag), rejects and deletes anything that breaks the rules (JPG/PNG/WebP, ≤ 5 MB, our own account, fresh upload), and records it through `admin_add_product_image` (first photo becomes the cover). Removal deletes the **database row first**; the Cloudinary file is deleted only afterwards and only if no other row uses it. A failed Cloudinary delete is reported, never fatal. Order, cover and alt text are changed with buttons (keyboard and touch friendly), not drag and drop.

Abandoned uploads stay tagged `unconfirmed`. `scripts/cloudinary-orphans.mjs` lists those older than 24 h (dry run by default); `--delete` removes them **only** after confirming in the database that no product uses them (it refuses to delete without database access).

## Stock

Every product is stock-tracked. Stock changes only through `admin_adjust_stock` (relative, under a row lock, reasons: restock / adjustment / return / correction), `admin_set_stock` (stocktake) or a verified payment (`sale`, Phase 1 rule D-7: stock is decremented on verified payment, not reserved at checkout). Every change writes a row to `inventory_movements` (delta, stock after, reason, note, actor). Stock cannot go below 0 or above 1,000,000. Two admins adjusting at once both apply.

## Security model

- Admin operations are `admin_*` SQL functions, `SECURITY DEFINER` with an empty `search_path`, executable by `authenticated` only and gated by `is_admin()` on the **caller's** JWT. The API calls them with the signed-in admin's own session (not the service role), so `auth.uid()` and the audit log name the real person.
- API routes (`/api/admin/*`, `/api/uploads/*`) check, in order: same origin, per-IP rate limit, signed-in, `profiles.role = 'admin'` (never user metadata), UUID path ids, strict zod validation (unknown fields are rejected, not ignored), then call the database.
- `/admin` pages are gated on the server: anonymous → sign-in; signed-in non-admin → plain 404. `noindex`, and `/admin` is disallowed in `robots.txt`.
- The public role can read only an explicit list of product columns (`sku`, `created_by`, `updated_by`, `version`, `low_stock_threshold`, `status`, `image_urls` are not readable). Inactive categories are invisible to visitors. Admins read through `admin_list_products`, `admin_get_product`, `admin_list_categories`.
- Audit: product, category and image changes are written to `audit_log` with the actor; stock changes to `inventory_movements`.

## Admin screens (`/admin`)

Products (search, status and category filters, pagination, low-stock/out-of-stock labels) · New product · Edit product (details, publication checklist and actions, photos, stock and history) · Categories. Destructive actions (delete, archive, unpublish, remove photo, delete category) ask for confirmation. This is the Phase 4 catalogue tool only; orders, customers, promotions and homepage content are Phase 7.

## Applying migration 06 to the real Supabase project (needs your approval)

Nothing has been run against production. Order matters:

1. **Back up** (Supabase → Database → Backups, or `pg_dump`). The Free plan has no point-in-time recovery.
2. **Deploy the Phase 4 code first.** It reads only columns that exist both before and after migration 06, so the storefront keeps working. (The Phase 3 code reads `products.image_urls`, which migration 06 makes unreadable to the public role: do **not** apply 06 under old code.)
3. SQL Editor → run `supabase/migrations/20261025010000_catalogue_management.sql`. It is re-runnable and deletes nothing.
4. Check: `select status, count(*) from public.products group by 1;` — existing live products show `published`; and that every published product has a category and a cover image. A live product that lacks a photo or an active category keeps selling and its stock still updates (the rules are deliberately not checked on stock changes, so a sale can never fail because of catalogue content), but editing its name, slug, description, price or category, or re-publishing it after unpublishing, is refused until it meets the rules. Add the photo/category first.
5. Sign in as an admin (promotion process in `docs/DATABASE.md`) and open `/admin/products`.

Rollback: `supabase/rollback/20261025010000_catalogue_management.down.sql` (keeps all data and the new columns, removes functions/triggers, restores the Phase 1 privileges). Rolling back the **code** to Phase 3 requires the rollback script first.

## Variants (pack sizes): deferred, with a design

The brief asks for variants "where relevant", and the owner answered "additive and optional". They are **not** built in Phase 4: the Phase 4 scope omits them and they cannot be added safely without changing the cart, checkout, stock deduction and order items (Phase 6). Proposed design, so Phase 6 can build it without rework:

- `product_variants(id, product_id, sku unique, label, price, weight_grams, stock, is_active, position)`; a product with no variants behaves exactly as today (a single implicit variant).
- Stock and price live on the variant; `products.stock/price` become the single-variant case (or are derived).
- Cart line key becomes `product_id + variant_id`; `create_checkout_order` takes `variant_id`, locks that row, and snapshots variant label/SKU/price into `order_items` (new nullable `variant_id`, `variant_label`).
- `inventory_movements` gains `variant_id`.
- Publication rule: a product with variants needs at least one active variant with price above zero.

Decision needed from the business: are there real pack sizes (e.g. 50 g / 100 g)? Please supply them with prices.

## How the admin screens were tested

`scripts/qa/admin-gateway.mjs` is a QA-only stand-in for Supabase's HTTP API on top of a **real PostgreSQL** database built from the migrations: it resolves two fixed test users, answers the profile read, and runs `public.<fn>` as role `authenticated` with that user's claims. `scripts/qa/admin.mjs` then drives the production build with Chromium. It does **not** exercise real Supabase Auth, PostgREST, or Cloudinary.
