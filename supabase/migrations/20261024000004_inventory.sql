-- 0004 — Movimentações de estoque.
--
-- Regras:
-- * products.stock_qty só muda aqui, na mesma transação que grava a
--   movimentação (linha do item travada com FOR UPDATE). Assim o saldo é
--   sempre a soma do histórico, mesmo com requisições simultâneas.
-- * Movimentação não é editada nem apagada. Erro se corrige com estorno,
--   que gera a movimentação inversa (uma por movimentação).
-- * Saldo negativo é bloqueado, salvo autorização explícita, que fica
--   registrada na movimentação.
-- * idempotency_key evita lançamento duplicado.
-- * Criar pedido não baixa estoque. A baixa do pedido é uma ação explícita
--   (inventory_consume_order), feita uma vez só; cancelar o pedido estorna.

create type public.inventory_movement_type as enum (
  'purchase',               -- entrada por compra/reposição
  'return',                 -- entrada por devolução
  'manual_in',              -- outra entrada justificada
  'sale',                   -- saída por venda/entrega de pedido
  'production_consumption', -- consumo em produção
  'service_consumption',    -- consumo em serviço
  'loss',                   -- perda, quebra, vencimento
  'manual_out',             -- outra saída justificada
  'adjustment',             -- ajuste de inventário (contagem)
  'reversal'                -- estorno de outra movimentação
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  product_id uuid not null,
  movement_type public.inventory_movement_type not null,
  -- Com sinal: positivo entra, negativo sai.
  quantity numeric(14, 3) not null check (quantity <> 0),
  balance_before numeric(14, 3) not null,
  balance_after numeric(14, 3) not null,
  reason text check (reason is null or char_length(reason) <= 500),
  order_id uuid,
  reverses_movement_id bigint unique references public.inventory_movements (id),
  negative_authorized boolean not null default false,
  idempotency_key uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  foreign key (organization_id, order_id) references public.orders (organization_id, id),
  constraint inventory_balance_math check (balance_after = balance_before + quantity),
  constraint inventory_reversal_link check ((movement_type = 'reversal') = (reverses_movement_id is not null))
);

create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);
create index inventory_movements_order_idx on public.inventory_movements (order_id) where order_id is not null;

-- Marca de baixa do pedido no estoque (uma vez por pedido).
alter table public.orders add column stock_consumed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Núcleo: aplica uma movimentação com a linha do item travada
-- ---------------------------------------------------------------------------

create function app.apply_inventory_movement(
  p_org uuid,
  p_product_id uuid,
  p_type public.inventory_movement_type,
  p_delta numeric,
  p_reason text,
  p_order_id uuid,
  p_reverses bigint,
  p_allow_negative boolean,
  p_idempotency_key uuid,
  p_user uuid
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_mov public.inventory_movements;
  v_after numeric;
begin
  if p_idempotency_key is not null then
    select * into v_mov from public.inventory_movements m
    where m.organization_id = p_org and m.idempotency_key = p_idempotency_key;
    if found then
      return v_mov;
    end if;
  end if;

  select * into v_product from public.products p
  where p.id = p_product_id and p.organization_id = p_org
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  -- Estorno vale mesmo se o item deixou de controlar estoque depois.
  if not v_product.track_stock and p_reverses is null then
    raise exception 'stock_not_tracked' using errcode = '55000';
  end if;
  if p_delta = 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  v_after := v_product.stock_qty + p_delta;
  if v_after < 0 and not coalesce(p_allow_negative, false) then
    raise exception 'insufficient_stock' using errcode = '55000';
  end if;

  insert into public.inventory_movements
    (organization_id, product_id, movement_type, quantity, balance_before, balance_after, reason,
     order_id, reverses_movement_id, negative_authorized, idempotency_key, created_by)
  values
    (p_org, p_product_id, p_type, p_delta, v_product.stock_qty, v_after, nullif(trim(p_reason), ''),
     p_order_id, p_reverses, v_after < 0, p_idempotency_key, p_user)
  returning * into v_mov;

  update public.products p set stock_qty = v_after where p.id = p_product_id;

  return v_mov;
end;
$$;

revoke all on function app.apply_inventory_movement(uuid, uuid, public.inventory_movement_type, numeric, text,
  uuid, bigint, boolean, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- RPC: entrada ou saída
-- ---------------------------------------------------------------------------

create function public.inventory_move(
  p_product_id uuid,
  p_type public.inventory_movement_type,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_reason text default null,
  p_allow_negative boolean default false
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_user uuid;
  v_sign integer;
begin
  select p.organization_id into v_org from public.products p where p.id = p_product_id;
  if v_org is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_org);

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 or scale(p_quantity) > 3 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  v_sign := case
    when p_type in ('purchase', 'return', 'manual_in') then 1
    when p_type in ('sale', 'production_consumption', 'service_consumption', 'loss', 'manual_out') then -1
    else null
  end;
  if v_sign is null then
    -- Ajuste e estorno têm RPCs próprias.
    raise exception 'invalid_movement_type' using errcode = '22023';
  end if;
  if p_type in ('manual_in', 'manual_out', 'loss') and char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  return app.apply_inventory_movement(v_org, p_product_id, p_type, v_sign * p_quantity, p_reason, null, null,
    p_allow_negative, p_idempotency_key, v_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: ajuste de inventário (informa a quantidade contada)
-- ---------------------------------------------------------------------------

create function public.inventory_adjust(
  p_product_id uuid,
  p_counted_quantity numeric,
  p_reason text,
  p_idempotency_key uuid
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_user uuid;
  v_existing public.inventory_movements;
begin
  select * into v_product from public.products p where p.id = p_product_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_product.organization_id);

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_existing from public.inventory_movements m
  where m.organization_id = v_product.organization_id and m.idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  if p_counted_quantity is null or p_counted_quantity < 0 or p_counted_quantity > 1000000 or scale(p_counted_quantity) > 3 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Trava a linha antes de calcular a diferença, para a contagem valer
  -- sobre o saldo atual mesmo com outra movimentação simultânea.
  select * into v_product from public.products p where p.id = p_product_id for update;
  if p_counted_quantity = v_product.stock_qty then
    raise exception 'no_change' using errcode = '22023';
  end if;

  return app.apply_inventory_movement(v_product.organization_id, p_product_id, 'adjustment',
    p_counted_quantity - v_product.stock_qty, p_reason, null, null, false, p_idempotency_key, v_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: estorno
-- ---------------------------------------------------------------------------

create function public.inventory_reverse(
  p_movement_id bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.inventory_movements;
  v_user uuid;
  v_existing public.inventory_movements;
begin
  select * into v_mov from public.inventory_movements m where m.id = p_movement_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_mov.organization_id);

  select * into v_existing from public.inventory_movements m where m.reverses_movement_id = p_movement_id;
  if found then
    -- Já estornada: devolve o estorno existente (reenvio) em vez de duplicar.
    return v_existing;
  end if;
  if v_mov.movement_type = 'reversal' then
    raise exception 'cannot_reverse_reversal' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Estorno pode deixar o saldo negativo (ex.: estornar uma entrada já
  -- consumida); nesse caso fica marcado como autorizado.
  return app.apply_inventory_movement(v_mov.organization_id, v_mov.product_id, 'reversal', -v_mov.quantity,
    p_reason, v_mov.order_id, v_mov.id, true, p_idempotency_key, v_user);
exception
  when unique_violation then
    select * into v_existing from public.inventory_movements m where m.reverses_movement_id = p_movement_id;
    if found then
      return v_existing;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: baixar do estoque os itens de um pedido (uma vez)
-- ---------------------------------------------------------------------------

create function public.inventory_consume_order(
  p_order_id uuid,
  p_allow_negative boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_user uuid;
  v_item record;
  v_type public.inventory_movement_type;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_order.organization_id);

  if v_order.stock_consumed_at is not null then
    return v_order; -- já baixado
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'order_cancelled' using errcode = '55000';
  end if;

  v_type := case when v_order.kind = 'service_order' then 'service_consumption' else 'sale' end;

  -- Agrupa por item e trava na ordem do id para evitar deadlock entre pedidos.
  for v_item in
    select i.product_id, sum(i.quantity) as qty
    from public.order_items i
    join public.products p on p.id = i.product_id
    where i.order_id = v_order.id and p.track_stock
    group by i.product_id
    order by i.product_id
  loop
    perform app.apply_inventory_movement(v_order.organization_id, v_item.product_id, v_type, -v_item.qty,
      'Pedido #' || v_order.number, v_order.id, null, p_allow_negative, null, v_user);
  end loop;

  update public.orders o set stock_consumed_at = now(), updated_by = v_user, updated_at = now()
  where o.id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- Cancelar um pedido já baixado estorna as saídas dele.
create function app.reverse_order_stock(p_order public.orders, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.inventory_movements;
begin
  for v_mov in
    select m.* from public.inventory_movements m
    where m.order_id = p_order.id
      and m.movement_type in ('sale', 'service_consumption')
      and not exists (select 1 from public.inventory_movements r where r.reverses_movement_id = m.id)
    order by m.product_id
  loop
    perform app.apply_inventory_movement(p_order.organization_id, v_mov.product_id, 'reversal', -v_mov.quantity,
      'Cancelamento do pedido #' || p_order.number, p_order.id, v_mov.id, true, null, p_user);
  end loop;
end;
$$;

revoke all on function app.reverse_order_stock(public.orders, uuid) from public;

-- set_order_status passa a estornar o estoque no cancelamento.
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
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
  v_from public.order_status;
  v_reason text := nullif(trim(p_reason), '');
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_order.organization_id);
  v_from := v_order.status;

  if v_from = p_status then
    return v_order;
  end if;
  if not app.order_transition_allowed(v_from, p_status) then
    raise exception 'invalid_transition' using errcode = '55000';
  end if;
  if p_status = 'cancelled' and (v_reason is null or char_length(v_reason) < 3) then
    raise exception 'cancel_reason_required' using errcode = '22023';
  end if;

  if p_status = 'cancelled' and v_order.stock_consumed_at is not null then
    perform app.reverse_order_stock(v_order, v_user);
  end if;

  update public.orders o
  set status = p_status,
      cancelled_at = case when p_status = 'cancelled' then now() end,
      cancel_reason = case when p_status = 'cancelled' then left(v_reason, 500) end,
      updated_by = v_user,
      updated_at = now()
  where o.id = v_order.id
  returning * into v_order;

  insert into public.order_status_history (organization_id, order_id, from_status, to_status, reason, changed_by)
  values (v_order.organization_id, v_order.id, v_from, p_status, left(v_reason, 500), v_user);

  return v_order;
end;
$$;

-- update_order não pode mudar itens de um pedido já baixado do estoque.
create or replace function app.guard_consumed_order_items()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.orders o
    where o.id = coalesce(old.order_id, new.order_id) and o.stock_consumed_at is not null
  ) then
    raise exception 'order_stock_consumed' using errcode = '55000';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger order_items_guard_consumed
  before insert or update or delete on public.order_items
  for each row execute function app.guard_consumed_order_items();

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.inventory_movements enable row level security;
revoke all on public.inventory_movements from anon, authenticated;
grant select on public.inventory_movements to authenticated;

create policy inventory_movements_select on public.inventory_movements
  for select to authenticated using (app.is_member(organization_id));

-- A view de pedidos passa a expor a marca de baixa.
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
  o.stock_consumed_at
from public.orders o
left join public.customers c on c.id = o.customer_id;

revoke all on function public.inventory_move(uuid, public.inventory_movement_type, numeric, uuid, text, boolean) from public, anon;
revoke all on function public.inventory_adjust(uuid, numeric, text, uuid) from public, anon;
revoke all on function public.inventory_reverse(bigint, text, uuid) from public, anon;
revoke all on function public.inventory_consume_order(uuid, boolean) from public, anon;
grant execute on function public.inventory_move(uuid, public.inventory_movement_type, numeric, uuid, text, boolean) to authenticated;
grant execute on function public.inventory_adjust(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.inventory_reverse(bigint, text, uuid) to authenticated;
grant execute on function public.inventory_consume_order(uuid, boolean) to authenticated;
