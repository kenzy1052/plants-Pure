# Admin, Google sign-in and photo uploads — one-time setup

## 1. Who is an admin?
Roles live in `public.profiles.role` (`customer`, `admin`, `dispatch`). Signed-in admins get an **Admin** link
(account icon in the header, and in My account) that opens `/admin`.
- `admin`: dashboard, orders, products (create, edit, photos, publish, stock).
- `dispatch`: orders only (update status).
Make someone staff in the Supabase SQL editor:
`update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'person@example.com');`

## 2. Google sign-in
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application).
   Authorised redirect URI: `https://fjvmygnmljdbsocykseh.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Providers → Google: enable, paste the client ID and secret.
3. Supabase → Authentication → URL Configuration: add the live site URL and `https://<your-domain>/auth/callback` to Redirect URLs.

## 3. Photo uploads (Cloudinary)
Cloudinary → Settings → Upload → Upload presets → Add: name `plants_and_pure`, signing mode **Unsigned**, folder `plants-and-pure/products`.
(Use a different name? set `VITE_CLOUDINARY_UPLOAD_PRESET`.)

## 4. Order statuses
Staff set: Order received → Being packed → On its way / Ready to collect → Delivered / Collected, or On hold.
Collection orders (delivery zone with `is_pickup = true`) use the "Ready to collect" / "Collected" wording.
A status past "Order received" needs the order to be paid (database rule).
