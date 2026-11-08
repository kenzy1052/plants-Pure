-- =============================================================================
-- Migration 03 — catalogue integrity, images, inventory ledger, delivery zones
-- Plants & Pure Limited · Phase 1
--
-- Extends the existing categories / products tables (no table is dropped or
-- recreated; existing rows are preserved) and adds:
--   product_images, inventory_movements, delivery_zones
--
-- Decisions recorded here
--   * Money stays numeric(10,2) in Ghana cedis (exact decimal, no floats).
--     Paystack minor units (pesewas) are derived as (amount * 100)::bigint.
--   * Defaults that invented business facts are removed:
--       stock default 50  → 0     (new products are not "in stock" by magic)
--       weight default 100 → none (a size must be entered, not assumed)
--       is_active default true → false (products are drafts until published)
--   * `ingredients` is no longer mandatory — it must not force admins to enter
--     unverified text (brief §4.3: no fabricated specifications).
--   * products.image_urls is DEPRECATED in favour of product_images (one source
--     of truth). The column is kept so nothing is lost; it is removed in Phase 4.
--   * Product variants/pack sizes are NOT modelled yet: the live catalogue is
--     empty and the business has not confirmed its sizes (see docs/DECISIONS.md).
-- =============================================================================

-- Helper local to this migration session: add a CHECK once, validate it.
create or replace function pg_temp.add_check(p_table regclass, p_name text, p_expr text)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from pg_constraint where conrelid = p_table and conname = p_name) then
    execute format('alter table %s add constraint %I check (%s) not valid', p_table, p_name, p_expr);
    execute format('alter table %s validate constraint %I', p_table, p_name);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
alter table public.categories add column if not exists updated_at timestamptz not null default now();

select pg_temp.add_check('public.categories', 'categories_slug_format',
  $c$slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'$c$);
select pg_temp.add_check('public.categories', 'categories_name_not_blank',
  $c$length(btrim(name)) > 0$c$);

create index if not exists categories_display_order_idx on public.categories (display_order, name);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
update public.products set stock = 0 where stock is null;

alter table public.products
  alter column stock        set default 0,
  alter column stock        set not null,
  alter column weight_grams drop default,
  alter column is_active    set default false,
  alter column ingredients  drop not null;

alter table public.products add column if not exists archived_at timestamptz;

-- Full-text search document (kept in sync by Postgres; GIN-indexed below).
alter table public.products add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('english'::regconfig,
      coalesce(title, '') || ' ' || coalesce(tagline, '') || ' ' || coalesce(description, ''))
  ) stored;

select pg_temp.add_check('public.products', 'products_price_nonneg',        $c$price >= 0$c$);
select pg_temp.add_check('public.products', 'products_compare_at_gt_price', $c$compare_at_price is null or compare_at_price > price$c$);
select pg_temp.add_check('public.products', 'products_stock_nonneg',        $c$stock >= 0$c$);
select pg_temp.add_check('public.products', 'products_weight_positive',     $c$weight_grams is null or weight_grams > 0$c$);
select pg_temp.add_check('public.products', 'products_title_not_blank',     $c$length(btrim(title)) > 0$c$);
select pg_temp.add_check('public.products', 'products_slug_format',         $c$slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'$c$);

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_listing_idx
  on public.products (is_featured desc, created_at desc)
  where is_active and archived_at is null;
create index if not exists products_search_idx on public.products using gin (search_tsv);
create unique index if not exists products_sku_key on public.products (sku) where sku is not null;

comment on column public.products.image_urls is
  'DEPRECATED (Phase 1): use public.product_images. Kept so no data is lost; removed in Phase 4.';
comment on column public.products.stock is
  'Units available to sell. Changed only by admin edits or by apply_payment_result(); every change is written to inventory_movements.';

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- product_images  (Cloudinary-backed; replaces products.image_urls)
-- ---------------------------------------------------------------------------
create table if not exists public.product_images (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.products (id) on delete cascade,
  cloudinary_public_id text not null,
  url                  text not null,
  alt_text             text,
  position             integer not null default 0,
  is_cover             boolean not null default false,
  width                integer,
  height               integer,
  bytes                integer,
  format               text,
  created_at           timestamptz not null default now(),
  constraint product_images_public_id_format
    check (cloudinary_public_id ~ '^plants-and-pure/[A-Za-z0-9/_-]+$'),
  constraint product_images_url_is_cloudinary
    check (url ~ '^https://res\.cloudinary\.com/'),
  constraint product_images_unique_asset unique (product_id, cloudinary_public_id)
);

create unique index if not exists product_images_one_cover_per_product
  on public.product_images (product_id) where is_cover;
create index if not exists product_images_product_position_idx
  on public.product_images (product_id, position);

-- Carry over any Cloudinary URLs already stored in the deprecated array.
-- Non-Cloudinary URLs cannot be represented here and are reported, not dropped.
do $$
declare
  v_skipped integer;
begin
  insert into public.product_images (product_id, cloudinary_public_id, url, position, is_cover)
  select p.id,
         m.public_id,
         u.url,
         u.ord - 1,
         (u.ord = 1)
  from public.products p
  cross join lateral unnest(p.image_urls) with ordinality as u(url, ord)
  cross join lateral (
    select substring(u.url from '/upload/(?:[^/]+/)*?(?:v[0-9]+/)?(plants-and-pure/[^.?#]+)') as public_id
  ) m
  where m.public_id is not null
    and u.url ~ '^https://res\.cloudinary\.com/'
  on conflict do nothing;

  select count(*) into v_skipped
  from public.products p
  cross join lateral unnest(p.image_urls) as u(url)
  where u.url !~ '^https://res\.cloudinary\.com/.*/upload/.*plants-and-pure/';

  if v_skipped > 0 then
    raise notice 'products.image_urls: % URL(s) are not Cloudinary uploads under plants-and-pure/ and were NOT migrated — re-upload them through the admin flow.', v_skipped;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- inventory_movements  (append-only ledger of every stock change)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id          bigint generated always as identity primary key,
  product_id  uuid not null references public.products (id) on delete cascade,
  delta       integer not null check (delta <> 0),
  stock_after integer not null check (stock_after >= 0),
  reason      text not null check (reason in
                ('initial','restock','sale','adjustment','return','correction','order_cancelled')),
  order_id    uuid,
  actor_id    uuid,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists inventory_movements_product_idx
  on public.inventory_movements (product_id, created_at desc);

-- Writes a ledger row for every change to products.stock, whoever makes it.
-- Server functions label the cause with set_config('app.stock_reason', …, true).
create or replace function public.log_stock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := coalesce(nullif(current_setting('app.stock_reason', true), ''), 'adjustment');
  v_order  uuid := nullif(current_setting('app.order_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    if new.stock <> 0 then
      insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_id)
      values (new.id, new.stock, new.stock, 'initial', (select auth.uid()));
    end if;
  elsif new.stock is distinct from old.stock then
    insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id, actor_id)
    values (new.id, new.stock - old.stock, new.stock, v_reason, v_order, (select auth.uid()));
  end if;
  return new;
end;
$$;
revoke all on function public.log_stock_change() from public, anon, authenticated;

drop trigger if exists products_log_stock_change on public.products;
create trigger products_log_stock_change
  after insert or update of stock on public.products
  for each row execute function public.log_stock_change();

-- ---------------------------------------------------------------------------
-- delivery_zones  (data, not code — the business owns these values)
-- Deliberately seeded EMPTY: the zones/fees in the demo code were never verified
-- by the business. See supabase/seed/dev_delivery_zones.sql (dev only).
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_zones (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null unique,
  fee           numeric(10,2) not null check (fee >= 0),
  free_over     numeric(10,2) check (free_over is null or free_over > 0),
  is_pickup     boolean not null default false,
  is_active     boolean not null default true,
  display_order integer not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint delivery_zones_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint delivery_zones_pickup_is_free check (not is_pickup or fee = 0)
);
comment on column public.delivery_zones.free_over is
  'Subtotal (GHS) at or above which delivery is free. NULL = never free. Set by the business, never assumed.';

drop trigger if exists delivery_zones_set_updated_at on public.delivery_zones;
create trigger delivery_zones_set_updated_at
  before update on public.delivery_zones
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
--   anon / authenticated may READ the public catalogue; only admins may write it
--   (enforced by RLS); stock also changes inside server-side payment functions.
-- ---------------------------------------------------------------------------
revoke all on public.categories, public.products, public.product_images,
              public.inventory_movements, public.delivery_zones
  from anon, authenticated;

grant select on public.categories, public.products, public.product_images, public.delivery_zones
  to anon, authenticated;
grant insert, update, delete on public.categories, public.products,
                                public.product_images, public.delivery_zones
  to authenticated;
grant select on public.inventory_movements to authenticated;
grant all on public.categories, public.products, public.product_images,
             public.inventory_movements, public.delivery_zones
  to service_role;
grant usage, select on sequence public.inventory_movements_id_seq to service_role;

alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.product_images      enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.delivery_zones      enable row level security;

-- categories
drop policy if exists "Public can view categories" on public.categories;
drop policy if exists categories_select_public     on public.categories;
drop policy if exists categories_admin_write       on public.categories;
create policy categories_select_public on public.categories
  for select to anon, authenticated using (true);
create policy categories_admin_write on public.categories
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- products: visitors see only published, non-archived products
drop policy if exists "Public can view products" on public.products;
drop policy if exists products_select_public      on public.products;
drop policy if exists products_select_admin       on public.products;
drop policy if exists products_admin_write        on public.products;
create policy products_select_public on public.products
  for select to anon, authenticated
  using (is_active and archived_at is null);
create policy products_select_admin on public.products
  for select to authenticated using ((select public.is_admin()));
create policy products_admin_write on public.products
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- product_images: visible whenever the parent product is visible to the caller
drop policy if exists product_images_select on public.product_images;
drop policy if exists product_images_admin_write on public.product_images;
create policy product_images_select on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_images.product_id));
create policy product_images_admin_write on public.product_images
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- delivery_zones: public may read active zones (needed to show fees at checkout)
drop policy if exists delivery_zones_select_public on public.delivery_zones;
drop policy if exists delivery_zones_select_admin  on public.delivery_zones;
drop policy if exists delivery_zones_admin_write   on public.delivery_zones;
create policy delivery_zones_select_public on public.delivery_zones
  for select to anon, authenticated using (is_active);
create policy delivery_zones_select_admin on public.delivery_zones
  for select to authenticated using ((select public.is_admin()));
create policy delivery_zones_admin_write on public.delivery_zones
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- inventory_movements: read-only, admin only
drop policy if exists inventory_movements_select_admin on public.inventory_movements;
create policy inventory_movements_select_admin on public.inventory_movements
  for select to authenticated using ((select public.is_admin()));
