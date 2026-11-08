# Plants & Pure — roadmap

- [x] Carry storefront over from the old project onto Lovable's framework, reading the existing Supabase database
- [x] Design system: client palette (red #B50606→#E31B1B, lime #A6F916→#6FBF00, light #FAF7F5 / dark #0F1115), Newsreader / Inter, light + dark
- [x] Brand onboarding (once per session), "look closer" interactive hero, green dot + ring + particle cursor
- [x] Header (pill nav, category dropdown, live search, theme, account, cart), footer, scroll reveals, page transitions
- [x] Shop (filter/search/sort/paging), product page (gallery, JSON-LD), cart drawer
- [x] Checkout + Paystack (same database functions), callback with server verification, webhook, Resend order + contact emails
- [x] Auth (sign in/up, forgot/reset, show/hide password), account (profile, password, order history)
- [x] SEO: per-page meta, canonical, sitemap.xml, robots, Organization/Product structured data
- [x] Server keys saved (service role, Paystack secret, Resend key + sender); test checkout reached Paystack and test orders were cancelled
- [ ] Owner connects existing Supabase in Settings → External Supabase (optional; site already reads it via public key)
- [ ] Update Paystack webhook URL to /api/public/webhooks/paystack after publishing — waiting on owner
- [ ] Add the published domain to Supabase Auth redirect URLs — waiting on owner
- [ ] Delivery zones with fees — waiting on owner's list
- [ ] Admin area (products, images/Cloudinary uploads, stock, categories, orders) — next phase
- [x] Redesign round 2: food-shop look, photo hero with Spices/Herbs/Oils shelves, square footer, deeper green, smaller cursor hover, intro always shown on first visit
- [x] Tracking code after payment (confirmation page + receipt email + account) and /track page

## Round 3 — client corrections (Nov 2026)
- [x] Removed every AI-generated image; the site now uses only the company's own photography (src/assets/company)
- [x] Real logo (transparent cut-out) in header, footer, intro and favicon
- [x] Red palette from the client's colour sheet replaces orange; tokens in src/styles.css (pepper = brand red, lime accent, always-dark `night` surfaces)
- [x] New studio hero (dark stage, feathered product photography, pointer parallax), new intro, scroll reveals with variants + parallax + progress line
- [x] Home page rebuilt: ranges, e-commerce section (live products + range tabs + quick add), studio range rail, pouches/bottles, EATHI values, story, stockists, closing banner
- [x] About page and business facts now follow the company profile document (src/lib/business.ts)
- [ ] Upload the studio product photos to Cloudinary and attach them to products (until then product cards fall back to the matching company photo)
- [ ] Transactional emails (src/lib/server/email.server.ts) still use the old orange/green colours — left untouched on purpose (server code)
- [ ] Profile document inconsistencies to confirm with the client: "25 products" vs "21 products", GH₵0.00 prices on 4 products, one phone number with 9 digits
