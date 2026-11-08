# Integrations — behaviour and verification status

"Verified" = proven by an automated test in this repo. **"Unverified (blocked)"** = the code exists and is unit-tested against mocks, but it has never talked to the real service because this build environment cannot reach those hosts (the sandbox proxy returns 403 for them) and some credentials are placeholders. Nothing below is claimed as live-working.

| Integration | Implemented | Verified here | Unverified — exact blocker |
|---|---|---|---|
| **Supabase Postgres schema, RLS, state machine** | 5 migrations, 22 functions, 12 tables | ✔ 100 DB tests on a scratch Postgres 16 loaded from the real schema dump | Not applied to the live project (needs your approval and a backup first) |
| **Supabase Auth** | sign-up, sign-in, sign-out, e-mail confirmation, password reset, session refresh in `proxy.ts`, profile trigger | ✔ profile trigger + role-escalation tests in SQL; ✔ route/redirect behaviour via smoke test | End-to-end e-mail flow needs the live project + dashboard settings in `docs/ENVIRONMENT.md` |
| **Paystack** | server-side initialise, verify, HMAC webhook, idempotent ledger, amount/currency checks | ✔ unit tests with mocked HTTP: signature (valid/invalid/tampered), amounts from verification not payload, replay, failure → retry, timeout; ✔ DB state-machine tests | A real test transaction: `PAYSTACK_SECRET_KEY` supplied was a placeholder; `api.paystack.co` unreachable from the sandbox |
| **Cloudinary** | signed uploads (folder allow-list, formats, `unconfirmed` tag), server-side verify, size/format enforcement, delete, orphan script | ✔ signature algorithm, allow-list and rejection paths (mocked) | A real upload: `api.cloudinary.com` unreachable from the sandbox |
| **Resend** | send-once confirmation e-mail, sandbox/live/off, idempotency key, escaped templates | ✔ mocked: sandbox redirect, off, failure handling, escaping | A real send: host unreachable; the sender domain is not verified (not published; account-owner task) |

## Paystack

- **Hosted checkout** (`authorization_url`): card/mobile-money details never touch our server or our JavaScript. The old inline `PaystackPop` script and the browser-side order insert were removed.
- **Reference:** `PP-<order number>-<12 random hex>`; unique in the database.
- **Statuses** are mapped to our states: `success`→paid (only after verify + amount/currency match), `failed`, `abandoned`, `cancelled`, `pending`/`ongoing`/`processing`/`queued`→pending, `reversed`/`refunded`→refunded handling. Unknown provider status raises an error instead of guessing.
- **Webhook URL** to configure in the dashboard: `https://<domain>/api/webhooks/paystack`. Handled event: `charge.success`. Others are stored and acknowledged (`ignored`).
- **Retries:** Paystack retries non-2xx responses. A processing failure returns 5xx and leaves the event unfinished so the retry reprocesses it; a finished event is acknowledged without side effects.
- **Go-live gate:** use `sk_test_` keys only until Phase 9 sign-off. The server logs a warning if a *test* key runs in production.

## Cloudinary

- Public ids must match `plants-and-pure/{products|categories|site}/…` (also enforced by a database CHECK on `product_images`).
- Flow: admin calls `POST /api/uploads/sign` → browser uploads directly to Cloudinary with the signed params → `POST /api/uploads/confirm` asks Cloudinary for the real format/size, **deletes** the file if it is not JPG/PNG/WebP ≤ 5 MB, otherwise inserts into `product_images` and removes the `unconfirmed` tag.
- **Orphans:** uploads never confirmed keep the `unconfirmed` tag. `node --env-file=.env.local scripts/cloudinary-orphans.mjs` lists those older than 24 h (dry run); add `--delete` to remove them. Since Phase 4 it also checks `product_images` (needs `SUPABASE_SERVICE_ROLE_KEY`) and never deletes a file a product still uses; without database access it refuses to delete.
- Delivery: `cloudinaryUrl(publicId, "card" | "detail" | …)` builds `f_auto,q_auto` URLs. `next/image` only accepts your own cloud name.

## Resend

- `EMAIL_MODE=sandbox` (default outside production) sends **only** to `EMAIL_SANDBOX_RECIPIENT`, subject-tagged `[SANDBOX]` — real customers are never e-mailed from development.
- The order e-mail states only what the system knows (payment received, order number, items, totals). No delivery promises or product claims until the business approves wording.
- A failed send is recorded `failed` in `email_log` and does not affect the payment; it can be re-claimed later. (An automatic retry job is not built yet — Phase 6.)
- Supabase Auth e-mails (confirmation/reset) are sent by Supabase, not by this code. Configure Resend SMTP there for production.
