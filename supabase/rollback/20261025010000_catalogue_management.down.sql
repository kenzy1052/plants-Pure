-- =============================================================================
-- ROLLBACK for migration 06 (20261025010000_catalogue_management.sql)
--
-- Use only if migration 06 must be undone. It removes the admin functions, the
-- publication/ownership triggers and the stricter privileges, and restores the
-- Phase 1 behaviour. It does NOT delete any product, category, image, order or
-- ledger row, and it KEEPS the new columns (they are harmless and hold data):
-- the optional DROP COLUMN statements at the end are commented out on purpose.
--
-- Take a backup first. Re-running migration 06 afterwards is supported.
-- =============================================================================

-- admin functions
drop function if exists public.admin_save_product(uuid, integer, jsonb);
drop function if exists public.admin_set_product_status(uuid, text, integer);
drop function if exists public.admin_delete_product(uuid);
drop function if exists public.admin_adjust_stock(uuid, integer, text, text);
drop function if exists public.admin_set_stock(uuid, integer, text);
drop function if exists public.admin_save_category(uuid, jsonb);
drop function if exists public.admin_delete_category(uuid);
drop function if exists public.admin_add_product_image(uuid, text, text, text, integer, integer, integer, text);
drop function if exists public.admin_set_cover_image(uuid, uuid);
drop function if exists public.admin_reorder_product_images(uuid, uuid[]);
drop function if exists public.admin_update_image_alt(uuid, text);
drop function if exists public.admin_remove_product_image(uuid);
drop function if exists public.admin_list_products(text, text, uuid, integer, integer);
drop function if exists public.admin_get_product(uuid);
drop function if exists public.admin_list_categories();

-- triggers and their functions
drop trigger if exists product_images_integrity     on public.product_images;
drop trigger if exists products_a_stamp             on public.products;
drop trigger if exists products_b_publication       on public.products;
drop trigger if exists products_guard_delete        on public.products;
drop trigger if exists categories_guard_deactivation on public.categories;
drop function if exists public.check_product_images();
drop function if exists public.products_stamp();
drop function if exists public.enforce_product_publication();
drop function if exists public.guard_product_delete();
drop function if exists public.guard_category_deactivation();
drop function if exists public.product_publication_problems(public.products);
drop function if exists public._product_images_json(uuid);
drop function if exists public._product_json(public.products);
drop function if exists public.assert_admin();

-- constraints and indexes added by 06
alter table public.products drop constraint if exists products_currency_ghs;
alter table public.products drop constraint if exists products_low_stock_nonneg;
alter table public.products drop constraint if exists products_stock_max;
alter table public.products drop constraint if exists products_price_max;
alter table public.products drop constraint if exists products_archived_not_active;
drop index if exists public.products_status_updated_idx;
drop index if exists public.products_sku_ci_key;
drop index if exists public.categories_name_ci_key;

-- category deletion behaves as in Phase 1 again (products keep NULL category)
alter table public.products drop constraint if exists products_category_id_fkey;
alter table public.products
  add constraint products_category_id_fkey
  foreign key (category_id) references public.categories (id) on delete set null;

-- stock ledger without the note column support (as in migration 03)
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

-- audit trigger as in migration 05
drop trigger if exists products_audit on public.products;
create trigger products_audit
  after insert or update or delete on public.products
  for each row execute function public.audit_row_change(
    'title,slug,tagline,description,flavor_notes,culinary_uses,ingredients,price,compare_at_price,weight_grams,is_featured,is_active,archived_at,category_id,sku',
    'snapshot');

-- privileges and policies as in migration 03
grant select on public.products to anon, authenticated;
drop policy if exists categories_select_public on public.categories;
drop policy if exists categories_select_admin  on public.categories;
create policy categories_select_public on public.categories
  for select to anon, authenticated using (true);

-- OPTIONAL — remove the columns added by 06 (deletes created_by / updated_by /
-- version / low_stock_threshold data; nothing else). Left commented on purpose.
-- alter table public.products drop column if exists status;
-- alter table public.products drop column if exists low_stock_threshold;
-- alter table public.products drop column if exists version;
-- alter table public.products drop column if exists created_by;
-- alter table public.products drop column if exists updated_by;
-- alter table public.products drop column if exists currency;
-- alter table public.categories drop column if exists is_active;
