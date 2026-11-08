# Operating costs and free-tier limits

Figures were read from the providers' own pages on **2026-10-21**; plans change, so re-check before launch. "Platform budget = $0" holds for the services below only while you stay inside these limits.

| Service | Free allowance (as published) | What happens beyond it / risk |
|---|---|---|
| **Supabase Free** | 500 MB database, 1 GB file storage, 50,000 monthly active users, 5 GB egress (+5 GB cached), up to 2 active free projects | **Free projects are paused after 1 week of inactivity** (a live store must not be paused). **No automatic backups on Free** (manual `db dump`). Pro is **$25/month**. |
| **Cloudinary Free** | 25 credits/month, shared: 1 credit = 1,000 transformations *or* 1 GB storage *or* 1 GB bandwidth; rolling 30-day window | Warnings, then upgrade prompts, then eventual account disabling if ignored. Whether commercial use is allowed on Free is **not stated** on the page read — confirm with Cloudinary. |
| **Resend Free** | 3,000 e-mails/month, **100/day**, 3 domains, 30-day data retention | Pro $20/month for 50,000. The daily cap matters on busy days (confirmation + any status e-mails). |
| **Paystack** | No setup or monthly fee. Ghana (GHS) local transactions **1.95%** (cards, mobile money, bank transfer) per Paystack's support article; no fixed fee or cap stated | A per-transaction fee is a real operating cost, not a platform fee. International-card pricing in that article was also listed as 1.95% — confirm in your dashboard. Settlement timing not verified for Ghana. |
| **Vercel Hobby** | 1M function invocations, 100 GB fast data transfer, 5,000 image transformations, etc. | **Vercel's docs state the Hobby plan "restricts users to non-commercial, personal use only."** A business store should not run on Hobby. Pro is **$20 per developer seat/month**. Alternatives (self-host on a VPS, other hosts) need their own evaluation — see `docs/DECISIONS.md` D-10. |
| **Domain** | not free | Annual renewal for `plantsandpure.com` (already owned by the business). |

## Practical consequences for the $0 target

1. **Hosting is the one place the $0 target is at risk**: Vercel Hobby is not licensed for commercial use. Decide between Vercel Pro (~$20/mo), another host, or accepting a non-commercial-free host for staging only.
2. **Supabase Free can pause** after a week without traffic and has no backups. For a trading store, plan on Pro ($25/mo) or accept the risk with a daily manual export and an uptime ping.
3. **Supabase's built-in auth mailer is rate-limited**; configure Resend SMTP (free tier suffices at small volume).
4. Stay under Cloudinary's 25 credits by serving appropriately sized images (`f_auto,q_auto`, the presets provided) — a catalogue of a few hundred products is far below the limit.
5. Payment fees (1.95% of each sale) are unavoidable and are not a "platform" cost.

Sources: [Supabase pricing](https://supabase.com/pricing), [Supabase backups doc](https://supabase.com/docs/guides/platform/backups), [Resend pricing](https://resend.com/pricing), [Cloudinary plans](https://cloudinary.com/documentation/billing_and_plans), [Paystack Ghana charges](https://support.paystack.com/hc/en-us/articles/360009881920-What-are-Paystack-s-transaction-charges), [Vercel Hobby plan](https://vercel.com/docs/plans/hobby).
