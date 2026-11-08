# Architecture

```
Browser ──► Next.js (App Router)
              ├─ Server Components / route handlers  ── anon+cookie client (user's RLS) ──► Supabase Postgres
              ├─ src/lib/supabase/admin.ts (service role, server-only) ───────────────────► SECURITY DEFINER functions
              ├─ Paystack REST (init / verify)  ◄── webhook (HMAC) ◄── Paystack
              ├─ Cloudinary (signed direct upload; Admin API verify)
              └─ Resend REST (send-once e-mail)
```

## Layers (src/)

| Path | Responsibility |
|---|---|
| `app/` | pages and route handlers only; thin |
| `lib/env/` | `public.ts` (browser-safe `NEXT_PUBLIC_*`), `server.ts` (validated secrets, `server-only`) |
| `lib/supabase/` | `browser.ts`, `server.ts` (per-request, cookie session), `admin.ts` (service role), `proxy.ts` (session refresh) |
| `lib/api/` | errors (one JSON shape), request guards (same-origin, size-limited JSON + zod), rate limiter, redacting logger, auth helpers |
| `lib/payments/` | `service.ts` (verify-then-apply), `status.ts`, `db-errors.ts` |
| `lib/paystack.ts` | signature check, initialise, verify |
| `lib/cloudinary/` | `delivery.ts` (browser-safe URLs), `server.ts` (signing, verify, delete) |
| `lib/email/` | Resend sender (sandbox/live/off), templates, send-once order confirmation |
| `lib/constants/business.ts` | business facts with verified/unverified provenance |
| `proxy.ts` | Next 16 "proxy" (middleware): refresh session, redirect anonymous users away from `/account`, `/admin` |
| `instrumentation.ts` | validates configuration at start-up |

## Trust boundaries

1. **Browser → server:** untrusted. JSON is size-limited and zod-validated; state-changing cookie-authenticated routes require a same-origin `Origin`; the body can never carry prices, totals, fees, user ids or payment status (tested).
2. **Server → database:** the service-role client is used only after the caller is authenticated/authorised or a signature is verified. Privileged logic lives *in* the database so it is atomic and cannot be bypassed by a bug in a route.
3. **Paystack → server:** the webhook is authenticated by HMAC-SHA512 over the raw body, but its content is **still not trusted**: the server re-fetches the transaction from Paystack and applies *that*.
4. **Browser redirect after payment:** only identifies *which* reference to look at; the page asks the server, which asks Paystack.

## Checkout / payment flow

1. `POST /api/payments/initialize` (same-origin, rate-limited, validated) → `create_checkout_order` (prices + stock + zone computed in SQL, idempotent) → `begin_payment_attempt` (unique reference `PP-<order#>-<12 hex>`) → Paystack *initialize* with the **database** amount → `mark_payment_initialized` → returns `authorization_url`. If Paystack fails the attempt is marked failed (no stuck "initiated" rows).
2. Customer pays on Paystack's hosted page → redirected to `/checkout/callback?reference=…`.
3. **Two independent paths reach the same function** `verifyAndApplyPayment(reference)`: the webhook, and the callback page (server-side, plus a client poller). It calls Paystack *verify*, then `apply_payment_result` (row-locked state machine) which validates amount/currency, decrements stock, marks paid, all idempotently.
4. Only a real *transition to paid* triggers the confirmation e-mail, claimed through `claim_email` so it is sent once.

## Error handling and logging

Every route is wrapped by `route()`: known errors map to safe messages; anything else returns a generic 500 with a `requestId` and is logged with stack (dev only). Logs are single-line JSON; keys that look secret are redacted, PII keys (email, phone, name, address) are masked, and secret-shaped strings (`sk_…`, `re_…`, JWTs, Bearer tokens) are scrubbed.

## Known limits (honest list)

- Rate limiting is in-memory per server instance (a blunt instrument on serverless); Supabase Auth has its own limits. Shared limiter → Phase 9.
- No Content-Security-Policy yet (needs nonce wiring) → Phase 9. Other security headers are set.
- Refund/dispute webhooks are acknowledged and recorded but not acted on → Phase 6/7.
- The storefront pages are still the demo UI and read through the browser client with RLS.
