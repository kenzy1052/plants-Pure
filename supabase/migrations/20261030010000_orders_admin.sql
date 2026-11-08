-- Migration 07 - admin order management
-- Idempotent: create or replace on every function.

create or replace function public.admin_list_orders(
  p_payment_status     text,
  p_fulfillment_status text,
  p_q                  text,
  p_page               integer default 1,
  p_page_size          integer default 20
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_like  text;
  v_from  integer;
  v_total integer;
  v_statuses text[] := array['pending','paid','failed','cancelled','refunded','review'];
  v_counts jsonb;
  v_items  jsonb;
begin
  perform public.assert_admin();
  v_from := greatest(0, (greatest(1, p_page) - 1) * p_page_size);
  v_like := nullif(btrim(p_q), '');
  select jsonb_object_agg(s, c) into v_counts
  from unnest(v_statuses) with ordinality as u(s, ord)
  left join lateral (select count(*) as c from public.orders o
    where o.payment_status = u.s
      and (p_fulfillment_status is null or o.fulfillment_status = p_fulfillment_status)) sub on true;
  select count(*) into v_total
  from public.orders o
  where (p_payment_status    is null or o.payment_status    = p_payment_status)
    and (p_fulfillment_status is null or o.fulfillment_status = p_fulfillment_status)
    and (v_like is null or o.customer_name ilike '%' || v_like || '%'
         or o.customer_email ilike '%' || v_like || '%'
         or o.order_number::text ilike '%' || v_like || '%');
  select coalesce(jsonb_agg(row_to_json_item order by ord), '[]'::jsonb) into v_items
  from (
    select row_number() over (order by o.created_at desc, o.id) as ord,
           jsonb_build_object(
             'id', o.id, 'order_number', o.order_number,
             'customer_name', o.customer_name, 'customer_email', o.customer_email,
             'payment_status', o.payment_status, 'fulfillment_status', o.fulfillment_status,
             'total_amount', o.total_amount, 'currency', o.currency,
             'created_at', o.created_at, 'requires_review', o.requires_review,
             'item_count', (select count(*) from public.order_items oi where oi.order_id = o.id),
             'paid_at', o.paid_at
           ) as row_to_json_item
    from public.orders o
    where (p_payment_status    is null or o.payment_status    = p_payment_status)
      and (p_fulfillment_status is null or o.fulfillment_status = p_fulfillment_status)
      and (v_like is null or o.customer_name ilike '%' || v_like || '%'
           or o.customer_email ilike '%' || v_like || '%'
           or o.order_number::text ilike '%' || v_like || '%')
    order by o.created_at desc, o.id
    limit p_page_size offset v_from
  ) page;
  return jsonb_build_object('items', v_items, 'total', v_total,
    'page', greatest(1, p_page), 'page_size', p_page_size,
    'pages', ceil(nullif(v_total, 0)::numeric / p_page_size)::integer,
    'counts', v_counts);
end;
$$;

create or replace function public.admin_get_order(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_order record;
begin
  perform public.assert_admin();
  select o.id, o.order_number, o.public_id, o.user_id,
         o.customer_name, o.customer_email, o.customer_phone,
         o.delivery_address, o.subtotal, o.delivery_fee, o.total_amount, o.currency,
         o.payment_status, o.fulfillment_status, o.requires_review,
         o.notes, o.created_at, o.updated_at, o.paid_at, o.cancelled_at,
         d.name as zone_name
    into v_order
  from public.orders o
  left join public.delivery_zones d on d.id = o.delivery_zone_id
  where o.id = p_id;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id, 'order_number', v_order.order_number, 'public_id', v_order.public_id,
      'user_id', v_order.user_id, 'customer_name', v_order.customer_name,
      'customer_email', v_order.customer_email, 'customer_phone', v_order.customer_phone,
      'delivery_address', v_order.delivery_address,
      'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
      'total_amount', v_order.total_amount, 'currency', v_order.currency,
      'payment_status', v_order.payment_status, 'fulfillment_status', v_order.fulfillment_status,
      'requires_review', v_order.requires_review, 'notes', v_order.notes,
      'created_at', v_order.created_at, 'updated_at', v_order.updated_at,
      'paid_at', v_order.paid_at, 'cancelled_at', v_order.cancelled_at,
      'zone_name', v_order.zone_name
    ),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', oi.id, 'product_id', oi.product_id, 'product_slug', oi.product_slug,
      'title', oi.title, 'sku', oi.sku, 'unit_price', oi.unit_price,
      'quantity', oi.quantity, 'total_price', oi.total_price,
      'weight_grams', (oi.snapshot->>'weight_grams')::numeric,
      'cover_url', oi.snapshot->>'cover_url'
    ) order by oi.created_at), '[]'::jsonb) from public.order_items oi where oi.order_id = p_id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'reference', p.reference, 'status', p.status,
      'amount_minor', p.amount_minor, 'currency', p.currency,
      'channel', p.channel, 'created_at', p.created_at
    ) order by p.created_at desc), '[]'::jsonb) from public.payments p where p.order_id = p_id)
  );
end;
$$;

create or replace function public.admin_update_fulfillment(p_id uuid, p_status text)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  v_allowed text[] := array['unfulfilled','processing','dispatched','delivered','on_hold'];
  v_row     public.orders;
begin
  if not (p_status = any(v_allowed)) then
    raise exception 'INVALID_FULFILLMENT_STATUS' using errcode = 'P0001';
  end if;
  update public.orders
     set fulfillment_status = p_status, updated_at = now()
   where id = p_id
  returning * into v_row;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.record_audit('admin', 'orders', p_id, 'update',
    jsonb_build_object('fulfillment_status', p_status), null);
  return v_row;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_list_orders(text,text,text,integer,integer)',
    'public.admin_get_order(uuid)',
    'public.admin_update_fulfillment(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
