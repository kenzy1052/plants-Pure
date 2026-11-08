-- =============================================================================
-- Migration 04 — orders, order items, payments, payment events, email log
-- Plants & Pure Limited · Phase 1
--
-- CRITICAL SECURITY FIX included here
--   The existing schema has the policies
--       "Anyone can create orders"        FOR INSERT WITH CHECK (true)
--       "Anyone can insert order items"   FOR INSERT WITH CHECK (true)
--   which let ANY visitor (even signed-out) insert orders with any total and any
--   payment_status — including 'paid'. They are dropped below. From now on
--   orders are created only by server code through create_checkout_order().
--
-- Payment model (all state changes happen inside Postgres, under row locks)
--   payments        one row per payment ATTEMPT (unique Paystack reference)
--   payment_events  every verified webhook, de-duplicated (idempotency)
--   apply_payment_result()  the single place that can mark an order paid
-- =============================================================================

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
-- 0. Remove the dangerous open-insert policies FIRST.
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can create orders"      on public.orders;
drop policy if exists "Anyone can insert order items" on public.order_items;

-- ---------------------------------------------------------------------------
-- 1. orders
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists public_id         uuid not null default gen_random_uuid(),
  add column if not exists delivery_zone_id  uuid references public.delivery_zones (id) on delete set null,
  add column if not exists client_request_id uuid,
  add column if not exists requires_review   boolean not null default false,
  add column if not exists paid_at           timestamptz,
  add column if not exists cancelled_at      timestamptz;

create unique index if not exists orders_public_id_key on public.orders (public_id);
create unique index if not exists orders_client_request_id_key
  on public.orders (client_request_id) where client_request_id is not null;
create index if not exists orders_user_created_idx   on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx         on public.orders (payment_status, fulfillment_status, created_at desc);
create index if not exists orders_review_idx         on public.orders (created_at desc) where requires_review;

select pg_temp.add_check('public.orders', 'orders_payment_status_valid',
  $c$payment_status in ('pending','paid','failed','cancelled','refunded','review')$c$);
select pg_temp.add_check('public.orders', 'orders_fulfillment_status_valid',
  $c$fulfillment_status in ('unfulfilled','processing','dispatched','delivered','cancelled','on_hold')$c$);
select pg_temp.add_check('public.orders', 'orders_amounts_nonneg',
  $c$subtotal >= 0 and delivery_fee >= 0 and total_amount >= 0$c$);
select pg_temp.add_check('public.orders', 'orders_total_consistent',
  $c$total_amount = subtotal + delivery_fee$c$);
select pg_temp.add_check('public.orders', 'orders_currency_ghs', $c$currency = 'GHS'$c$);
select pg_temp.add_check('public.orders', 'orders_email_format',
  $c$customer_email is null or customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'$c$);
-- Nothing may be shipped before it is paid (or refunded after having been paid).
select pg_temp.add_check('public.orders', 'orders_fulfilment_requires_payment',
  $c$fulfillment_status in ('unfulfilled','cancelled','on_hold') or payment_status in ('paid','refunded')$c$);

comment on column public.orders.paystack_reference is
  'DEPRECATED (Phase 1): public.payments is the source of truth for payment attempts. Not written by new code.';
comment on column public.orders.public_id is
  'Unguessable identifier for receipts / guest order lookup. order_number is for humans only and grants no access.';

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. order_items  (purchase-time snapshot)
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists product_slug text,
  add column if not exists snapshot     jsonb not null default '{}'::jsonb;

select pg_temp.add_check('public.order_items', 'order_items_quantity_range', $c$quantity between 1 and 1000$c$);
select pg_temp.add_check('public.order_items', 'order_items_amounts_valid',
  $c$unit_price >= 0 and total_price = unit_price * quantity$c$);

create index if not exists order_items_order_idx   on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);
create unique index if not exists order_items_order_product_key
  on public.order_items (order_id, product_id) where product_id is not null;

comment on column public.order_items.snapshot is
  'Product facts at the moment of purchase (title, slug, sku, weight, cover image). Later product edits never rewrite history.';

-- ---------------------------------------------------------------------------
-- 3. payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references public.orders (id) on delete restrict,
  provider                text not null default 'paystack' check (provider = 'paystack'),
  reference               text not null unique
                            check (reference ~ '^[A-Za-z0-9_.=-]{8,100}$'),
  status                  text not null default 'initiated'
                            check (status in ('initiated','pending','success','failed',
                                              'abandoned','cancelled','refunded','review')),
  amount_minor            bigint not null check (amount_minor > 0),   -- expected, in pesewas
  currency                text   not null default 'GHS' check (currency = 'GHS'),
  paid_amount_minor       bigint,                                     -- what Paystack reported
  paid_currency           text,
  provider_transaction_id text,
  channel                 text,
  gateway_response        text,
  access_code             text,
  authorization_url       text,
  failure_reason          text,
  review_note             text,
  initiated_at            timestamptz not null default now(),
  verified_at             timestamptz,
  paid_at                 timestamptz,
  last_event_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists payments_order_idx  on public.payments (order_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at desc);
-- An order can be paid at most once: a second success for the same order cannot be
-- recorded as 'success' (apply_payment_result routes it to 'review' instead).
create unique index if not exists payments_one_success_per_order
  on public.payments (order_id) where status = 'success';

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. payment_events  (webhook log + idempotency)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id                bigint generated always as identity primary key,
  provider          text not null default 'paystack',
  dedupe_key        text not null,
  event_type        text not null,
  reference         text,
  payload           jsonb not null,
  processing_status text not null default 'received'
                      check (processing_status in ('received','processed','ignored','failed')),
  attempts          integer not null default 1,
  error             text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  constraint payment_events_dedupe unique (provider, dedupe_key)
);
create index if not exists payment_events_reference_idx on public.payment_events (reference);

-- ---------------------------------------------------------------------------
-- 5. email_log  (send-once guarantee for transactional email)
-- ---------------------------------------------------------------------------
create table if not exists public.email_log (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('order_confirmation','admin_new_order')),
  order_id            uuid not null references public.orders (id) on delete cascade,
  recipient           text not null,
  status              text not null default 'claimed'
                        check (status in ('claimed','sent','failed','skipped')),
  provider_message_id text,
  error               text,
  attempts            integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz,
  constraint email_log_once_per_order unique (kind, order_id)
);

drop trigger if exists email_log_set_updated_at on public.email_log;
create trigger email_log_set_updated_at
  before update on public.email_log
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on public.orders, public.order_items, public.payments,
              public.payment_events, public.email_log
  from anon, authenticated;
revoke all on sequence public.orders_order_number_seq from anon, authenticated;

grant select on public.orders, public.order_items, public.payments,
                public.payment_events, public.email_log
  to authenticated;
-- Fulfilment staff may change ONLY the fulfilment status of an order.
grant update (fulfillment_status) on public.orders to authenticated;

grant all on public.orders, public.order_items, public.payments, public.email_log to service_role;
-- the webhook ledger is never deleted by the application
revoke all on public.payment_events from service_role;
grant select, insert, update on public.payment_events to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.payments       enable row level security;
alter table public.payment_events enable row level security;
alter table public.email_log      enable row level security;

drop policy if exists orders_select_own    on public.orders;
drop policy if exists orders_select_staff  on public.orders;
drop policy if exists orders_update_staff  on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy orders_select_staff on public.orders
  for select to authenticated using ((select public.is_staff()));
create policy orders_update_staff on public.orders
  for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select to authenticated
  -- visible exactly when the parent order is visible to the caller (orders RLS applies)
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));

drop policy if exists payments_select_admin       on public.payments;
drop policy if exists payment_events_select_admin on public.payment_events;
drop policy if exists email_log_select_admin      on public.email_log;
create policy payments_select_admin on public.payments
  for select to authenticated using ((select public.is_admin()));
create policy payment_events_select_admin on public.payment_events
  for select to authenticated using ((select public.is_admin()));
create policy email_log_select_admin on public.email_log
  for select to authenticated using ((select public.is_admin()));

-- ===========================================================================
-- 7. Server-side functions (service_role only)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- create_checkout_order
--   The ONLY way an order comes into existence. Prices, stock, the delivery fee
--   and totals are all read from the database — nothing is trusted from the
--   client. Idempotent on p_client_request_id (double-click / retry safe).
--   Error contract: RAISE EXCEPTION '<CODE>' USING ERRCODE='P0001', DETAIL=…
-- ---------------------------------------------------------------------------
create or replace function public.create_checkout_order(
  p_client_request_id uuid,
  p_user_id           uuid,
  p_customer_name     text,
  p_customer_phone    text,
  p_customer_email    text,
  p_delivery_address  text,
  p_delivery_zone_id  uuid,
  p_notes             text,
  p_items             jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_lines     constant integer := 50;
  c_max_line_qty  constant integer := 100;
  v_existing      public.orders;
  v_order         public.orders;
  v_zone          public.delivery_zones;
  v_prod          public.products;
  v_line          record;
  v_lines         jsonb := '[]'::jsonb;
  v_subtotal      numeric(10,2) := 0;
  v_fee           numeric(10,2);
  v_name          text := btrim(coalesce(p_customer_name, ''));
  v_phone         text := btrim(coalesce(p_customer_phone, ''));
  v_email         text := nullif(btrim(coalesce(p_customer_email, '')), '');
  v_address       text := btrim(coalesce(p_delivery_address, ''));
  v_notes         text := nullif(left(btrim(coalesce(p_notes, '')), 500), '');
  v_cover         text;
  v_item          jsonb;
begin
  -- Idempotent replay
  if p_client_request_id is not null then
    select * into v_existing from public.orders o where o.client_request_id = p_client_request_id;
    if found then
      if v_existing.user_id is distinct from p_user_id then
        raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
      end if;
      return jsonb_build_object(
        'order_id', v_existing.id, 'public_id', v_existing.public_id,
        'order_number', v_existing.order_number,
        'subtotal', v_existing.subtotal, 'delivery_fee', v_existing.delivery_fee,
        'total_amount', v_existing.total_amount, 'currency', v_existing.currency,
        'amount_minor', (v_existing.total_amount * 100)::bigint,
        'payment_status', v_existing.payment_status, 'reused', true);
    end if;
  end if;

  -- Customer details
  if char_length(v_name) not between 2 and 120 then
    raise exception 'INVALID_CUSTOMER_DETAILS' using errcode = 'P0001', detail = 'customer_name';
  end if;
  if v_phone !~ '^[0-9+()\-\s]{7,20}$' then
    raise exception 'INVALID_CUSTOMER_DETAILS' using errcode = 'P0001', detail = 'customer_phone';
  end if;
  if char_length(v_address) not between 5 and 300 then
    raise exception 'INVALID_CUSTOMER_DETAILS' using errcode = 'P0001', detail = 'delivery_address';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_CUSTOMER_DETAILS' using errcode = 'P0001', detail = 'customer_email';
  end if;

  -- Items: shape validation before any cast
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and c_max_lines then
    raise exception 'INVALID_ITEMS' using errcode = 'P0001', detail = 'items must be an array of 1..' || c_max_lines;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(e -> 'quantity') <> 'number'
       or coalesce(e ->> 'quantity', '') !~ '^[0-9]{1,4}$'
  ) then
    raise exception 'INVALID_ITEMS' using errcode = 'P0001', detail = 'each item needs a uuid product_id and an integer quantity';
  end if;

  -- Merge duplicate lines, validate against the live catalogue, price from the DB
  for v_line in
    select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::integer) as qty
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    if v_line.qty < 1 or v_line.qty > c_max_line_qty then
      raise exception 'INVALID_ITEMS' using errcode = 'P0001',
        detail = format('quantity per product must be 1..%s', c_max_line_qty);
    end if;

    select * into v_prod
    from public.products p
    where p.id = v_line.product_id and p.is_active and p.archived_at is null;
    if not found then
      raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001', detail = v_line.product_id::text;
    end if;

    if v_prod.stock < v_line.qty then
      raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001',
        detail = format('%s|%s', v_prod.id, v_prod.stock);
    end if;

    select pi.cloudinary_public_id into v_cover
    from public.product_images pi
    where pi.product_id = v_prod.id
    order by pi.is_cover desc, pi.position asc
    limit 1;

    v_subtotal := v_subtotal + (v_prod.price * v_line.qty);
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_prod.id,
      'title',      v_prod.title,
      'slug',       v_prod.slug,
      'sku',        v_prod.sku,
      'unit_price', v_prod.price,
      'quantity',   v_line.qty,
      'snapshot',   jsonb_build_object(
                      'title', v_prod.title, 'slug', v_prod.slug, 'sku', v_prod.sku,
                      'weight_grams', v_prod.weight_grams, 'category_id', v_prod.category_id,
                      'cover_public_id', v_cover));
  end loop;

  -- Delivery
  select * into v_zone from public.delivery_zones z where z.id = p_delivery_zone_id and z.is_active;
  if not found then
    raise exception 'DELIVERY_ZONE_INVALID' using errcode = 'P0001';
  end if;
  v_fee := case when v_zone.free_over is not null and v_subtotal >= v_zone.free_over
                then 0 else v_zone.fee end;

  -- Insert (a concurrent request with the same idempotency key hits the unique index)
  begin
    insert into public.orders (
      client_request_id, user_id, customer_name, customer_phone, customer_email,
      delivery_address, delivery_area, delivery_zone_id, delivery_fee, subtotal,
      total_amount, currency, notes, payment_status, fulfillment_status)
    values (
      p_client_request_id, p_user_id, v_name, v_phone, v_email,
      v_address, v_zone.name, v_zone.id, v_fee, v_subtotal,
      v_subtotal + v_fee, 'GHS', v_notes, 'pending', 'unfulfilled')
    returning * into v_order;
  exception when unique_violation then
    select * into v_existing from public.orders o where o.client_request_id = p_client_request_id;
    if found and v_existing.user_id is not distinct from p_user_id then
      return jsonb_build_object(
        'order_id', v_existing.id, 'public_id', v_existing.public_id,
        'order_number', v_existing.order_number,
        'subtotal', v_existing.subtotal, 'delivery_fee', v_existing.delivery_fee,
        'total_amount', v_existing.total_amount, 'currency', v_existing.currency,
        'amount_minor', (v_existing.total_amount * 100)::bigint,
        'payment_status', v_existing.payment_status, 'reused', true);
    end if;
    raise;
  end;

  for v_item in select * from jsonb_array_elements(v_lines) loop
    insert into public.order_items (
      order_id, product_id, product_title, product_sku, product_slug,
      quantity, unit_price, total_price, snapshot)
    values (
      v_order.id, (v_item ->> 'product_id')::uuid, v_item ->> 'title', v_item ->> 'sku', v_item ->> 'slug',
      (v_item ->> 'quantity')::integer, (v_item ->> 'unit_price')::numeric,
      (v_item ->> 'unit_price')::numeric * (v_item ->> 'quantity')::integer, v_item -> 'snapshot');
  end loop;

  return jsonb_build_object(
    'order_id', v_order.id, 'public_id', v_order.public_id, 'order_number', v_order.order_number,
    'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
    'total_amount', v_order.total_amount, 'currency', v_order.currency,
    'amount_minor', (v_order.total_amount * 100)::bigint,
    'payment_status', v_order.payment_status, 'reused', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- begin_payment_attempt — one payment attempt row per Paystack reference.
-- Reuses a recent open attempt (so a refresh doesn't create a second charge page).
-- ---------------------------------------------------------------------------
create or replace function public.begin_payment_attempt(p_order_id uuid, p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_reuse_window    constant interval := interval '30 minutes';
  c_in_flight_window constant interval := interval '60 seconds';
  v_order public.orders;
  v_pay   public.payments;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order.payment_status not in ('pending', 'failed') then
    raise exception 'ORDER_NOT_PAYABLE' using errcode = 'P0001', detail = v_order.payment_status;
  end if;

  for v_pay in
    select * from public.payments p
    where p.order_id = p_order_id and p.status in ('initiated', 'pending')
    order by p.created_at desc
    for update
  loop
    if v_pay.status = 'pending' and v_pay.authorization_url is not null
       and v_pay.created_at > now() - c_reuse_window then
      return jsonb_build_object(
        'payment_id', v_pay.id, 'reference', v_pay.reference, 'status', v_pay.status,
        'amount_minor', v_pay.amount_minor, 'authorization_url', v_pay.authorization_url,
        'access_code', v_pay.access_code, 'reused', true);
    elsif v_pay.status = 'initiated' and v_pay.created_at > now() - c_in_flight_window then
      raise exception 'PAYMENT_INIT_IN_PROGRESS' using errcode = 'P0001';
    else
      -- stale open attempt: close it. A late success webhook can still settle it.
      update public.payments set status = 'abandoned', failure_reason = 'superseded_by_new_attempt'
      where id = v_pay.id;
    end if;
  end loop;

  insert into public.payments (order_id, reference, status, amount_minor, currency)
  values (p_order_id, p_reference, 'initiated', (v_order.total_amount * 100)::bigint, v_order.currency)
  returning * into v_pay;

  if v_order.payment_status = 'failed' then
    update public.orders set payment_status = 'pending' where id = v_order.id;
  end if;

  return jsonb_build_object(
    'payment_id', v_pay.id, 'reference', v_pay.reference, 'status', v_pay.status,
    'amount_minor', v_pay.amount_minor, 'authorization_url', null, 'access_code', null,
    'reused', false);
end;
$$;

create or replace function public.mark_payment_initialized(
  p_reference text, p_access_code text, p_authorization_url text
) returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments
     set status = 'pending', access_code = p_access_code, authorization_url = p_authorization_url,
         last_event_at = now()
   where reference = p_reference and status = 'initiated'
$$;

create or replace function public.mark_payment_init_failed(p_reference text, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'initialization_failed'), 300),
         last_event_at = now()
   where reference = p_reference and status = 'initiated'
$$;

-- ---------------------------------------------------------------------------
-- record_payment_event — idempotent webhook ledger.
--   first delivery            → {event_id, already_processed:false}
--   duplicate, finished        → {event_id, already_processed:true}   (caller returns 200)
--   duplicate, never finished  → {event_id, already_processed:false}  (safe to retry)
-- ---------------------------------------------------------------------------
create or replace function public.record_payment_event(
  p_dedupe_key text, p_event_type text, p_reference text, p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     bigint;
  v_status text;
begin
  insert into public.payment_events (provider, dedupe_key, event_type, reference, payload)
  values ('paystack', p_dedupe_key, p_event_type, p_reference, p_payload)
  on conflict (provider, dedupe_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('event_id', v_id, 'already_processed', false);
  end if;

  update public.payment_events
     set attempts = attempts + 1
   where provider = 'paystack' and dedupe_key = p_dedupe_key
  returning id, processing_status into v_id, v_status;

  return jsonb_build_object('event_id', v_id,
                            'already_processed', v_status in ('processed', 'ignored'));
end;
$$;

create or replace function public.complete_payment_event(
  p_event_id bigint, p_status text, p_error text default null
) returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_events
     set processing_status = p_status, error = left(p_error, 500), processed_at = now()
   where id = p_event_id and p_status in ('processed', 'ignored', 'failed')
$$;

-- ---------------------------------------------------------------------------
-- apply_payment_result — THE state machine. Called only after the server has
-- verified the transaction directly with Paystack. Idempotent and race-safe:
-- everything for one order is serialised by the order row lock.
--
--   input status  : Paystack's own transaction status string
--   success       : requires amount + currency to match what we asked Paystack to
--                   charge; commits stock; moves order to paid. Else → 'review'.
--   failed/abandoned/cancelled/pending/refunded : recorded; never mark paid.
--   a payment already 'success' is never downgraded (except to 'refunded').
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment_result(
  p_reference         text,
  p_provider_status   text,
  p_paid_amount_minor bigint,
  p_currency          text,
  p_provider_txn_id   text,
  p_channel           text,
  p_gateway_response  text,
  p_paid_at           timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay        public.payments;
  v_order      public.orders;
  v_new        text;
  v_item       record;
  v_short      jsonb := '[]'::jsonb;
  v_available  integer;
  v_note       text;
  v_other_open boolean;
  v_result     jsonb;
begin
  select * into v_pay from public.payments p where p.reference = p_reference;
  if not found then
    return jsonb_build_object('outcome', 'unknown_reference', 'transitioned', false);
  end if;

  -- Serialise everything for this order, then re-read the payment under the lock.
  select * into v_order from public.orders o where o.id = v_pay.order_id for update;
  select * into v_pay   from public.payments p where p.id = v_pay.id for update;

  v_new := case lower(coalesce(p_provider_status, ''))
    when 'success'    then 'success'
    when 'failed'     then 'failed'
    when 'abandoned'  then 'abandoned'
    when 'cancelled'  then 'cancelled'
    when 'reversed'   then 'refunded'
    when 'refunded'   then 'refunded'
    when 'pending'    then 'pending'
    when 'ongoing'    then 'pending'
    when 'processing' then 'pending'
    when 'queued'     then 'pending'
    else null
  end;
  if v_new is null then
    raise exception 'UNKNOWN_PROVIDER_STATUS' using errcode = 'P0001', detail = p_provider_status;
  end if;

  v_result := jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number, 'public_id', v_order.public_id,
    'customer_email', v_order.customer_email, 'reference', v_pay.reference);

  -- ---- Already settled ------------------------------------------------------
  if v_pay.status = 'refunded' then
    return v_result || jsonb_build_object('outcome', 'already_refunded', 'transitioned', false,
                                          'payment_status', v_order.payment_status);
  end if;

  if v_pay.status = 'success' then
    if v_new = 'refunded' then
      update public.payments set status = 'refunded', last_event_at = now(),
             review_note = 'Refunded at provider. Stock was NOT restored automatically.'
       where id = v_pay.id;
      update public.orders set payment_status = 'refunded', requires_review = true where id = v_order.id;
      return v_result || jsonb_build_object('outcome', 'refunded', 'transitioned', false,
                                            'payment_status', 'refunded');
    end if;
    return v_result || jsonb_build_object('outcome', 'already_success', 'transitioned', false,
                                          'payment_status', v_order.payment_status);
  end if;

  -- ---- Success --------------------------------------------------------------
  if v_new = 'success' then
    if p_paid_amount_minor is distinct from v_pay.amount_minor
       or upper(coalesce(p_currency, '')) is distinct from v_pay.currency then
      update public.payments
         set status = 'review', paid_amount_minor = p_paid_amount_minor, paid_currency = p_currency,
             provider_transaction_id = p_provider_txn_id, channel = p_channel,
             gateway_response = left(p_gateway_response, 300), verified_at = now(), last_event_at = now(),
             failure_reason = 'amount_or_currency_mismatch',
             review_note = format('Expected %s %s minor units, provider reported %s %s.',
                                  v_pay.currency, v_pay.amount_minor, coalesce(p_currency, '?'), p_paid_amount_minor)
       where id = v_pay.id;
      update public.orders set payment_status = 'review', requires_review = true where id = v_order.id;
      return v_result || jsonb_build_object('outcome', 'mismatch', 'transitioned', false,
                                            'payment_status', 'review');
    end if;

    if v_order.payment_status in ('paid', 'refunded') then
      -- A different attempt already settled this order: this is a duplicate charge.
      update public.payments
         set status = 'review', paid_amount_minor = p_paid_amount_minor, paid_currency = p_currency,
             provider_transaction_id = p_provider_txn_id, channel = p_channel, verified_at = now(),
             last_event_at = now(), failure_reason = 'duplicate_payment',
             review_note = 'Customer paid this order more than once. Refund this reference.'
       where id = v_pay.id;
      update public.orders set requires_review = true where id = v_order.id;
      return v_result || jsonb_build_object('outcome', 'duplicate_payment', 'transitioned', false,
                                            'payment_status', v_order.payment_status);
    end if;

    if v_order.payment_status = 'cancelled' then
      update public.payments
         set status = 'review', paid_amount_minor = p_paid_amount_minor, paid_currency = p_currency,
             provider_transaction_id = p_provider_txn_id, channel = p_channel, verified_at = now(),
             last_event_at = now(), failure_reason = 'paid_after_cancellation',
             review_note = 'Payment received after the order was cancelled. Refund or reinstate.'
       where id = v_pay.id;
      update public.orders set payment_status = 'review', requires_review = true where id = v_order.id;
      return v_result || jsonb_build_object('outcome', 'paid_after_cancellation', 'transitioned', false,
                                            'payment_status', 'review');
    end if;

    -- Commit: payment → success, order → paid
    update public.payments
       set status = 'success', paid_amount_minor = p_paid_amount_minor, paid_currency = upper(p_currency),
           provider_transaction_id = p_provider_txn_id, channel = p_channel,
           gateway_response = left(p_gateway_response, 300),
           paid_at = coalesce(p_paid_at, now()), verified_at = now(), last_event_at = now(),
           failure_reason = null
     where id = v_pay.id;

    update public.orders
       set payment_status = 'paid', paid_at = coalesce(p_paid_at, now())
     where id = v_order.id;

    -- Stock: conditional decrement per line, in product-id order (no deadlocks),
    -- labelled for the inventory ledger.
    perform set_config('app.stock_reason', 'sale', true);
    perform set_config('app.order_id', v_order.id::text, true);

    for v_item in
      select oi.product_id, oi.quantity, oi.product_title
      from public.order_items oi
      where oi.order_id = v_order.id and oi.product_id is not null
      order by oi.product_id
    loop
      update public.products p
         set stock = p.stock - v_item.quantity
       where p.id = v_item.product_id and p.stock >= v_item.quantity;
      if not found then
        select p.stock into v_available from public.products p where p.id = v_item.product_id;
        v_short := v_short || jsonb_build_object(
          'product_id', v_item.product_id, 'title', v_item.product_title,
          'requested', v_item.quantity, 'available', coalesce(v_available, 0));
      end if;
    end loop;

    perform set_config('app.stock_reason', '', true);
    perform set_config('app.order_id', '', true);

    if jsonb_array_length(v_short) > 0 then
      -- Money is taken but we cannot ship everything: hold the order for a human.
      v_note := 'Paid, but stock was insufficient for: ' || (
        select string_agg(format('%s (wanted %s, had %s)', s ->> 'title', s ->> 'requested', s ->> 'available'), '; ')
        from jsonb_array_elements(v_short) s);
      update public.payments set review_note = left(v_note, 500) where id = v_pay.id;
      update public.orders set requires_review = true, fulfillment_status = 'on_hold' where id = v_order.id;
    end if;

    return v_result || jsonb_build_object(
      'outcome', 'paid', 'transitioned', true, 'payment_status', 'paid', 'shortfalls', v_short);
  end if;

  -- ---- Refund notice for something that never succeeded: ignore --------------
  if v_new = 'refunded' then
    return v_result || jsonb_build_object('outcome', 'ignored', 'transitioned', false,
                                          'payment_status', v_order.payment_status);
  end if;

  -- ---- Pending / failed / abandoned / cancelled ------------------------------
  update public.payments
     set status = v_new,
         channel = coalesce(p_channel, channel),
         gateway_response = coalesce(left(p_gateway_response, 300), gateway_response),
         failure_reason = case when v_new in ('failed', 'abandoned', 'cancelled')
                               then coalesce(left(p_gateway_response, 300), v_new) else failure_reason end,
         last_event_at = now(), verified_at = now()
   where id = v_pay.id;

  if v_new = 'failed' and v_order.payment_status = 'pending' then
    select exists (select 1 from public.payments p
                   where p.order_id = v_order.id and p.id <> v_pay.id and p.status in ('initiated', 'pending'))
      into v_other_open;
    if not v_other_open then
      update public.orders set payment_status = 'failed' where id = v_order.id;
    end if;
  end if;

  return v_result || jsonb_build_object(
    'outcome', v_new, 'transitioned', false,
    'payment_status', (select o.payment_status from public.orders o where o.id = v_order.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Order cancellation for unpaid orders (customer abandons, or stale cleanup)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_unpaid_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_order.payment_status not in ('pending', 'failed') then
    return jsonb_build_object('outcome', 'not_cancellable', 'payment_status', v_order.payment_status);
  end if;

  update public.orders
     set payment_status = 'cancelled', fulfillment_status = 'cancelled', cancelled_at = now()
   where id = v_order.id;
  update public.payments
     set status = 'cancelled', failure_reason = 'order_cancelled'
   where order_id = v_order.id and status in ('initiated', 'pending');

  return jsonb_build_object('outcome', 'cancelled', 'order_id', v_order.id);
end;
$$;

create or replace function public.expire_stale_pending_orders(p_older_than interval default interval '24 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  if p_older_than < interval '1 hour' then
    raise exception 'p_older_than must be at least 1 hour' using errcode = 'P0001';
  end if;
  for v_id in
    select o.id from public.orders o
    where o.payment_status in ('pending', 'failed')
      and o.created_at < now() - p_older_than
    order by o.created_at
    limit 500
  loop
    if (public.cancel_unpaid_order(v_id) ->> 'outcome') = 'cancelled' then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactional e-mail: send-once claim
--   true  → caller owns the send (first time, or a retry after failure / stale claim)
--   false → someone else sent / is sending it
-- ---------------------------------------------------------------------------
create or replace function public.claim_email(p_kind text, p_order_id uuid, p_recipient text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.email_log (kind, order_id, recipient, status)
  values (p_kind, p_order_id, p_recipient, 'claimed')
  on conflict (kind, order_id) do update
     set status = 'claimed', attempts = public.email_log.attempts + 1, recipient = excluded.recipient
   where public.email_log.status = 'failed'
      or (public.email_log.status = 'claimed' and public.email_log.updated_at < now() - interval '10 minutes')
  returning id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.finish_email(
  p_kind text, p_order_id uuid, p_status text, p_message_id text, p_error text
) returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_log
     set status = p_status, provider_message_id = p_message_id, error = left(p_error, 500),
         sent_at = case when p_status = 'sent' then now() else sent_at end
   where kind = p_kind and order_id = p_order_id and p_status in ('sent', 'failed', 'skipped')
$$;

-- ---------------------------------------------------------------------------
-- Lock the functions down: server (service_role) only.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_checkout_order(uuid,uuid,text,text,text,text,uuid,text,jsonb)',
    'public.begin_payment_attempt(uuid,text)',
    'public.mark_payment_initialized(text,text,text)',
    'public.mark_payment_init_failed(text,text)',
    'public.record_payment_event(text,text,text,jsonb)',
    'public.complete_payment_event(bigint,text,text)',
    'public.apply_payment_result(text,text,bigint,text,text,text,text,timestamptz)',
    'public.cancel_unpaid_order(uuid)',
    'public.expire_stale_pending_orders(interval)',
    'public.claim_email(text,uuid,text)',
    'public.finish_email(text,uuid,text,text,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
