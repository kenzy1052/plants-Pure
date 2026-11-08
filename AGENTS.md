<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- Backend is the owner's EXISTING Supabase project (not Lovable Cloud); never create or alter its schema from here — business rules live in its SQL functions (create_checkout_order, apply_payment_result, claim_email…), so the app only calls them.
- Browser/public reads use `src/lib/supabase.ts` (anon key + RLS); the service-role client is created only inside server handlers (`src/lib/server/*.server.ts`) because it bypasses RLS.
- Prices, fees, stock and totals are computed by the database; the browser only sends product ids, quantities, zone and contact details — never trust client amounts.
- A payment is "paid" only after a server-side Paystack verify (webhook or status check) — the redirect is just a hint.
- Products, categories and images always come from the database / Cloudinary; never hardcode or invent catalogue data. Exception: editorial photography (hero, range rail, story) is the company's own, in `src/assets/company`; `ProductImage` falls back to the matching company photo only when a product has no database image.
- No AI-generated or stock imagery anywhere — company photography only (client requirement).
- All colours/typography come from tokens and `type-*` utilities in `src/styles.css`; components never use raw colour classes.
- Business facts live in `src/lib/business.ts` and must be published by the business; do not invent contact details or claims.
- tsconfig keeps strict + noUncheckedIndexedAccess but disables exactOptionalPropertyTypes and noPropertyAccessFromIndexSignature: they added friction with Supabase row typing and router search params without catching real bugs.
- Paystack callback URLs come from APP_URL or the caller's allow-listed Origin (src/lib/origin.ts): behind the proxy the server's request URL is an internal localhost address.
