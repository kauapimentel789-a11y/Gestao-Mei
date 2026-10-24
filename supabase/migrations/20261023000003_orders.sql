-- 0003 — Pedidos, vendas e ordens de serviço.
--
-- Um único conceito (`orders`) com `kind` para pedido, venda e OS, para
-- reaproveitar itens, cliente, status, financeiro e tarefas (ADENDO, item D).
--
-- Regras:
-- * O app não grava em orders/order_items: tudo passa pelas RPCs abaixo,
--   que calculam os totais no banco e registram quem fez cada alteração.
-- * Número sequencial por empresa (order_counters, com trava de linha).
-- * Preço e descrição do item são copiados no momento da venda.
-- * idempotency_key impede pedido duplicado por toque duplo ou reenvio.
-- * Nada é apagado: cancelamento é status + motivo, com histórico.
-- * Estar concluído ou entregue não significa estar pago (isso é do financeiro).

create type public.order_kind as enum ('order', 'sale', 'service_order');
create type public.order_status as enum ('received', 'confirmed', 'in_progress', 'completed', 'delivered', 'cancelled');
create type public.order_channel as enum ('whatsapp', 'instagram', 'phone', 'in_person', 'link', 'other');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.order_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number integer not null default 0
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number integer not null check (number > 0),
  kind public.order_kind not null default 'order',
  status public.order_status not null default 'received',
  customer_id uuid,
  channel public.order_channel not null default 'other',
  due_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  -- Campos de ordem de serviço
  problem_description text check (problem_description is null or char_length(problem_description) <= 2000),
  scheduled_for timestamptz,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  idempotency_key uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid not null references auth.users (id),
  updated_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  constraint orders_total_matches check (total_cents = subtotal_cents - discount_cents),
  constraint orders_cancel_consistent check ((status = 'cancelled') = (cancelled_at is not null))
);

create index orders_org_status_due_idx on public.orders (organization_id, status, due_at);
create index orders_org_created_idx on public.orders (organization_id, created_at desc);
create index orders_org_customer_idx on public.orders (organization_id, customer_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null,
  position smallint not null check (position >= 0),
  product_id uuid,
  description text not null check (char_length(trim(description)) between 1 and 160),
  unit text not null default 'un',
  quantity numeric(14, 3) not null check (quantity > 0 and quantity <= 1000000),
  unit_price_cents bigint not null check (unit_price_cents between 0 and 100000000000),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  unique (order_id, position),
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id)
);

create index order_items_org_product_idx on public.order_items (organization_id, product_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  order_id uuid not null,
  from_status public.order_status,
  to_status public.order_status not null,
  reason text,
  changed_by uuid not null references auth.users (id),
  changed_at timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade
);

create index order_status_history_order_idx on public.order_status_history (order_id, changed_at);

-- ---------------------------------------------------------------------------
-- Regras de status
-- ---------------------------------------------------------------------------

-- Avançar é permitido (inclusive pulando etapas, ex.: venda de balcão direto
-- para Entregue). Voltar só de Concluído para Em andamento (reabrir).
-- Cancelar de qualquer status que não seja final. Entregue e Cancelado são finais.
create function app.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from in ('delivered', 'cancelled') then false
    when p_to = 'cancelled' then true
    when p_from = 'completed' and p_to = 'in_progress' then true
    else array_position(enum_range(null::public.order_status), p_to)
       > array_position(enum_range(null::public.order_status), p_from)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------------

create function app.assert_member(p_org uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not app.is_member(p_org) then
    -- Mesma mensagem para empresa inexistente e sem acesso.
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_user;
end;
$$;

-- Grava os itens de um pedido a partir do JSON do app e devolve o subtotal.
-- Formato: [{ "product_id": uuid?, "description": text?, "quantity": number,
--             "unit_price_cents": int?, "discount_cents": int? }]
-- Com product_id, descrição, unidade e preço vêm do cadastro (o preço pode ser
-- sobrescrito, ex.: negociação). Sem product_id, descrição e preço são obrigatórios.
create function app.write_order_items(p_org uuid, p_order uuid, p_items jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_pos integer := 0;
  v_product public.products;
  v_qty numeric;
  v_price bigint;
  v_disc bigint;
  v_desc text;
  v_unit text;
  v_line bigint;
  v_subtotal bigint := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;

  delete from public.order_items where order_id = p_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := null;
    if nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product
      from public.products p
      where p.id = (v_item ->> 'product_id')::uuid and p.organization_id = p_org;
      if not found then
        raise exception 'product_not_found' using errcode = 'P0002';
      end if;
    end if;

    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000 or scale(v_qty) > 3 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    v_price := coalesce((v_item ->> 'unit_price_cents')::bigint, v_product.price_cents);
    if v_price is null or v_price < 0 then
      raise exception 'price_required' using errcode = '22023';
    end if;

    v_desc := coalesce(nullif(trim(v_item ->> 'description'), ''), v_product.name);
    if v_desc is null then
      raise exception 'description_required' using errcode = '22023';
    end if;
    v_unit := coalesce(v_product.unit, 'un');

    v_disc := coalesce((v_item ->> 'discount_cents')::bigint, 0);
    v_line := round(v_qty * v_price)::bigint - v_disc;
    if v_disc < 0 or v_line < 0 then
      raise exception 'invalid_discount' using errcode = '22023';
    end if;

    insert into public.order_items
      (organization_id, order_id, position, product_id, description, unit, quantity,
       unit_price_cents, discount_cents, line_total_cents)
    values
      (p_org, p_order, v_pos, v_product.id, left(v_desc, 160), v_unit, v_qty,
       v_price, v_disc, v_line);

    v_subtotal := v_subtotal + v_line;
    v_pos := v_pos + 1;
  end loop;

  return v_subtotal;
end;
$$;

revoke all on function app.assert_member(uuid) from public;
revoke all on function app.write_order_items(uuid, uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- RPC: criar pedido
-- ---------------------------------------------------------------------------

create function public.create_order(
  p_organization_id uuid,
  p_items jsonb,
  p_idempotency_key uuid,
  p_kind public.order_kind default 'order',
  p_customer_id uuid default null,
  p_channel public.order_channel default 'other',
  p_due_at timestamptz default null,
  p_notes text default null,
  p_discount_cents bigint default 0,
  p_status public.order_status default 'received',
  p_problem_description text default null,
  p_scheduled_for timestamptz default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_order public.orders;
  v_number integer;
  v_subtotal bigint;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;

  -- Reenvio da mesma requisição: devolve o pedido já criado.
  select * into v_order
  from public.orders o
  where o.organization_id = p_organization_id and o.idempotency_key = p_idempotency_key;
  if found then
    return v_order;
  end if;

  if p_status = 'cancelled' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if p_kind = 'service_order'
     and not exists (
       select 1 from public.organizations org
       where org.id = p_organization_id and 'services' = any (org.enabled_modules)
     ) then
    raise exception 'module_not_enabled' using errcode = '42501';
  end if;
  if p_customer_id is not null
     and not exists (select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_organization_id) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;
  if coalesce(p_discount_cents, 0) < 0 then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  -- Próximo número da empresa. A linha do contador fica travada até o fim da
  -- transação, então pedidos simultâneos recebem números diferentes.
  insert into public.order_counters as oc (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update set last_number = oc.last_number + 1
  returning last_number into v_number;

  insert into public.orders
    (organization_id, number, kind, status, customer_id, channel, due_at, notes,
     problem_description, scheduled_for, idempotency_key, created_by, updated_by)
  values
    (p_organization_id, v_number, p_kind, p_status, p_customer_id, p_channel, p_due_at,
     nullif(trim(p_notes), ''), nullif(trim(p_problem_description), ''), p_scheduled_for,
     p_idempotency_key, v_user, v_user)
  returning * into v_order;

  v_subtotal := app.write_order_items(p_organization_id, v_order.id, p_items);
  if coalesce(p_discount_cents, 0) > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  update public.orders o
  set subtotal_cents = v_subtotal,
      discount_cents = coalesce(p_discount_cents, 0),
      total_cents = v_subtotal - coalesce(p_discount_cents, 0)
  where o.id = v_order.id
  returning * into v_order;

  insert into public.order_status_history (organization_id, order_id, from_status, to_status, changed_by)
  values (p_organization_id, v_order.id, null, v_order.status, v_user);

  return v_order;
exception
  when unique_violation then
    -- Duas requisições iguais ao mesmo tempo: a segunda devolve o pedido da primeira.
    select * into v_order
    from public.orders o
    where o.organization_id = p_organization_id and o.idempotency_key = p_idempotency_key;
    if found then
      return v_order;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: editar pedido (antes de concluir)
-- ---------------------------------------------------------------------------

create function public.update_order(
  p_order_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_channel public.order_channel default 'other',
  p_due_at timestamptz default null,
  p_notes text default null,
  p_discount_cents bigint default 0,
  p_problem_description text default null,
  p_scheduled_for timestamptz default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_user uuid;
  v_subtotal bigint;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_order.organization_id);

  if v_order.status not in ('received', 'confirmed', 'in_progress') then
    raise exception 'order_locked' using errcode = '55000';
  end if;
  if p_customer_id is not null
     and not exists (select 1 from public.customers c where c.id = p_customer_id and c.organization_id = v_order.organization_id) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  v_subtotal := app.write_order_items(v_order.organization_id, v_order.id, p_items);
  if coalesce(p_discount_cents, 0) < 0 or coalesce(p_discount_cents, 0) > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  update public.orders o
  set customer_id = p_customer_id,
      channel = p_channel,
      due_at = p_due_at,
      notes = nullif(trim(p_notes), ''),
      problem_description = nullif(trim(p_problem_description), ''),
      scheduled_for = p_scheduled_for,
      subtotal_cents = v_subtotal,
      discount_cents = coalesce(p_discount_cents, 0),
      total_cents = v_subtotal - coalesce(p_discount_cents, 0),
      updated_by = v_user,
      updated_at = now()
  where o.id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: mudar status / cancelar
-- ---------------------------------------------------------------------------

create function public.set_order_status(
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

  -- Repetir o mesmo status não faz nada (toque duplo, reenvio).
  if v_from = p_status then
    return v_order;
  end if;
  if not app.order_transition_allowed(v_from, p_status) then
    raise exception 'invalid_transition' using errcode = '55000';
  end if;
  if p_status = 'cancelled' and (v_reason is null or char_length(v_reason) < 3) then
    raise exception 'cancel_reason_required' using errcode = '22023';
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

-- ---------------------------------------------------------------------------
-- Lista de pedidos (com nome do cliente e resumo dos itens, para busca)
-- ---------------------------------------------------------------------------

create view public.order_summaries
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
  ) as items_summary
from public.orders o
left join public.customers c on c.id = o.customer_id;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.order_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

revoke all on public.order_counters, public.orders, public.order_items, public.order_status_history,
  public.order_summaries from anon, authenticated;

-- Só leitura direta; escrita pelas RPCs.
grant select on public.orders, public.order_items, public.order_status_history, public.order_summaries
  to authenticated;

create policy orders_select on public.orders
  for select to authenticated using (app.is_member(organization_id));
create policy order_items_select on public.order_items
  for select to authenticated using (app.is_member(organization_id));
create policy order_status_history_select on public.order_status_history
  for select to authenticated using (app.is_member(organization_id));
-- order_counters: sem política e sem grant (só as RPCs acessam).

revoke all on function public.create_order(uuid, jsonb, uuid, public.order_kind, uuid, public.order_channel,
  timestamptz, text, bigint, public.order_status, text, timestamptz) from public, anon;
revoke all on function public.update_order(uuid, jsonb, uuid, public.order_channel, timestamptz, text, bigint,
  text, timestamptz) from public, anon;
revoke all on function public.set_order_status(uuid, public.order_status, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, uuid, public.order_kind, uuid, public.order_channel,
  timestamptz, text, bigint, public.order_status, text, timestamptz) to authenticated;
grant execute on function public.update_order(uuid, jsonb, uuid, public.order_channel, timestamptz, text, bigint,
  text, timestamptz) to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;
