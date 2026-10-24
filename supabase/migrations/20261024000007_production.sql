-- 0007 — Produção: ficha técnica (receita) e registro de produção.
--
-- Regras (PROMPT 6 e 7.7):
-- * Cada produto acabado tem no máximo uma receita: insumos por lote, quanto
--   o lote rende e os minutos de mão de obra. A receita é configuração e pode
--   ser editada; o que aconteceu de fato fica nas produções e movimentações.
-- * Registrar produção, numa transação só: baixa os insumos (consumo na
--   produção), dá entrada do produto pronto e grava o custo efetivo daquela
--   produção (insumos ao custo atual + mão de obra pelo valor da hora).
-- * O custo do produto passa a ser o custo médio ponderado das produções,
--   como na compra. Inclui mão de obra, para a margem refletir o trabalho.
-- * Consumo de estoque não é despesa nem saída de caixa: o dinheiro saiu na
--   compra do insumo.
-- * Produção não é editada; erro se corrige cancelando, o que estorna todas
--   as movimentações dela.

alter type public.inventory_movement_type add value if not exists 'production_output';

-- ---------------------------------------------------------------------------
-- Receitas
-- ---------------------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null unique,
  yield_qty numeric(14, 3) not null default 1 check (yield_qty > 0 and yield_qty <= 1000000),
  labor_minutes integer not null default 0 check (labor_minutes between 0 and 100000),
  notes text check (notes is null or char_length(notes) <= 1000),
  updated_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id)
);
create trigger recipes_updated_at before update on public.recipes
  for each row execute function app.set_updated_at();

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  recipe_id uuid not null,
  position smallint not null check (position >= 0),
  input_product_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0 and quantity <= 1000000),
  unique (recipe_id, position),
  unique (recipe_id, input_product_id),
  foreign key (organization_id, recipe_id) references public.recipes (organization_id, id) on delete cascade,
  foreign key (organization_id, input_product_id) references public.products (organization_id, id)
);

-- ---------------------------------------------------------------------------
-- Produções
-- ---------------------------------------------------------------------------

create type public.production_status as enum ('done', 'cancelled');

create table public.production_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number integer not null default 0
);

create table public.production_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number integer not null check (number > 0),
  status public.production_status not null default 'done',
  product_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0 and quantity <= 1000000),
  materials_cost_cents bigint not null check (materials_cost_cents >= 0),
  labor_cost_cents bigint not null check (labor_cost_cents >= 0),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  -- Insumos sem custo cadastrado: o custo efetivo fica incompleto.
  missing_cost_inputs integer not null default 0,
  order_id uuid,
  notes text check (notes is null or char_length(notes) <= 500),
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  idempotency_key uuid not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  foreign key (organization_id, order_id) references public.orders (organization_id, id),
  constraint production_runs_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);
create index production_runs_org_idx on public.production_runs (organization_id, created_at desc);

alter table public.inventory_movements add column production_run_id uuid;
alter table public.inventory_movements
  add foreign key (organization_id, production_run_id) references public.production_runs (organization_id, id);
create index inventory_movements_production_idx on public.inventory_movements (production_run_id) where production_run_id is not null;

-- ---------------------------------------------------------------------------
-- RPC: salvar receita (substitui os insumos)
-- ---------------------------------------------------------------------------

create function public.save_recipe(
  p_product_id uuid,
  p_items jsonb,
  p_yield_qty numeric default 1,
  p_labor_minutes integer default 0,
  p_notes text default null
)
returns public.recipes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_user uuid;
  v_recipe public.recipes;
  v_item jsonb;
  v_pos integer := 0;
  v_input public.products;
  v_qty numeric;
begin
  select * into v_product from public.products p where p.id = p_product_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_product.organization_id);

  if v_product.item_type not in ('finished', 'component') then
    raise exception 'recipe_not_allowed' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;
  if p_yield_qty is null or p_yield_qty <= 0 or p_yield_qty > 1000000 or scale(p_yield_qty) > 3 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if p_labor_minutes is null or p_labor_minutes not between 0 and 100000 then
    raise exception 'invalid_minutes' using errcode = '22023';
  end if;

  insert into public.recipes (organization_id, product_id, yield_qty, labor_minutes, notes, updated_by)
  values (v_product.organization_id, v_product.id, p_yield_qty, p_labor_minutes, nullif(trim(p_notes), ''), v_user)
  on conflict (product_id) do update
    set yield_qty = excluded.yield_qty, labor_minutes = excluded.labor_minutes,
        notes = excluded.notes, updated_by = excluded.updated_by
  returning * into v_recipe;

  delete from public.recipe_items i where i.recipe_id = v_recipe.id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_qty := (v_item ->> 'quantity')::numeric;
    exception when others then
      raise exception 'invalid_quantity' using errcode = '22023';
    end;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000 or scale(v_qty) > 3 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    select * into v_input from public.products p
    where p.id = (v_item ->> 'product_id')::uuid and p.organization_id = v_product.organization_id;
    if not found or v_input.item_type = 'service' then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
    if v_input.id = v_product.id then
      raise exception 'recipe_self_reference' using errcode = '22023';
    end if;

    insert into public.recipe_items (organization_id, recipe_id, position, input_product_id, quantity)
    values (v_product.organization_id, v_recipe.id, v_pos, v_input.id, v_qty);
    v_pos := v_pos + 1;
  end loop;

  return v_recipe;
exception
  when unique_violation then
    raise exception 'duplicate_input' using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: registrar produção
-- ---------------------------------------------------------------------------

create function public.register_production(
  p_product_id uuid,
  p_quantity numeric,
  p_idempotency_key uuid,
  p_order_id uuid default null,
  p_allow_negative boolean default false,
  p_notes text default null
)
returns public.production_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_user uuid;
  v_run public.production_runs;
  v_recipe public.recipes;
  v_rate bigint;
  v_factor numeric;
  v_number integer;
  v_line record;
  v_materials numeric := 0;
  v_missing integer := 0;
  v_labor bigint;
  v_unit bigint;
  v_base numeric;
  v_mov public.inventory_movements;
  v_input public.products;
begin
  select * into v_product from public.products p where p.id = p_product_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_product.organization_id);

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_run from public.production_runs r
  where r.organization_id = v_product.organization_id and r.idempotency_key = p_idempotency_key;
  if found then
    return v_run;
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 or scale(p_quantity) > 3 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  select * into v_recipe from public.recipes r where r.product_id = v_product.id;
  if not found then
    raise exception 'recipe_required' using errcode = '55000';
  end if;
  if p_order_id is not null and not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.organization_id = v_product.organization_id and o.status <> 'cancelled'
  ) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  select o.hourly_rate_cents into v_rate from public.organizations o where o.id = v_product.organization_id;
  v_factor := p_quantity / v_recipe.yield_qty;

  insert into public.production_counters as pc (organization_id, last_number)
  values (v_product.organization_id, 1)
  on conflict (organization_id) do update set last_number = pc.last_number + 1
  returning last_number into v_number;

  -- Custo e lançamento ficam para depois do insert (precisam do id).
  insert into public.production_runs
    (organization_id, number, product_id, quantity, materials_cost_cents, labor_cost_cents, unit_cost_cents,
     order_id, notes, idempotency_key, created_by)
  values
    (v_product.organization_id, v_number, v_product.id, p_quantity, 0, 0, 0, p_order_id,
     nullif(trim(p_notes), ''), p_idempotency_key, v_user)
  returning * into v_run;

  -- Insumos e produto, travados na ordem do id (evita deadlock entre produções).
  for v_line in
    select x.product_id, x.qty, x.is_output
    from (
      select i.input_product_id as product_id, round(i.quantity * v_factor, 3) as qty, false as is_output
      from public.recipe_items i where i.recipe_id = v_recipe.id
      union all
      select v_product.id, p_quantity, true
    ) x
    order by x.product_id, x.is_output
  loop
    if v_line.is_output then
      -- O produto pronto é travado na mesma ordem; custo e entrada vêm depois.
      perform 1 from public.products p where p.id = v_line.product_id for update;
      continue;
    end if;
    select * into v_input from public.products p where p.id = v_line.product_id for update;
    if v_input.cost_cents is null then
      v_missing := v_missing + 1;
    else
      v_materials := v_materials + v_line.qty * v_input.cost_cents;
    end if;
    if v_input.track_stock and v_line.qty > 0 then
      v_mov := app.apply_inventory_movement(v_product.organization_id, v_input.id, 'production_consumption', -v_line.qty,
        'Produção #' || v_number || ' · ' || v_product.name, p_order_id, null, p_allow_negative, null, v_user);
      update public.inventory_movements m set production_run_id = v_run.id where m.id = v_mov.id;
    end if;
  end loop;

  v_labor := round(v_recipe.labor_minutes * v_factor * coalesce(v_rate, 0) / 60.0)::bigint;
  v_unit := round((round(v_materials) + v_labor) / p_quantity)::bigint;

  -- Produto pronto: entrada no estoque e custo médio ponderado.
  select * into v_product from public.products p where p.id = v_product.id for update;
  v_base := greatest(v_product.stock_qty, 0);
  update public.products p
  set cost_cents = case
    when not v_product.track_stock or v_product.cost_cents is null or v_base = 0 then v_unit
    else round((v_base * v_product.cost_cents + p_quantity * v_unit) / (v_base + p_quantity))::bigint
  end
  where p.id = v_product.id;
  if v_product.track_stock then
    v_mov := app.apply_inventory_movement(v_product.organization_id, v_product.id, 'production_output', p_quantity,
      'Produção #' || v_number, p_order_id, null, false, null, v_user);
    update public.inventory_movements m set production_run_id = v_run.id where m.id = v_mov.id;
  end if;

  update public.production_runs r
  set materials_cost_cents = round(v_materials)::bigint, labor_cost_cents = v_labor, unit_cost_cents = v_unit,
      missing_cost_inputs = v_missing
  where r.id = v_run.id
  returning * into v_run;

  return v_run;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancelar produção
-- ---------------------------------------------------------------------------

create function public.cancel_production(p_run_id uuid, p_reason text)
returns public.production_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.production_runs;
  v_user uuid;
  v_mov public.inventory_movements;
  v_rev public.inventory_movements;
begin
  select * into v_run from public.production_runs r where r.id = p_run_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_run.organization_id);

  if v_run.status = 'cancelled' then
    return v_run;
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  for v_mov in
    select m.* from public.inventory_movements m
    where m.production_run_id = v_run.id and m.movement_type in ('production_consumption', 'production_output')
      and not exists (select 1 from public.inventory_movements r where r.reverses_movement_id = m.id)
    order by m.product_id
  loop
    v_rev := app.apply_inventory_movement(v_run.organization_id, v_mov.product_id, 'reversal', -v_mov.quantity,
      'Cancelamento da produção #' || v_run.number, v_mov.order_id, v_mov.id, true, null, v_user);
    update public.inventory_movements m set production_run_id = v_run.id where m.id = v_rev.id;
  end loop;

  update public.production_runs r
  set status = 'cancelled', cancelled_at = now(), cancel_reason = left(trim(p_reason), 500)
  where r.id = v_run.id
  returning * into v_run;
  return v_run;
end;
$$;

-- Movimentações de produção só são estornadas cancelando a produção.
create or replace function public.inventory_reverse(
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
  if v_mov.purchase_id is not null then
    raise exception 'movement_from_purchase' using errcode = '55000';
  end if;
  if v_mov.production_run_id is not null then
    raise exception 'movement_from_production' using errcode = '55000';
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
-- Visões
-- ---------------------------------------------------------------------------

-- Custo estimado pela receita, com os custos atuais dos insumos.
create view public.recipe_costs
with (security_invoker = true)
as
select
  r.id as recipe_id,
  r.organization_id,
  r.product_id,
  r.yield_qty,
  r.labor_minutes,
  coalesce(round(sum(i.quantity * ip.cost_cents)), 0)::bigint as materials_cost_cents,
  count(*) filter (where ip.cost_cents is null)::integer as missing_cost_inputs,
  round(r.labor_minutes * o.hourly_rate_cents / 60.0)::bigint as labor_cost_cents,
  round((coalesce(round(sum(i.quantity * ip.cost_cents)), 0) + round(r.labor_minutes * o.hourly_rate_cents / 60.0)) / r.yield_qty)::bigint
    as unit_cost_cents
from public.recipes r
join public.organizations o on o.id = r.organization_id
left join public.recipe_items i on i.recipe_id = r.id
left join public.products ip on ip.id = i.input_product_id
group by r.id, o.hourly_rate_cents;

-- Produções com nome do produto e número do pedido, para as listas.
create view public.production_run_summaries
with (security_invoker = true)
as
select
  r.id,
  r.organization_id,
  r.number,
  r.status,
  r.product_id,
  p.name as product_name,
  p.unit,
  r.quantity,
  r.materials_cost_cents,
  r.labor_cost_cents,
  r.unit_cost_cents,
  r.missing_cost_inputs,
  r.order_id,
  o.number as order_number,
  r.notes,
  r.cancel_reason,
  r.cancelled_at,
  r.created_at
from public.production_runs r
join public.products p on p.id = r.product_id
left join public.orders o on o.id = r.order_id;

-- O que falta produzir para os pedidos em aberto (ainda não baixados).
create view public.production_demand
with (security_invoker = true)
as
select
  p.id as product_id,
  p.organization_id,
  p.name,
  p.unit,
  p.stock_qty,
  sum(i.quantity) as ordered_qty,
  count(distinct o.id)::integer as open_orders,
  greatest(sum(i.quantity) - greatest(p.stock_qty, 0), 0) as to_produce_qty,
  exists (select 1 from public.recipes r where r.product_id = p.id) as has_recipe
from public.order_items i
join public.orders o on o.id = i.order_id
join public.products p on p.id = i.product_id
where o.status in ('received', 'confirmed', 'in_progress')
  and o.stock_consumed_at is null
  and p.item_type = 'finished'
  and p.track_stock
group by p.id;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.production_counters enable row level security;
alter table public.production_runs enable row level security;

revoke all on public.recipes, public.recipe_items, public.production_counters, public.production_runs from anon, authenticated;
revoke all on public.recipe_costs, public.production_demand, public.production_run_summaries from anon, authenticated;
grant select on public.recipes, public.recipe_items, public.production_runs, public.recipe_costs, public.production_demand,
  public.production_run_summaries to authenticated;

create policy recipes_select on public.recipes
  for select to authenticated using (app.is_member(organization_id));
create policy recipe_items_select on public.recipe_items
  for select to authenticated using (app.is_member(organization_id));
create policy production_runs_select on public.production_runs
  for select to authenticated using (app.is_member(organization_id));

revoke all on function public.save_recipe(uuid, jsonb, numeric, integer, text) from public, anon;
revoke all on function public.register_production(uuid, numeric, uuid, uuid, boolean, text) from public, anon;
revoke all on function public.cancel_production(uuid, text) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb, numeric, integer, text) to authenticated;
grant execute on function public.register_production(uuid, numeric, uuid, uuid, boolean, text) to authenticated;
grant execute on function public.cancel_production(uuid, text) to authenticated;
