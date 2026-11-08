# Environment and account configuration

Variables are validated at start-up by `src/lib/env/server.ts` (see `src/instrumentation.ts`).
**Production refuses to start** if a feature's variables are missing; **development warns** and the affected feature answers `503`.
Error messages list variable *names* only. Placeholder values (`your-…`, `sk_test_xxxx…`, `<…>`) count as not set.

| Variable | Scope | Used for | Where to get it |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | public | absolute URLs (Paystack callback, e-mail links, CSRF origin check) | your site URL (`https://…` in production) |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase API | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | browser/server client, subject to RLS | same page (anon / publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | privileged server operations (bypasses RLS) | same page — never expose |
| `PAYSTACK_SECRET_KEY` | **secret** | initialise/verify payments, verify webhook signatures | Paystack → Settings → API Keys. `sk_test_…` until go-live |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | public | image delivery URLs, `next/image` allow-list | Cloudinary dashboard |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | secret | signed uploads, Admin API verify/delete | Cloudinary → API Keys |
| `RESEND_API_KEY` | **secret** | send transactional e-mail | Resend → API Keys |
| `RESEND_FROM_EMAIL` | server | sender (`Name <addr@verified-domain>`) | needs a domain verified in Resend |
| `EMAIL_MODE` | server | `live` / `sandbox` / `off` (default `live` in production, else `sandbox`) | — |
| `EMAIL_SANDBOX_RECIPIENT` | server | the only recipient in sandbox mode | your own address |
| `HEALTH_CHECK_TOKEN` | secret | unlocks detail on `/api/health` | any long random string |

`NEXT_PUBLIC_*` values are compiled into browser JavaScript by design. Everything else is server-only; the build was scanned and no secret value or name appears in `.next/static`.

## Account-owner checklist (cannot be done from code)

1. **Rotate keys.** The project zip shared for this audit contained a `.env.local`. Treat every key in it as exposed: rotate the Supabase service-role key, Cloudinary API secret and Resend key, and re-issue any Paystack keys.
2. **Paystack:** get real **test** keys (the supplied ones were placeholders). In the Paystack dashboard set the webhook URL to `https://<your-domain>/api/webhooks/paystack`. Test and live keys have separate webhook settings.
3. **Resend:** verify a sending domain (DNS records), then set `RESEND_FROM_EMAIL` to an address on it. Until then use sandbox mode.
4. **Supabase Auth → URL Configuration:** set *Site URL* to your production URL and add `http://localhost:3000/**` and your production/preview URLs to *Redirect URLs*.
5. **Supabase Auth → Email Templates:** point the links at the server-side confirmation route so sessions are issued by our server:
   - Confirm sign-up: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/account`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
6. **Supabase Auth → Providers → Email:** keep *Confirm email* enabled; set a minimum password length of at least 10 (the forms enforce 10 client-side, the server setting is the real control).
7. **Supabase Auth → SMTP:** the built-in mailer is heavily rate-limited and meant for testing. For production configure Resend as custom SMTP (a free-plan decision; see `docs/COSTS.md`).
8. **Cloudinary:** if an *unsigned* upload preset exists, delete or disable it. Uploads now use signed requests only.
9. **Backups (Supabase Free):** automatic backups are *not* included. Schedule a manual export — see `docs/DATABASE.md`.
10. **First admin:** created through the SQL editor, never through the website — see `docs/DATABASE.md`.
