-- 0010 — Agenda e ordens de serviço (PROMPT 6, fluxo de serviços).
--
-- Regras:
-- * A ordem de serviço continua sendo um pedido (kind = 'service_order').
-- * Agendar ou reagendar não reenvia os itens: schedule_order muda só data,
--   hora e duração, e cada mudança fica em order_schedule_changes.
-- * Materiais usados no serviço que não foram cobrados como item saem do
--   estoque como "consumo em serviço", ligados à ordem. Não geram despesa:
--   o dinheiro saiu na compra. Correção por estorno da movimentação.

alter table public.orders
  add column scheduled_minutes integer check (scheduled_minutes is null or scheduled_minutes between 5 and 1440);

create table public.order_schedule_changes (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  order_id uuid not null,
  from_at timestamptz,
  to_at timestamptz,
  minutes integer,
  reason text check (reason is null or char_length(reason) <= 300),
  changed_by uuid not null references auth.users (id),
  changed_at timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.orders (organization_id, id)
);
create index order_schedule_changes_order_idx on public.order_schedule_changes (order_id, changed_at);
create index orders_org_scheduled_idx on public.orders (organization_id, scheduled_for) where scheduled_for is not null;

create function public.schedule_order(
  p_order_id uuid,
  p_scheduled_for timestamptz,
  p_minutes integer default null,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_user uuid;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_order.organization_id);
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'order_closed' using errcode = '55000';
  end if;
  if p_minutes is not null and p_minutes not between 5 and 1440 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  if v_order.scheduled_for is not distinct from p_scheduled_for and v_order.scheduled_minutes is not distinct from p_minutes then
    return v_order;
  end if;

  insert into public.order_schedule_changes (organization_id, order_id, from_at, to_at, minutes, reason, changed_by)
  values (v_order.organization_id, v_order.id, v_order.scheduled_for, p_scheduled_for, p_minutes, left(nullif(trim(p_reason), ''), 300), v_user);

  update public.orders o
  set scheduled_for = p_scheduled_for,
      scheduled_minutes = case when p_scheduled_for is null then null else p_minutes end,
      updated_by = v_user,
      updated_at = now()
  where o.id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;

create function public.register_service_material(
  p_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_allow_negative boolean default false,
  p_note text default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_user uuid;
  v_product public.products;
  v_existing public.inventory_movements;
begin
  select * into v_order from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_order.organization_id);

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_existing from public.inventory_movements m
  where m.organization_id = v_order.organization_id and m.idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'order_closed' using errcode = '55000';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 or scale(p_quantity) > 3 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  select * into v_product from public.products p where p.id = p_product_id and p.organization_id = v_order.organization_id;
  if not found or v_product.item_type = 'service' then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if not v_product.track_stock then
    raise exception 'stock_not_tracked' using errcode = '55000';
  end if;

  return app.apply_inventory_movement(v_order.organization_id, v_product.id, 'service_consumption', -p_quantity,
    coalesce(left(nullif(trim(p_note), ''), 200), 'Usado no serviço #' || v_order.number), v_order.id, null,
    p_allow_negative, p_idempotency_key, v_user);
end;
$$;

-- Lista com o fim previsto, para a agenda.
create or replace view public.order_summaries
with (security_invoker = true)
as
select
  o.id,
  o.organization_id,
  o.number,
  o.kind,
  o.status,
  o.channel,
  o.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  o.due_at,
  o.scheduled_for,
  o.total_cents,
  o.created_at,
  o.updated_at,
  (
    select string_agg(
      replace(trim(trailing '.' from trim(trailing '0' from i.quantity::text)), '.', ',') || '× ' || i.description,
      ', ' order by i.position)
    from public.order_items i
    where i.order_id = o.id
  ) as items_summary,
  o.stock_consumed_at,
  o.scheduled_minutes,
  o.problem_description
from public.orders o
left join public.customers c on c.id = o.customer_id;

alter table public.order_schedule_changes enable row level security;
revoke all on public.order_schedule_changes from anon, authenticated;
grant select on public.order_schedule_changes to authenticated;
create policy order_schedule_changes_select on public.order_schedule_changes
  for select to authenticated using (app.is_member(organization_id));

revoke all on function public.schedule_order(uuid, timestamptz, integer, text) from public, anon;
revoke all on function public.register_service_material(uuid, uuid, numeric, uuid, boolean, text) from public, anon;
grant execute on function public.schedule_order(uuid, timestamptz, integer, text) to authenticated;
grant execute on function public.register_service_material(uuid, uuid, numeric, uuid, boolean, text) to authenticated;
