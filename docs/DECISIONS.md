# Decisions and open questions

## Decisions made in Phase 1 (reversible unless noted)

| # | Decision | Why | Alternative |
|---|---|---|---|
| D-1 | **Keep Next.js 16 / React 19 / Tailwind 4 / Supabase**; no framework or package-manager change | Brief: don't rebuild what works; no compatibility reason to change | — |
| D-2 | **Hosted Paystack checkout** (redirect to `authorization_url`) instead of the inline popup | Card/mobile-money data never reaches our page; works with the server-verified flow | Inline popup is possible later; the verification path would not change |
| D-3 | **Business rules live in Postgres functions**, routes are thin | Atomicity, one source of truth, testable without HTTP | Application-level transactions (weaker under concurrency) |
| D-4 | **Delivery zones/fees are database rows, empty until the business supplies them** | The zone list and the GH₵ 350 free-delivery threshold in the demo code were never verified | Seed the demo values (rejected: would charge customers unapproved fees) |
| D-5 | **Customer e-mail required at checkout** | Paystack requires one; receipts need it | Synthesise `phone@domain` (rejected: demo did this; receipts would go nowhere) |
| D-6 | **Guest checkout allowed**; orders linked to `user_id` when signed in | Lower friction; no privacy leak because guests cannot read orders by id | Require an account |
| D-7 | **Stock is decremented on verified payment, not reserved at checkout** | No stock locked by abandoned carts; simple. Cost: a rare paid-but-out-of-stock order goes to manual review | Time-boxed reservation (more moving parts) — decide before Phase 6 |
| D-8 | **Variants/pack sizes deferred** (product = one sellable unit with its own price) | The business has not published sizes; avoids inventing a model. The schema can add `product_variants` without breaking orders (items snapshot title/price) | Model variants now |
| D-9 | **No CSP and in-memory rate limiting in Phase 1** | Both need larger changes (nonces, shared store); documented, scheduled for Phase 9 | — |
| D-10 | **Hosting not decided.** Vercel Hobby is non-commercial; see `docs/COSTS.md` | Needs a business/cost decision | Vercel Pro, other host, VPS |
| D-11 | `canvas-confetti` removed (unused) | Done in Phase 3 | — |
| D-12 | The legacy `setup.js` scaffold generator (which would overwrite source files) was moved to `docs/archive/legacy-setup.js.txt` | Dangerous to leave runnable | Delete |
| D-13 | **Catalogue read through server components with an anon, session-less client** (client-side hooks removed) | No catalogue download to browsers, correct SEO, admins never see drafts publicly; RLS still enforces visibility | Client fetching (Phase 2 approach) |
| D-14 | **No `loading.tsx` on `/product/[slug]`** | Streaming sends HTTP 200 before `notFound()`: missing/draft products would be soft-404s | Skeleton + `noindex` meta only |
| D-15 | **Category descriptions from the database are not shown; names are** | The descriptions are unverified marketing text; names are needed for navigation (confirm, see question 3) | Show descriptions after approval |
| D-16 | **Policy and FAQ pages not built** | They need business decisions (open questions 1, 7); the Phase 3 page list did not include them. Nothing was invented | Draft placeholder policies (rejected) |
| D-17 | **Caching deferred to Phase 9** | Needs a hosting decision (D-10) and measured traffic; stale stock/prices are worse than slower pages | ISR/`revalidate` now |
| D-18 | **Contact form sends real e-mail or says it cannot** | Never show "sent" unless Resend accepted it | Store messages in the database (possible Phase 7) |

## Decisions made in Phase 4

| # | Decision | Why | Alternative |
|---|---|---|---|
| D-19 | **Variants deferred; design written** (`docs/CATALOGUE.md`) | Needs cart, checkout, stock and order-item changes (Phase 6); the business has not published pack sizes | Build `product_variants` now (risks half-working checkout) |
| D-20 | **Every product is stock-tracked** (no "untracked" mode) | The checkout functions would need a special case; the business sells packaged goods | Add `track_stock` later |
| D-21 | **Product status is derived** from `is_active` + `archived_at` | One source of truth; no drift | A separate status column |
| D-22 | **Publication rules are database triggers**, not UI checks | Hold for every writer (API, SQL editor, service role) | UI/API validation only |
| D-23 | **Admin operations run as the signed-in admin**, via `SECURITY DEFINER` functions gated by `is_admin()` | Audit log names the real person; no service-role key in admin routes | Service role with the actor passed as a parameter |
| D-24 | **Slug locked while published; no hard delete of live or ordered products** | Links must not break; order history must stay intact | Allow, with redirects |
| D-25 | **A product cannot sit in an inactive category** (both directions blocked) | Otherwise products silently vanish from navigation | Allow and hide |
| D-26 | **`products.image_urls` kept but unused and unreadable to the public role** | Dropping a column needs the owner's approval | Drop in migration 06 |
| D-27 | **Photo ordering by buttons, not drag and drop** | Keyboard/touch accessible with no extra dependency | dnd library |

## Open questions for Plants & Pure (nothing below has been guessed)

1. **Delivery:** which areas, what fee per area, any free-delivery threshold, pickup location and hours? (Needed before any order can be taken.)
2. **Products:** the live site shows none. Names, descriptions, ingredients, prices, pack sizes/weights, stock levels, photographs. Is "variants" (e.g. 50 g / 100 g) needed?
3. **Categories:** the database has `culinary-spices`, `herbal-infusions`, `pure-botanical-oils`; the website says *Spices, Herbs, Natural Oils*. Which names/slugs are official?
4. **WhatsApp:** is there a business WhatsApp number? None is published, and the demo's number (`233500000000`) was a placeholder, now removed.
5. **Phone numbers:** the contact page lists a second number (+233 20 875 6898) not shown elsewhere. Is it current? Opening hours "Mon – Sat 9am – 6pm" are shown on the contact page only — confirm.
6. **E-mail sender:** which address (e.g. `orders@plantsandpure.com`) and can the domain's DNS be changed to verify it in Resend? `orders@plantsandpure.com` appears only in the demo code, not on the website.
7. **Policies:** shipping, returns/refunds, cancellations, privacy and terms are *linked but empty* on the live site. These need business decisions; none have been drafted.
8. **Claims to substantiate or drop:** "10K+ happy customers", "100+ products", "thousands of plant lovers", "rigorous quality testing", "nationwide delivery", "100% natural" (no documentation). They are not used in the new copy.
9. **Hosting & plan** (D-10) and whether to pay for Supabase Pro (pausing / backups).
10. **Retention policy** for customer and payment data (proposal in `docs/DATABASE.md`).
11. **Newsletter** on the original site: needs a consent-based design before it is rebuilt.
12. **Logo / photography:** the original site hosts `/logo.jpeg`, `/images/hero1.jpg`, `/images/img3.jpeg` (production facility). Please supply originals; the sandbox could not download them, and the demo hero still uses a stock Unsplash photo that does not show the company's products (flagged for Phase 2/3).
13. **Variants / pack sizes:** do products come in several sizes with different prices? (Phase 6 needs this answered.)
14. **Approval to drop the deprecated `products.image_urls` column** once you have confirmed no data in it is needed.
