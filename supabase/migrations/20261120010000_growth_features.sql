-- Plants & Pure — growth features
--   1. email_subscribers   : footer "subscribe to updates" (one row per e-mail, no duplicates)
--   2. customer_contacts   : people who paid or phoned us, kept for promotions/updates (one row per person)
--   3. reviews             : post-delivery ratings, shown publicly only after an admin approves them
--
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
-- Conventions follow the existing migrations: RLS on, helpers is_admin()/is_staff(), SECURITY DEFINER
-- functions with an empty search_path, grants made explicit.

-- ---------------------------------------------------------------------------
-- Phone normaliser: 0596083867, +233 59 608 3867 and 233596083867 are the same person.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '[^0-9]', '', 'g');
  if d = '' then return null; end if;
  if d like '00%' then d := substr(d, 3); end if;
  if d ~ '^0[0-9]{9}$' then d := '233' || substr(d, 2); end if;
  return d;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Subscribers
-- ---------------------------------------------------------------------------
create table if not exists public.email_subscribers (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  first_name        text,
  source            text not null default 'footer',
  status            text not null default 'active',
  unsubscribe_token uuid not null default gen_random_uuid(),
  subscribed_at     timestamptz not null default now(),
  unsubscribed_at   timestamptz,
  updated_at        timestamptz not null default now(),
  constraint email_subscribers_status_valid check (status in ('active', 'unsubscribed')),
  constraint email_subscribers_email_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
create unique index if not exists email_subscribers_email_key on public.email_subscribers (lower(email));
create unique index if not exists email_subscribers_token_key on public.email_subscribers (unsubscribe_token);

alter table public.email_subscribers enable row level security;
drop policy if exists email_subscribers_select_admin on public.email_subscribers;
create policy email_subscribers_select_admin on public.email_subscribers
  for select to authenticated using ((select public.is_admin()));
revoke all on public.email_subscribers from anon, authenticated;
grant select on public.email_subscribers to authenticated;

-- Called by the server (service role) only. Returns the status and the unsubscribe token for the welcome e-mail.
create or replace function public.subscribe_email(p_email text, p_first_name text default null, p_source text default 'footer')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_row   public.email_subscribers%rowtype;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL';
  end if;

  select * into v_row from public.email_subscribers where lower(email) = v_email;
  if found then
    if v_row.status = 'unsubscribed' then
      update public.email_subscribers
         set status = 'active', unsubscribed_at = null, updated_at = now(),
             first_name = coalesce(nullif(btrim(coalesce(p_first_name, '')), ''), first_name)
       where id = v_row.id;
      return jsonb_build_object('status', 'resubscribed', 'token', v_row.unsubscribe_token);
    end if;
    return jsonb_build_object('status', 'already', 'token', v_row.unsubscribe_token);
  end if;

  insert into public.email_subscribers (email, first_name, source)
  values (v_email, nullif(btrim(coalesce(p_first_name, '')), ''), left(coalesce(nullif(btrim(p_source), ''), 'footer'), 40))
  returning * into v_row;
  return jsonb_build_object('status', 'subscribed', 'token', v_row.unsubscribe_token);
end;
$$;

create or replace function public.unsubscribe_email(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_subscribers
     set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
   where unsubscribe_token = p_token and status <> 'unsubscribed';
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Customer contacts (paid or phoned) — one row per person, no redundancies
-- ---------------------------------------------------------------------------
create table if not exists public.customer_contacts (
  id         uuid primary key default gen_random_uuid(),
  phone_key  text,            -- normalised digits, e.g. 233596083867
  phone      text,            -- as first given
  email      text,
  full_name  text,
  source     text not null default 'order',
  opted_out  boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contacts_source_valid check (source in ('order', 'call', 'admin')),
  constraint customer_contacts_has_channel check (phone_key is not null or email is not null)
);
create unique index if not exists customer_contacts_phone_key on public.customer_contacts (phone_key) where phone_key is not null;
create unique index if not exists customer_contacts_email_key on public.customer_contacts (lower(email)) where email is not null;

alter table public.customer_contacts enable row level security;
drop policy if exists customer_contacts_select_admin on public.customer_contacts;
create policy customer_contacts_select_admin on public.customer_contacts
  for select to authenticated using ((select public.is_admin()));
revoke all on public.customer_contacts from anon, authenticated;
grant select on public.customer_contacts to authenticated;

-- Matches an existing person by phone first, then e-mail; otherwise creates one. Never duplicates.
create or replace function public.upsert_customer_contact(
  p_name text, p_phone text, p_email text, p_source text default 'order', p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text := public.normalize_phone(p_phone);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_src   text := case when p_source in ('order', 'call', 'admin') then p_source else 'admin' end;
  v_id    uuid;
begin
  if v_key is null and v_email is null then return null; end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then v_email := null; end if;
  if v_key is null and v_email is null then return null; end if;

  select id into v_id
    from public.customer_contacts
   where (v_key is not null and phone_key = v_key)
      or (v_email is not null and lower(email) = v_email)
   order by (phone_key is not distinct from v_key) desc
   limit 1;

  if v_id is null then
    insert into public.customer_contacts (phone_key, phone, email, full_name, source, notes)
    values (v_key, nullif(btrim(coalesce(p_phone, '')), ''), v_email, v_name, v_src, nullif(btrim(coalesce(p_notes, '')), ''))
    returning id into v_id;
  else
    update public.customer_contacts c
       set phone_key = coalesce(c.phone_key, case when v_key is not null and not exists (select 1 from public.customer_contacts o where o.phone_key = v_key and o.id <> c.id) then v_key end),
           phone     = coalesce(c.phone, nullif(btrim(coalesce(p_phone, '')), '')),
           email     = coalesce(c.email, case when v_email is not null and not exists (select 1 from public.customer_contacts o where lower(o.email) = v_email and o.id <> c.id) then v_email end),
           full_name = coalesce(v_name, c.full_name),
           notes     = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), c.notes),
           updated_at = now()
     where c.id = v_id;
  end if;
  return v_id;
end;
$$;

-- Every paid order saves its customer automatically (covers the webhook, the status check and manual changes).
create or replace function public.orders_save_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status = 'paid' and (tg_op = 'INSERT' or old.payment_status is distinct from 'paid') then
    begin
      perform public.upsert_customer_contact(new.customer_name, new.customer_phone, new.customer_email, 'order', null);
    exception when others then
      raise warning 'orders_save_contact failed for order %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_save_contact on public.orders;
create trigger orders_save_contact
  after insert or update of payment_status on public.orders
  for each row execute function public.orders_save_contact();

-- One-off backfill: people who have already paid (newest order wins for the name).
select public.upsert_customer_contact(o.customer_name, o.customer_phone, o.customer_email, 'order', null)
  from (
    select distinct on (public.normalize_phone(customer_phone)) customer_name, customer_phone, customer_email
      from public.orders
     where payment_status = 'paid' and public.normalize_phone(customer_phone) is not null
     order by public.normalize_phone(customer_phone), created_at desc
  ) o;

-- Admin: add someone who phoned or messaged but has not paid (yet).
create or replace function public.admin_add_contact(p_name text, p_phone text, p_email text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if public.normalize_phone(p_phone) is null and nullif(btrim(coalesce(p_email, '')), '') is null then
    raise exception 'INVALID_INPUT' using detail = 'a phone number or e-mail is required';
  end if;
  return public.upsert_customer_contact(p_name, p_phone, p_email, 'call', p_notes);
end;
$$;

create or replace function public.admin_set_contact_opt_out(p_id uuid, p_opted_out boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.customer_contacts set opted_out = p_opted_out, updated_at = now() where id = p_id;
end;
$$;

-- Admin: subscribers + customers with order totals, in one call.
create or replace function public.admin_audience()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return jsonb_build_object(
    'subscribers', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.subscribed_at desc)
        from (select id, email, first_name, source, status, subscribed_at from public.email_subscribers) s
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc)
        from (
          select k.id, k.full_name, k.phone, k.email, k.source, k.opted_out, k.notes, k.created_at,
                 coalesce(o.orders, 0) as orders, coalesce(o.spent, 0) as spent
            from public.customer_contacts k
            left join lateral (
              select count(*) as orders, sum(x.total_amount) as spent
                from public.orders x
               where x.payment_status = 'paid' and k.phone_key is not null and public.normalize_phone(x.customer_phone) = k.phone_key
            ) o on true
        ) c
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reviews (one per order, approved by an admin before they go public)
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references public.orders(id) on delete cascade,
  display_name text not null,
  rating       smallint not null,
  title        text,
  body         text not null,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid,
  constraint reviews_rating_range check (rating between 1 and 5),
  constraint reviews_status_valid check (status in ('pending', 'approved', 'rejected')),
  constraint reviews_title_len check (title is null or char_length(title) <= 80),
  constraint reviews_body_len check (char_length(btrim(body)) between 10 and 800)
);
create index if not exists reviews_status_created_idx on public.reviews (status, created_at desc);

alter table public.reviews enable row level security;
drop policy if exists reviews_select_admin on public.reviews;
drop policy if exists reviews_update_admin on public.reviews;
drop policy if exists reviews_delete_admin on public.reviews;
create policy reviews_select_admin on public.reviews for select to authenticated using ((select public.is_admin()));
create policy reviews_update_admin on public.reviews for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy reviews_delete_admin on public.reviews for delete to authenticated using ((select public.is_admin()));
revoke all on public.reviews from anon, authenticated;
grant select, update, delete on public.reviews to authenticated;

create or replace function public.reviews_stamp_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.moderated_at := now();
    new.moderated_by := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists reviews_stamp_moderation on public.reviews;
create trigger reviews_stamp_moderation before update on public.reviews
  for each row execute function public.reviews_stamp_moderation();

-- Public, approved-only view of the reviews. The site shows the section only once `count` reaches its threshold.
create or replace function public.public_testimonials(p_limit integer default 24)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'count', (select count(*) from public.reviews where status = 'approved'),
    'average', (select round(avg(rating)::numeric, 1) from public.reviews where status = 'approved'),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r))
        from (
          select id, display_name as name, rating, title, body, created_at
            from public.reviews
           where status = 'approved'
           order by created_at desc
           limit least(greatest(coalesce(p_limit, 24), 1), 60)
        ) r
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit, like the existing migrations)
-- ---------------------------------------------------------------------------
revoke all on function public.subscribe_email(text, text, text)                    from public, anon, authenticated;
revoke all on function public.unsubscribe_email(uuid)                              from public, anon, authenticated;
revoke all on function public.upsert_customer_contact(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.orders_save_contact()                                from public, anon, authenticated;
revoke all on function public.reviews_stamp_moderation()                           from public, anon, authenticated;
revoke all on function public.admin_add_contact(text, text, text, text)            from public, anon;
revoke all on function public.admin_set_contact_opt_out(uuid, boolean)             from public, anon;
revoke all on function public.admin_audience()                                     from public, anon;
revoke all on function public.public_testimonials(integer)                         from public;

grant execute on function public.subscribe_email(text, text, text)                     to service_role;
grant execute on function public.unsubscribe_email(uuid)                               to service_role;
grant execute on function public.upsert_customer_contact(text, text, text, text, text) to service_role;
grant execute on function public.admin_add_contact(text, text, text, text)             to authenticated, service_role;
grant execute on function public.admin_set_contact_opt_out(uuid, boolean)              to authenticated, service_role;
grant execute on function public.admin_audience()                                      to authenticated, service_role;
grant execute on function public.public_testimonials(integer)                          to anon, authenticated, service_role;
grant execute on function public.normalize_phone(text)                                 to anon, authenticated, service_role;
