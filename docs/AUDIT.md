# Phase 1 audit — state of the inherited demo (before changes)

Classification: **working** / **partial** / **mocked** / **broken** / **missing** / **blocked** (needs access we do not have).
"Now" shows the state at the end of Phase 1.

| Area | Before | Evidence | Now |
|---|---|---|---|
| Product & category read | partial | `select *` from the browser; inverted realtime DELETE filter (`id === old.id` kept the deleted row and dropped the rest); demo image fallbacks | repaired (explicit columns, correct filter, local placeholder); full storefront is Phase 3 |
| Cart | partial | state mutation bug in `addItem`; no quantity cap | repaired |
| Checkout | **mocked, insecure** | order inserted **from the browser** with `payment_status: "paid"` after a client callback; prices/fees from client; fake e-mail `phone@…`; fake WhatsApp number | replaced with server flow (Phase 6 completes UI) |
| Orders table security | **critical** | policies "Anyone can create orders / order items": anyone could insert paid orders | policies dropped; RLS tested |
| Payment init API | **broken** | imported a module that did not exist, never called Paystack | rewritten |
| Paystack webhook | **broken** | called `.raw()` / `.catch` on the wrong objects, did not compile; decremented stock without idempotency | rewritten + tested |
| Paystack verify | partial | helper existed but unused; no amount/currency validation | rewritten + state machine |
| Cloudinary signing | **insecure** | any caller could sign any folder; no allowed formats; no auth | admin-only, allow-listed, verified |
| Resend | partial/simulated | silently "succeeded" without a key; unescaped HTML; no idempotency | rewritten |
| Auth & profiles | **missing** | no pages, no profile trigger, no role protection | implemented |
| Admin | **missing** | none | out of scope (Phase 7); authorisation primitives in place |
| Env validation | partial | `env.ts` with no validation; placeholder keys accepted | rewritten, fail-fast in production |
| Health endpoint | partial/leaky | printed raw database error text and config flags publicly | minimal public output |
| Security headers | missing | `x-powered-by` exposed; no headers | added (CSP pending) |
| Tests | **missing** | none | 155 tests |
| Fonts | broken build | build fetched Google Fonts | self-hosted |
| Demo content | **non-compliant** | fabricated "recent order" popups, "Staff Pick", invented footer claims ("women harvesters and smallholder farmers", "batched and inspected"), healing/therapeutic claims, placeholder phone, GH₵ 350 free-delivery promise | removed/replaced with published wording |
| Secrets hygiene | risk | `.env.local` inside the shared zip; `.gitignore` ignored `.env.example` | rotate keys (owner); `.env.example` now tracked |
| Supabase / Cloudinary / Resend / Paystack live checks | **blocked** | hosts unreachable from the sandbox; Paystack keys are placeholders | see `docs/INTEGRATIONS.md` |
| Original website content | audited 2026-10-20 | contact, mission, categories captured; policies empty; catalogue empty | recorded in `src/lib/constants/business.ts` and `docs/DECISIONS.md` |

Items deliberately left for later phases: hero image (stock photo), category filter wiring in `/shop`, `<img>` in the hero, `selectedCategory` unused state, `/shop?category=` links.
