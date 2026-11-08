-- =============================================================================
-- Migration 05 — audit trail for sensitive operations
-- Plants & Pure Limited · Phase 1
--
-- Records who changed what on: products (price, publish state…), categories,
-- delivery zones, product images, profile roles, order/payment statuses.
--   * UPDATE rows store only the columns that actually changed (old → new), so
--     personal data is not copied into the log unless it was itself edited.
--   * actor_id is auth.uid() for client sessions; NULL for server (service_role)
--     and SQL-editor changes (actor_role says which).
--   * Append-only for the application: UPDATE/DELETE are revoked from every API
--     role including service_role. Retention clean-up is done by the project
--     owner in the SQL editor (see docs/DATABASE.md).
-- =============================================================================

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_role  text not null default 'database',
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name  text not null,
  record_id   text,
  changes     jsonb
);
create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id, occurred_at desc);
create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, occurred_at desc) where actor_id is not null;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- tg_argv[0]: comma-separated columns to watch on UPDATE ('' = every column)
  -- tg_argv[1]: 'snapshot' (log whole row on INSERT/DELETE) or 'id_only'
  v_tracked  text[] := string_to_array(coalesce(tg_argv[0], ''), ',');
  v_snapshot boolean := coalesce(tg_argv[1], 'snapshot') = 'snapshot';
  v_old      jsonb;
  v_new      jsonb;
  v_changes  jsonb := '{}'::jsonb;
  v_id       text;
  k          text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if k in ('updated_at', 'search_tsv') then continue; end if;
      if cardinality(v_tracked) > 0 and not (k = any (v_tracked)) then continue; end if;
      if (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new;                       -- nothing we care about changed
    end if;
    v_id := v_new ->> 'id';
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new) - 'search_tsv';
    v_id := v_new ->> 'id';
    v_changes := case when v_snapshot then v_new else jsonb_build_object('id', v_id) end;
  else
    v_old := to_jsonb(old) - 'search_tsv';
    v_id := v_old ->> 'id';
    v_changes := case when v_snapshot then v_old else jsonb_build_object('id', v_id) end;
  end if;

  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, changes)
  values ((select auth.uid()), coalesce((select auth.role()), 'database'), tg_op, tg_table_name, v_id, v_changes);

  return coalesce(new, old);
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- products: everything except `stock` (inventory_movements is the stock ledger)
drop trigger if exists products_audit on public.products;
create trigger products_audit
  after insert or update or delete on public.products
  for each row execute function public.audit_row_change(
    'title,slug,tagline,description,flavor_notes,culinary_uses,ingredients,price,compare_at_price,weight_grams,is_featured,is_active,archived_at,category_id,sku',
    'snapshot');

drop trigger if exists categories_audit on public.categories;
create trigger categories_audit
  after insert or update or delete on public.categories
  for each row execute function public.audit_row_change('', 'snapshot');

drop trigger if exists delivery_zones_audit on public.delivery_zones;
create trigger delivery_zones_audit
  after insert or update or delete on public.delivery_zones
  for each row execute function public.audit_row_change('', 'snapshot');

drop trigger if exists product_images_audit on public.product_images;
create trigger product_images_audit
  after insert or update or delete on public.product_images
  for each row execute function public.audit_row_change('alt_text,position,is_cover', 'snapshot');

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.audit_row_change('role', 'id_only');

drop trigger if exists orders_audit on public.orders;
create trigger orders_audit
  after update on public.orders
  for each row execute function public.audit_row_change('payment_status,fulfillment_status,requires_review', 'id_only');

drop trigger if exists payments_audit on public.payments;
create trigger payments_audit
  after update on public.payments
  for each row execute function public.audit_row_change('status', 'id_only');

-- Privileges: admins read; nobody updates or deletes through the API.
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated;
grant select, insert on public.audit_log to service_role;
grant usage, select on sequence public.audit_log_id_seq to service_role;

alter table public.audit_log enable row level security;
drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select to authenticated using ((select public.is_admin()));
