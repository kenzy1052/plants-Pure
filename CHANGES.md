# Plants & Pure update: files to copy into the repo

Copy everything in this folder over your project (same paths). Nothing else changes.

## Do first (database)
Run `supabase/migrations/20261120010000_growth_features.sql` once in the Supabase SQL editor.
It creates subscribers, customer contacts and reviews, plus an automatic "save customer when an order is paid" trigger
(and backfills people who have already paid). Safe to re-run.

## NEW files
- supabase/migrations/20261120010000_growth_features.sql
- src/assets/ranges/*.webp (5 cut-out product images)
- src/components/site/growth.css, JourneyTimeline.tsx, RangeShowcase.tsx, SubscribeForm.tsx, Testimonials.tsx
- src/components/shop/Stars.tsx, ReviewForm.tsx
- src/components/admin/ReviewsPanel.tsx, AudiencePanel.tsx
- src/lib/growth.functions.ts, src/lib/testimonials.ts, src/lib/server/growth.server.ts
- src/routes/testimonials.tsx, src/routes/unsubscribe.tsx

## CHANGED files
- src/lib/business.ts (story, mission, vision, journey, 4 ranges)
- src/routes/index.tsx (new range cards, journey, testimonials, story copy)
- src/routes/about.tsx (story, journey, mission/vision, testimonials)
- src/routes/track.tsx (review form after delivery)
- src/routes/admin.tsx (Reviews + Audience tabs)
- src/components/site/Footer.tsx (subscribe + social)
- src/routeTree.gen.ts (registers /testimonials and /unsubscribe)

Resend, Supabase, Paystack and Cloudinary code is untouched; the new server code reuses the same helpers and env vars.
Set the real LinkedIn company URL in `CONTACT.linkedin` (src/lib/business.ts).
