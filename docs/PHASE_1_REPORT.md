# Phase 1 Completion Report — Audit, Foundation and Hardening

Plants & Pure Limited · prepared 2026-10-21 · **Phase 1 only. Phase 2 has not been started and is waiting for your approval.**

**Headline:** the inherited demo was not safe to take payments (anyone could insert "paid" orders; the payment and webhook routes did not compile; the site invented customer activity and business claims). The foundation is now in place and tested against a real Postgres database and mocked integrations. **No live service was contacted** (Supabase, Paystack, Cloudinary and Resend are unreachable from this environment and the Paystack keys supplied were placeholders), so integration with those services is **unverified** and the database migrations have **not been applied to your real Supabase project**.

---

## 1. Audit findings
Full table in [`docs/AUDIT.md`](AUDIT.md). The ones that matter most:

- **Critical:** RLS policies "Anyone can create orders / order items" let anyone insert an order with `payment_status: "paid"`; the checkout page did exactly that from the browser after a client-side callback, with client-supplied prices and fees.
- **Broken:** `/api/payments/initialize` imported a module that did not exist and never called Paystack; the webhook did not compile.
- **Insecure:** Cloudinary signing endpoint was open to anyone for any folder; health endpoint leaked database error text.
- **Non-compliant content:** fake "A customer in Osu just purchased…" popups, invented footer claims, "healing/therapeutic" wording, a placeholder phone number, a placeholder WhatsApp number, a GH₵ 350 free-delivery promise nobody approved.
- **Missing:** authentication, profiles, tests, env validation, admin, any migrations.
- **Hygiene:** `.env.local` was inside the zip (rotate keys); `.gitignore` also ignored `.env.example`.
- **Original website** (checked 2026-10-20): name, 2020 founding, mission, three categories (Spices, Herbs, Natural Oils), email `plantsandpure@gmail.com`, phones +233 59 608 3867 and +233 20 875 6898, hours Mon–Sat 9–6, Accra, Instagram/Facebook. Shipping, returns, FAQ, privacy and terms are linked but **empty**; the catalogue currently shows **no products**.

## 2. Implemented changes
- **Database** (5 migrations): profiles + safe sign-up trigger, role protection, catalogue constraints, `product_images`, stock ledger, `delivery_zones`, orders/payments/webhook-ledger/email-log tables, a row-locked payment state machine, audit log, RLS on all 12 tables.
- **Config:** typed, validated env (names-only errors, placeholders = unset), fail-fast in production, `.env.example`, `npm run env:check`.
- **API foundation:** one error shape, zod validation, size limits, same-origin check, rate limiter, redacting logger, auth helpers, security headers, noindex/no-store for private paths, `x-powered-by` removed.
- **Auth:** sign-up, sign-in, sign-out, e-mail confirmation, password reset, session refresh in `proxy.ts`, protected `/account` with profile editing.
- **Payments:** `POST /api/payments/initialize`, `GET /api/payments/status`, `POST /api/webhooks/paystack`, `/checkout/callback` — server-priced, server-verified, idempotent.
- **Cloudinary:** admin-only signed uploads, folder allow-list, server-side verification, orphan-cleanup script.
- **Email:** Resend service with sandbox/live/off, send-once claim, escaped neutral templates.
- **Business source of truth:** `src/lib/constants/business.ts` with verified/unverified provenance; footer and header rebuilt from it.
- **Tooling:** typecheck, lint, unit + DB tests, `db:check`, smoke test, self-hosted fonts (build no longer needs Google).

## 3. Repairs to existing code
Checkout rewired to the server (no browser order insert, no inline Paystack script, DB delivery zones, e-mail required); cart-store mutation bug; inverted realtime DELETE filter (shop and home); `select *` → explicit columns; duplicate Supabase clients removed; fake social-proof removed; unverified claims and the free-delivery bar removed; demo image fallbacks replaced by a local placeholder; dead `setup.js` archived; health endpoint minimised; lint errors fixed.

## 4. Remaining gaps (not done in Phase 1, by design or blocker)
- Migrations **not applied to production**; no live test of Paystack, Cloudinary, Resend or Supabase Auth e-mail flow.
- No CSP; in-memory rate limiting; refund/dispute webhooks only recorded; automatic e-mail retry job; order-history UI; admin UI (Phases 6–9).
- Storefront still the demo design: Unsplash hero (not your product), `/shop` category filter unwired, no real products, no policy pages.
- Variants/pack sizes, stock reservation and delivery rules need your decisions (see `docs/DECISIONS.md`).

## 5. Database report
12 tables, 43 indexes, 22 functions; RLS on every table; matrix in [`docs/DATABASE.md`](DATABASE.md). Existing data (3 categories) preserved in testing; migrations are idempotent (applied twice). Money is `numeric(10,2)` GHS; stock never negative; one successful payment per order; nothing fulfils unless paid; privileged functions callable by `service_role` only; customers cannot change their role. **Not applied to the live project.**

## 6. Integration report
See [`docs/INTEGRATIONS.md`](INTEGRATIONS.md). Supabase schema/RLS: ✔ verified on scratch Postgres. Paystack, Cloudinary, Resend, Supabase Auth e-mail: implemented and mock-tested, **unverified live** — blockers: sandbox cannot reach the hosts; Paystack test keys not supplied; Resend domain not verified.

## 7. Security report
Verified by tests: customers cannot read others' orders, insert orders/payments/stock, escalate role or read admin tables; anonymous callers cannot sign uploads; browser cannot supply prices/status/user id; webhook rejects bad signatures; replays are no-ops; amount/currency mismatch never marks paid; late/duplicate payments flagged; secrets absent from the client bundle (scan of `.next/static`). **Disclosures:** (a) the shared zip contained `.env.local` — rotate all keys; (b) while identifying key types I once printed an 8-character prefix of the Resend key in my working output (no full secret was ever printed or stored) — rotating it covers this too. **Not covered yet:** CSP, shared rate limiting, penetration testing (Phase 9).

## 8. Test report (real commands, real results)
| Command | Result |
|---|---|
| `npm ci` (fresh clone) | 446 packages installed |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 4 warnings (pre-existing hero `<img>`, unused category state, two intentional full-page navigations) |
| `npm run test:unit` | 55 passed |
| `TEST_DATABASE_URL=… npm run test:db` | 100 passed (security 53, payments 45, app↔DB contract 2) |
| `npm run build` (no env file, fresh clone) | succeeds, 0 warnings |
| production start with empty env | refuses to start (exit 1), names missing variables only |
| `npm run smoke` against built server (fake env) | 15/15 passed |
Mutation checks: breaking the payment locking, and renaming an RPC argument, each make the tests fail as they should. Not run: any test against live services; browser/mobile/accessibility checks (Phase 3+); load testing.

## 9. Operating-cost report
[`docs/COSTS.md`](COSTS.md), from provider pages read 2026-10-21. Key points: **Vercel Hobby is non-commercial only** (hosting decision needed); **Supabase Free pauses after 1 week of inactivity and has no automatic backups**; Resend Free = 100 e-mails/day; Cloudinary Free = 25 credits/month; Paystack Ghana local fee 1.95% per transaction (not a platform cost).

## 10. Next-phase readiness
Ready to start **Phase 2 (brand and design system)** — it needs no new backend. Before **Phase 6** can go live you must: apply the migrations (after a backup), supply delivery zones, rotate keys, provide Paystack test keys, verify the Resend domain, and decide the open items in `docs/DECISIONS.md`. For Phase 2 it would help to receive the real logo and product photos.

**Waiting for your approval before beginning Phase 2.**
