-- =============================================================================
-- Migration 06 — managed catalogue: lifecycle, publication rules, categories,
-- images, stock operations
-- Plants & Pure Limited · Phase 4
--
-- Builds on migrations 01–05 (already applied). Re-runnable. Nothing is dropped
-- or recreated, no row is deleted. Rollback script:
--   supabase/rollback/20261025010000_catalogue_management.down.sql
--
-- WHAT THIS ADDS
--   categories   is_active; case-insensitive unique names; products can no longer
--                be orphaned by deleting a category (FK was ON DELETE SET NULL)
--   products     currency, created_by/updated_by, version (optimistic locking),
--                low_stock_threshold, derived status (draft|published|archived)
--   rules        a product cannot be published unless it has a title, slug,
--                description, a price above zero, an ACTIVE category and a cover
--                image — enforced by a trigger, so it holds for every writer
--                (admin RPC, direct API call, SQL editor, service role)
--   functions    admin_* operations. They run as the signed-in admin
--                (SECURITY DEFINER but gated by is_admin() on the caller's JWT),
--                so auth.uid() — and therefore the audit log — names the person.
--   privacy      anon/authenticated can no longer SELECT internal product columns
--                (sku, created_by, updated_by, version, low_stock_threshold, status)
--
-- DECISIONS
--   * Every product is stock-tracked. There is no "untracked" mode, because the
--     checkout functions would have to special-case it (Phase 6) and the business
--     sells packaged goods only.
--   * Product variants are NOT modelled here (see docs/DECISIONS.md D-19).
--   * products.image_urls stays (deprecated, unused by the app). It is dropped only
--     after the owner approves.
--   * status is DERIVED from is_active + archived_at (the existing model), not a
--     second source of truth.
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
-- categories
-- ---------------------------------------------------------------------------
alter table public.categories add column if not exists is_active boolean not null default true;

-- "Spices", " spices " and "SPICES" are the same category.
create unique index if not exists categories_name_ci_key on public.categories (lower(btrim(name)));

-- Deleting a category must never silently orphan products.
alter table public.products drop constraint if exists products_category_id_fkey;
alter table public.products
  add constraint products_category_id_fkey
  foreign key (category_id) references public.categories (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- products: new columns
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists currency            text    not null default 'GHS',
  add column if not exists created_by          uuid,
  add column if not exists updated_by          uuid,
  add column if not exists version             integer not null default 1,
  add column if not exists low_stock_threshold integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_created_by_fkey') then
    alter table public.products add constraint products_created_by_fkey
      foreign key (created_by) references auth.users (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_updated_by_fkey') then
    alter table public.products add constraint products_updated_by_fkey
      foreign key (updated_by) references auth.users (id) on delete set null;
  end if;
end $$;

-- Derived lifecycle state (one source of truth: is_active + archived_at).
alter table public.products add column if not exists status text
  generated always as (
    case when archived_at is not null then 'archived'
         when is_active              then 'published'
         else 'draft' end
  ) stored;

select pg_temp.add_check('public.products', 'products_currency_ghs',        $c$currency = 'GHS'$c$);
select pg_temp.add_check('public.products', 'products_low_stock_nonneg',    $c$low_stock_threshold is null or low_stock_threshold >= 0$c$);
select pg_temp.add_check('public.products', 'products_stock_max',           $c$stock <= 1000000$c$);
select pg_temp.add_check('public.products', 'products_price_max',           $c$price <= 1000000$c$);
select pg_temp.add_check('public.products', 'products_archived_not_active', $c$not (archived_at is not null and is_active)$c$);

create index if not exists products_status_updated_idx on public.products (status, updated_at desc);
-- SKU lookups are case-insensitive ("tm-001" == "TM-001").
create unique index if not exists products_sku_ci_key on public.products (lower(sku)) where sku is not null;

comment on column public.products.currency is 'ISO currency of price/compare_at_price. Only GHS is supported (the store sells in cedis).';
comment on column public.products.version is 'Bumped on every change to catalogue content (not stock). Used for stale-edit protection.';
comment on column public.products.status is 'Derived: archived if archived_at is set, published if is_active, otherwise draft.';
comment on column public.products.image_urls is
  'DEPRECATED and unused by the application (Phase 4). Kept so no data is lost; drop only with the owner''s approval.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end;
$$;

-- What is still missing before a product may be published? ('' array = nothing).
create or replace function public.product_publication_problems(p public.products)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_problems text[] := '{}';
  v_images   integer;
  v_covers   integer;
  v_cat      public.categories;
begin
  if p.title is null or char_length(btrim(p.title)) = 0 then v_problems := array_append(v_problems, 'title_missing'); end if;
  if p.slug  is null or char_length(btrim(p.slug))  = 0 then v_problems := array_append(v_problems, 'slug_missing');  end if;
  if p.description is null or char_length(btrim(p.description)) < 10 then v_problems := array_append(v_problems, 'description_missing'); end if;
  if p.price is null or p.price <= 0 then v_problems := array_append(v_problems, 'price_invalid'); end if;

  if p.category_id is null then
    v_problems := array_append(v_problems, 'category_missing');
  else
    select * into v_cat from public.categories c where c.id = p.category_id;
    if not found then v_problems := array_append(v_problems, 'category_missing');
    elsif not v_cat.is_active then v_problems := array_append(v_problems, 'category_inactive');
    end if;
  end if;

  select count(*), count(*) filter (where pi.is_cover) into v_images, v_covers
  from public.product_images pi where pi.product_id = p.id;
  if v_images = 0 then v_problems := array_append(v_problems, 'image_missing');
  elsif v_covers <> 1 then v_problems := array_append(v_problems, 'cover_missing');
  end if;

  return v_problems;
end;
$$;

create or replace function public._product_json(p public.products)
returns jsonb
language sql
immutable
set search_path = ''
as $$ select to_jsonb(p) - 'search_tsv' $$;

-- ---------------------------------------------------------------------------
-- Triggers on products
-- ---------------------------------------------------------------------------

-- Actor stamps and the content version. created_by / updated_by cannot be spoofed:
-- they come from the caller's JWT (NULL for the server and SQL editor).
create or replace function public.products_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_ignored constant text[] := array['stock', 'updated_at', 'updated_by', 'version', 'search_tsv', 'status', 'created_by'];
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
    new.version    := 1;
  else
    new.created_by := old.created_by;
    new.updated_by := (select auth.uid());
    if (to_jsonb(new) - c_ignored) is distinct from (to_jsonb(old) - c_ignored) then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.products_stamp() from public, anon, authenticated;

drop trigger if exists products_a_stamp on public.products;
create trigger products_a_stamp
  before insert or update on public.products
  for each row execute function public.products_stamp();

-- Publication rules, enforced for EVERY writer. Checked when a product becomes
-- published or when a field that publication depends on changes — not on every
-- stock update, so a sale can never fail because of catalogue content.
create or replace function public.enforce_product_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problems text[];
begin
  if new.is_active and new.archived_at is null then
    if tg_op = 'INSERT'
       or not (old.is_active and old.archived_at is null)
       or (new.title, new.slug, new.description, new.price, new.category_id)
          is distinct from (old.title, old.slug, old.description, old.price, old.category_id) then
      v_problems := public.product_publication_problems(new);
      if cardinality(v_problems) > 0 then
        raise exception 'PUBLICATION_REQUIREMENTS' using errcode = 'P0001', detail = array_to_string(v_problems, '|');
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_product_publication() from public, anon, authenticated;

drop trigger if exists products_b_publication on public.products;
create trigger products_b_publication
  before insert or update on public.products
  for each row execute function public.enforce_product_publication();

-- Products that have been ordered, and products that are live, are never deleted:
-- archive them instead. (order_items keeps a snapshot, but the reference stays valid.)
create or replace function public.guard_product_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.order_items oi where oi.product_id = old.id) then
    raise exception 'PRODUCT_HAS_ORDERS' using errcode = 'P0001';
  end if;
  if old.is_active and old.archived_at is null then
    raise exception 'PRODUCT_PUBLISHED' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_product_delete() from public, anon, authenticated;

drop trigger if exists products_guard_delete on public.products;
create trigger products_guard_delete
  before delete on public.products
  for each row execute function public.guard_product_delete();

-- ---------------------------------------------------------------------------
-- Image integrity: a published product must always keep exactly one cover.
-- Deferred to COMMIT so one transaction may re-arrange covers/positions freely.
-- ---------------------------------------------------------------------------
create or replace function public.check_product_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid  uuid := coalesce(new.product_id, old.product_id);
  v_prod public.products;
  v_problems text[];
begin
  select * into v_prod from public.products p where p.id = v_pid;
  if not found then return null; end if;              -- product itself is being deleted
  if v_prod.is_active and v_prod.archived_at is null then
    v_problems := array(select x from unnest(public.product_publication_problems(v_prod)) x where x in ('image_missing', 'cover_missing'));
    if cardinality(v_problems) > 0 then
      raise exception 'PUBLICATION_REQUIREMENTS' using errcode = 'P0001', detail = array_to_string(v_problems, '|');
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.check_product_images() from public, anon, authenticated;

drop trigger if exists product_images_integrity on public.product_images;
create constraint trigger product_images_integrity
  after insert or update or delete on public.product_images
  deferrable initially deferred
  for each row execute function public.check_product_images();

-- ---------------------------------------------------------------------------
-- Categories: cannot be deactivated while products are live in them
-- ---------------------------------------------------------------------------
create or replace function public.guard_category_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active
     and exists (select 1 from public.products p where p.category_id = old.id and p.is_active and p.archived_at is null) then
    raise exception 'CATEGORY_IN_USE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_category_deactivation() from public, anon, authenticated;

drop trigger if exists categories_guard_deactivation on public.categories;
create trigger categories_guard_deactivation
  before update of is_active on public.categories
  for each row execute function public.guard_category_deactivation();

-- ---------------------------------------------------------------------------
-- Stock ledger: carry an optional note (set by admin stock operations)
-- ---------------------------------------------------------------------------
create or replace function public.log_stock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := coalesce(nullif(current_setting('app.stock_reason', true), ''), 'adjustment');
  v_order  uuid := nullif(current_setting('app.order_id', true), '')::uuid;
  v_note   text := nullif(current_setting('app.stock_note', true), '');
begin
  if tg_op = 'INSERT' then
    if new.stock <> 0 then
      insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_id, note)
      values (new.id, new.stock, new.stock, 'initial', (select auth.uid()), v_note);
    end if;
  elsif new.stock is distinct from old.stock then
    insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id, actor_id, note)
    values (new.id, new.stock - old.stock, new.stock, v_reason, v_order, (select auth.uid()), v_note);
  end if;
  return new;
end;
$$;
revoke all on function public.log_stock_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit: also watch the new product columns
-- ---------------------------------------------------------------------------
drop trigger if exists products_audit on public.products;
create trigger products_audit
  after insert or update or delete on public.products
  for each row execute function public.audit_row_change(
    'title,slug,tagline,description,flavor_notes,culinary_uses,ingredients,price,compare_at_price,currency,weight_grams,is_featured,is_active,archived_at,category_id,sku,low_stock_threshold',
    'snapshot');

-- ---------------------------------------------------------------------------
-- Admin operations. Each one: assert_admin() first, lock the row, validate, write.
-- Business-rule failures are RAISE EXCEPTION '<CODE>' (P0001) — see
-- src/lib/admin/db-errors.ts for the mapping to HTTP responses.
-- ---------------------------------------------------------------------------

-- Create (p_id null) or edit a product's CONTENT. Never changes publication or
-- (after creation) stock — those have their own audited operations.
create or replace function public.admin_save_product(p_id uuid, p_expected_version integer, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_spec constant jsonb := jsonb_build_object(
    'title', 'string', 'slug', 'string', 'tagline', 'string', 'description', 'string',
    'flavor_notes', 'array', 'culinary_uses', 'string', 'ingredients', 'string',
    'price', 'number', 'compare_at_price', 'number', 'weight_grams', 'number',
    'category_id', 'string', 'is_featured', 'boolean', 'sku', 'string',
    'low_stock_threshold', 'number', 'stock', 'number');
  v_key    text;
  v_row    public.products;
  v_flavor text[];
begin
  perform public.assert_admin();

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'data must be an object';
  end if;
  for v_key in select jsonb_object_keys(p_data) loop
    if not (c_spec ? v_key) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'unknown field: ' || v_key;
    end if;
    if jsonb_typeof(p_data -> v_key) not in (c_spec ->> v_key, 'null') then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'wrong type for: ' || v_key;
    end if;
  end loop;

  if p_data ? 'flavor_notes' and jsonb_typeof(p_data -> 'flavor_notes') = 'array' then
    select coalesce(array_agg(btrim(x)) filter (where btrim(x) <> ''), '{}') into v_flavor
    from jsonb_array_elements_text(p_data -> 'flavor_notes') x;
    if cardinality(v_flavor) > 12 or exists (select 1 from unnest(v_flavor) f where char_length(f) > 60) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'flavor_notes: at most 12 notes of 60 characters';
    end if;
  end if;

  if p_id is null then
    insert into public.products (
      title, slug, tagline, description, flavor_notes, culinary_uses, ingredients,
      price, compare_at_price, weight_grams, category_id, is_featured, sku,
      low_stock_threshold, stock, is_active)
    values (
      btrim(p_data ->> 'title'),
      btrim(p_data ->> 'slug'),
      nullif(btrim(p_data ->> 'tagline'), ''),
      coalesce(btrim(p_data ->> 'description'), ''),
      v_flavor,
      nullif(btrim(p_data ->> 'culinary_uses'), ''),
      nullif(btrim(p_data ->> 'ingredients'), ''),
      coalesce((p_data ->> 'price')::numeric, 0),
      (p_data ->> 'compare_at_price')::numeric,
      (p_data ->> 'weight_grams')::integer,
      (p_data ->> 'category_id')::uuid,
      coalesce((p_data ->> 'is_featured')::boolean, false),
      nullif(btrim(p_data ->> 'sku'), ''),
      (p_data ->> 'low_stock_threshold')::integer,
      coalesce((p_data ->> 'stock')::integer, 0),
      false)
    returning * into v_row;
    return public._product_json(v_row);
  end if;

  select * into v_row from public.products p where p.id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_row.archived_at is not null then raise exception 'PRODUCT_ARCHIVED' using errcode = 'P0001'; end if;
  if p_expected_version is not null and v_row.version <> p_expected_version then
    raise exception 'STALE_PRODUCT' using errcode = 'P0001';
  end if;
  if p_data ? 'stock' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'stock is changed with a stock adjustment';
  end if;
  -- Live URLs must not change underneath customers and search engines.
  if p_data ? 'slug' and btrim(p_data ->> 'slug') is distinct from v_row.slug and v_row.is_active then
    raise exception 'SLUG_LOCKED' using errcode = 'P0001';
  end if;

  update public.products set
    title            = case when p_data ? 'title'            then btrim(p_data ->> 'title')                          else title end,
    slug             = case when p_data ? 'slug'             then btrim(p_data ->> 'slug')                           else slug end,
    tagline          = case when p_data ? 'tagline'          then nullif(btrim(p_data ->> 'tagline'), '')            else tagline end,
    description      = case when p_data ? 'description'      then coalesce(btrim(p_data ->> 'description'), '')      else description end,
    flavor_notes     = case when p_data ? 'flavor_notes'     then v_flavor                                           else flavor_notes end,
    culinary_uses    = case when p_data ? 'culinary_uses'    then nullif(btrim(p_data ->> 'culinary_uses'), '')      else culinary_uses end,
    ingredients      = case when p_data ? 'ingredients'      then nullif(btrim(p_data ->> 'ingredients'), '')        else ingredients end,
    price            = case when p_data ? 'price'            then (p_data ->> 'price')::numeric                      else price end,
    compare_at_price = case when p_data ? 'compare_at_price' then (p_data ->> 'compare_at_price')::numeric           else compare_at_price end,
    weight_grams     = case when p_data ? 'weight_grams'     then (p_data ->> 'weight_grams')::integer              else weight_grams end,
    category_id      = case when p_data ? 'category_id'      then (p_data ->> 'category_id')::uuid                   else category_id end,
    is_featured      = case when p_data ? 'is_featured'      then coalesce((p_data ->> 'is_featured')::boolean, false) else is_featured end,
    sku              = case when p_data ? 'sku'              then nullif(btrim(p_data ->> 'sku'), '')                else sku end,
    low_stock_threshold = case when p_data ? 'low_stock_threshold' then (p_data ->> 'low_stock_threshold')::integer  else low_stock_threshold end
  where id = p_id
  returning * into v_row;
  return public._product_json(v_row);
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'a value has the wrong format';
end;
$$;

-- draft <-> published <-> archived. Publication requirements are enforced by the trigger.
create or replace function public.admin_set_product_status(p_id uuid, p_status text, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.products;
begin
  perform public.assert_admin();
  select * into v_row from public.products p where p.id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p_expected_version is not null and v_row.version <> p_expected_version then
    raise exception 'STALE_PRODUCT' using errcode = 'P0001';
  end if;

  if p_status = 'published' then
    if v_row.archived_at is not null then raise exception 'PRODUCT_ARCHIVED' using errcode = 'P0001'; end if;
    update public.products set is_active = true where id = p_id returning * into v_row;
  elsif p_status = 'draft' then          -- unpublish, or restore from the archive
    update public.products set is_active = false, archived_at = null where id = p_id returning * into v_row;
  elsif p_status = 'archived' then
    update public.products set is_active = false, archived_at = coalesce(archived_at, now()) where id = p_id returning * into v_row;
  else
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'status must be draft, published or archived';
  end if;
  return public._product_json(v_row);
end;
$$;

-- Only never-published, never-ordered products can be deleted (typo clean-up).
create or replace function public.admin_delete_product(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  perform 1 from public.products p where p.id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  delete from public.products where id = p_id;     -- guard_product_delete() refuses live/ordered products
end;
$$;

-- ---- stock ------------------------------------------------------------------
-- Relative change under a row lock: two concurrent adjustments both apply, and
-- stock can never go below zero. Every change is written to inventory_movements.
create or replace function public.admin_adjust_stock(p_product_id uuid, p_delta integer, p_reason text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.products;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  perform public.assert_admin();
  if p_delta is null or p_delta = 0 or abs(p_delta) > 100000 then
    raise exception 'INVALID_STOCK' using errcode = 'P0001', detail = 'change must be a non-zero whole number, at most 100000';
  end if;
  if p_reason is null or p_reason not in ('restock', 'adjustment', 'return', 'correction') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'reason';
  end if;

  select * into v_row from public.products p where p.id = p_product_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_row.stock + p_delta < 0 then
    raise exception 'INVALID_STOCK' using errcode = 'P0001', detail = format('stock is %s, cannot remove %s', v_row.stock, -p_delta);
  end if;
  if v_row.stock + p_delta > 1000000 then
    raise exception 'INVALID_STOCK' using errcode = 'P0001', detail = 'stock cannot exceed 1000000';
  end if;

  perform set_config('app.stock_reason', p_reason, true);
  perform set_config('app.stock_note', coalesce(v_note, ''), true);
  update public.products set stock = stock + p_delta where id = p_product_id returning * into v_row;
  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_note', '', true);

  return jsonb_build_object('product_id', v_row.id, 'stock', v_row.stock, 'delta', p_delta);
end;
$$;

-- Stocktake: "there are N on the shelf". Recorded as the difference.
create or replace function public.admin_set_stock(p_product_id uuid, p_quantity integer, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.products;
  v_old integer;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  perform public.assert_admin();
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then
    raise exception 'INVALID_STOCK' using errcode = 'P0001', detail = 'quantity must be a whole number from 0 to 1000000';
  end if;
  select * into v_row from public.products p where p.id = p_product_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_old := v_row.stock;
  if v_old = p_quantity then
    return jsonb_build_object('product_id', v_row.id, 'stock', v_old, 'delta', 0);
  end if;

  perform set_config('app.stock_reason', 'correction', true);
  perform set_config('app.stock_note', coalesce(v_note, 'stocktake'), true);
  update public.products set stock = p_quantity where id = p_product_id returning * into v_row;
  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_note', '', true);
  return jsonb_build_object('product_id', v_row.id, 'stock', v_row.stock, 'delta', p_quantity - v_old);
end;
$$;

-- ---- categories ---------------------------------------------------------------
create or replace function public.admin_save_category(p_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_spec constant jsonb := jsonb_build_object(
    'name', 'string', 'slug', 'string', 'description', 'string', 'display_order', 'number', 'is_active', 'boolean');
  v_key text;
  v_row public.categories;
begin
  perform public.assert_admin();
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'data must be an object';
  end if;
  for v_key in select jsonb_object_keys(p_data) loop
    if not (c_spec ? v_key) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'unknown field: ' || v_key;
    end if;
    if jsonb_typeof(p_data -> v_key) not in (c_spec ->> v_key, 'null') then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'wrong type for: ' || v_key;
    end if;
  end loop;

  if p_id is null then
    insert into public.categories (name, slug, description, display_order, is_active)
    values (
      btrim(p_data ->> 'name'), btrim(p_data ->> 'slug'),
      nullif(btrim(p_data ->> 'description'), ''),
      coalesce((p_data ->> 'display_order')::integer, 0),
      coalesce((p_data ->> 'is_active')::boolean, true))
    returning * into v_row;
  else
    select * into v_row from public.categories c where c.id = p_id for update;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
    update public.categories set
      name          = case when p_data ? 'name'          then btrim(p_data ->> 'name')                       else name end,
      slug          = case when p_data ? 'slug'          then btrim(p_data ->> 'slug')                       else slug end,
      description   = case when p_data ? 'description'   then nullif(btrim(p_data ->> 'description'), '')    else description end,
      display_order = case when p_data ? 'display_order' then coalesce((p_data ->> 'display_order')::integer, 0) else display_order end,
      is_active     = case when p_data ? 'is_active'     then coalesce((p_data ->> 'is_active')::boolean, true)  else is_active end
    where id = p_id
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'a value has the wrong format';
end;
$$;

-- Only an unused category can be deleted; otherwise deactivate it.
create or replace function public.admin_delete_category(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  perform 1 from public.categories c where c.id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (select 1 from public.products p where p.category_id = p_id) then
    raise exception 'CATEGORY_IN_USE' using errcode = 'P0001';
  end if;
  delete from public.categories where id = p_id;
end;
$$;

-- ---- images ---------------------------------------------------------------------
create or replace function public._product_images_json(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pi.id, 'url', pi.url, 'public_id', pi.cloudinary_public_id, 'alt_text', pi.alt_text,
    'position', pi.position, 'is_cover', pi.is_cover, 'width', pi.width, 'height', pi.height)
    order by pi.position, pi.created_at), '[]'::jsonb)
  from public.product_images pi where pi.product_id = p_product_id
$$;
revoke all on function public._product_images_json(uuid) from public, anon, authenticated;
revoke all on function public._product_json(public.products) from public, anon, authenticated;

create or replace function public.admin_add_product_image(
  p_product_id uuid, p_public_id text, p_url text, p_alt text,
  p_width integer, p_height integer, p_bytes integer, p_format text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prod public.products;
  v_pos  integer;
begin
  perform public.assert_admin();
  select * into v_prod from public.products p where p.id = p_product_id for update;     -- serialises concurrent uploads
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_prod.archived_at is not null then raise exception 'PRODUCT_ARCHIVED' using errcode = 'P0001'; end if;

  select coalesce(max(pi.position), -1) + 1 into v_pos from public.product_images pi where pi.product_id = p_product_id;
  insert into public.product_images (product_id, cloudinary_public_id, url, alt_text, position, is_cover, width, height, bytes, format)
  values (p_product_id, p_public_id, p_url, nullif(left(btrim(coalesce(p_alt, '')), 200), ''), v_pos,
          not exists (select 1 from public.product_images pi where pi.product_id = p_product_id),
          p_width, p_height, p_bytes, p_format);
  return public._product_images_json(p_product_id);
end;
$$;

create or replace function public.admin_set_cover_image(p_product_id uuid, p_image_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  perform 1 from public.products p where p.id = p_product_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.product_images pi where pi.id = p_image_id and pi.product_id = p_product_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.product_images set is_cover = false where product_id = p_product_id and is_cover and id <> p_image_id;
  update public.product_images set is_cover = true  where id = p_image_id and not is_cover;
  return public._product_images_json(p_product_id);
end;
$$;

-- p_image_ids must list EVERY image of the product exactly once, in the new order.
create or replace function public.admin_reorder_product_images(p_product_id uuid, p_image_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_have uuid[];
begin
  perform public.assert_admin();
  perform 1 from public.products p where p.id = p_product_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select array_agg(pi.id order by pi.id) into v_have from public.product_images pi where pi.product_id = p_product_id;
  if coalesce(v_have, '{}') is distinct from coalesce((select array_agg(x order by x) from unnest(p_image_ids) x), '{}') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'list every image of the product exactly once';
  end if;
  update public.product_images pi set position = o.ord - 1
  from unnest(p_image_ids) with ordinality as o(id, ord)
  where pi.id = o.id;
  return public._product_images_json(p_product_id);
end;
$$;

create or replace function public.admin_update_image_alt(p_image_id uuid, p_alt text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
begin
  perform public.assert_admin();
  if char_length(coalesce(p_alt, '')) > 200 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'alt text is limited to 200 characters';
  end if;
  update public.product_images set alt_text = nullif(btrim(coalesce(p_alt, '')), '') where id = p_image_id returning product_id into v_pid;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  return public._product_images_json(v_pid);
end;
$$;

-- Removes the DATABASE record only. The caller deletes the Cloudinary file AFTERWARDS,
-- and only when `still_referenced` is false, so a database failure can never lose a file.
create or replace function public.admin_remove_product_image(p_image_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_img  public.product_images;
  v_prod public.products;
  v_left integer;
begin
  perform public.assert_admin();
  select * into v_img from public.product_images pi where pi.id = p_image_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into v_prod from public.products p where p.id = v_img.product_id for update;

  select count(*) into v_left from public.product_images pi where pi.product_id = v_img.product_id and pi.id <> p_image_id;
  if v_left = 0 and v_prod.is_active and v_prod.archived_at is null then
    raise exception 'PUBLICATION_REQUIREMENTS' using errcode = 'P0001', detail = 'image_missing';
  end if;

  delete from public.product_images where id = p_image_id;
  if v_img.is_cover and v_left > 0 then
    update public.product_images set is_cover = true
    where id = (select pi.id from public.product_images pi where pi.product_id = v_img.product_id order by pi.position, pi.created_at limit 1);
  end if;
  -- keep positions dense: 0..n-1
  update public.product_images pi set position = r.rn - 1
  from (select id, row_number() over (order by position, created_at) as rn from public.product_images where product_id = v_img.product_id) r
  where pi.id = r.id and pi.position <> r.rn - 1;

  return jsonb_build_object(
    'public_id', v_img.cloudinary_public_id,
    'still_referenced', exists (select 1 from public.product_images pi where pi.cloudinary_public_id = v_img.cloudinary_public_id),
    'images', public._product_images_json(v_img.product_id));
end;
$$;

-- ---- reads for the admin screens (no PostgREST filter syntax involved) ----------------
create or replace function public.admin_list_products(
  p_q text, p_status text, p_category_id uuid, p_page integer, p_page_size integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q      text := nullif(btrim(coalesce(p_q, '')), '');
  v_like   text;
  v_size   integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset integer := (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_total  integer;
  v_items  jsonb;
begin
  perform public.assert_admin();
  if p_status is not null and p_status not in ('draft', 'published', 'archived') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'status';
  end if;
  if v_q is not null then
    v_like := '%' || regexp_replace(left(v_q, 80), '([\\%_])', '\\\1', 'g') || '%';
  end if;

  select count(*) into v_total
  from public.products p
  where (p_status is null or p.status = p_status)
    and (p_category_id is null or p.category_id = p_category_id)
    and (v_like is null or p.title ilike v_like or p.slug ilike v_like or coalesce(p.sku, '') ilike v_like);

  select coalesce(jsonb_agg(row_to_json_item order by ord), '[]'::jsonb) into v_items
  from (
    select row_number() over (order by p.updated_at desc, p.id) as ord,
           jsonb_build_object(
             'id', p.id, 'title', p.title, 'slug', p.slug, 'sku', p.sku, 'status', p.status,
             'price', p.price, 'stock', p.stock, 'low_stock_threshold', p.low_stock_threshold,
             'is_featured', p.is_featured, 'updated_at', p.updated_at,
             'category', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name) end,
             'cover_url', (select pi.url from public.product_images pi where pi.product_id = p.id order by pi.is_cover desc, pi.position limit 1)
           ) as row_to_json_item
    from public.products p
    left join public.categories c on c.id = p.category_id
    where (p_status is null or p.status = p_status)
      and (p_category_id is null or p.category_id = p_category_id)
      and (v_like is null or p.title ilike v_like or p.slug ilike v_like or coalesce(p.sku, '') ilike v_like)
    order by p.updated_at desc, p.id
    limit v_size offset v_offset
  ) page;

  return jsonb_build_object('items', v_items, 'total', v_total, 'page_size', v_size);
end;
$$;

create or replace function public.admin_get_product(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.products;
begin
  perform public.assert_admin();
  select * into v_row from public.products p where p.id = p_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'product',   public._product_json(v_row),
    'images',    public._product_images_json(p_id),
    'problems',  to_jsonb(public.product_publication_problems(v_row)),
    'movements', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', m.id, 'delta', m.delta, 'stock_after', m.stock_after, 'reason', m.reason,
                     'note', m.note, 'created_at', m.created_at) order by m.id desc), '[]'::jsonb)
                  from (select * from public.inventory_movements im where im.product_id = p_id order by im.id desc limit 15) m));
end;
$$;

create or replace function public.admin_list_categories()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'slug', c.slug, 'description', c.description,
      'display_order', c.display_order, 'is_active', c.is_active,
      'product_count', (select count(*) from public.products p where p.category_id = c.id),
      'published_count', (select count(*) from public.products p where p.category_id = c.id and p.is_active and p.archived_at is null)
    ) order by c.display_order, c.name), '[]'::jsonb)
    from public.categories c);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Only signed-in users may CALL the admin functions, and each one still checks
-- is_admin() on the caller's identity. Anonymous visitors cannot reach them at all.
do $$
declare
  f text;
begin
  foreach f in array array[
    'assert_admin()',
    'admin_save_product(uuid, integer, jsonb)',
    'admin_set_product_status(uuid, text, integer)',
    'admin_delete_product(uuid)',
    'admin_adjust_stock(uuid, integer, text, text)',
    'admin_set_stock(uuid, integer, text)',
    'admin_save_category(uuid, jsonb)',
    'admin_delete_category(uuid)',
    'admin_add_product_image(uuid, text, text, text, integer, integer, integer, text)',
    'admin_set_cover_image(uuid, uuid)',
    'admin_reorder_product_images(uuid, uuid[])',
    'admin_update_image_alt(uuid, text)',
    'admin_remove_product_image(uuid)',
    'admin_list_products(text, text, uuid, integer, integer)',
    'admin_get_product(uuid)',
    'admin_list_categories()',
    'product_publication_problems(public.products)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'admin_save_product(uuid, integer, jsonb)',
    'admin_set_product_status(uuid, text, integer)',
    'admin_delete_product(uuid)',
    'admin_adjust_stock(uuid, integer, text, text)',
    'admin_set_stock(uuid, integer, text)',
    'admin_save_category(uuid, jsonb)',
    'admin_delete_category(uuid)',
    'admin_add_product_image(uuid, text, text, text, integer, integer, integer, text)',
    'admin_set_cover_image(uuid, uuid)',
    'admin_reorder_product_images(uuid, uuid[])',
    'admin_update_image_alt(uuid, text)',
    'admin_remove_product_image(uuid)',
    'admin_list_products(text, text, uuid, integer, integer)',
    'admin_get_product(uuid)',
    'admin_list_categories()'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Public (anon + signed-in customers) may read only the columns the storefront shows.
-- Internal metadata (sku, created_by, updated_by, version, low_stock_threshold, status)
-- is not readable through the public API; admins read it through admin_* functions.
revoke select on public.products from anon, authenticated;
grant select (id, category_id, title, slug, tagline, description, flavor_notes, culinary_uses,
              ingredients, price, compare_at_price, currency, weight_grams, stock, is_featured,
              created_at, updated_at, is_active, archived_at, search_tsv)
  on public.products to anon, authenticated;

-- Inactive categories are invisible to visitors; admins see them through admin_list_categories().
drop policy if exists categories_select_public on public.categories;
create policy categories_select_public on public.categories
  for select to anon, authenticated using (is_active);
drop policy if exists categories_select_admin on public.categories;
create policy categories_select_admin on public.categories
  for select to authenticated using ((select public.is_admin()));
