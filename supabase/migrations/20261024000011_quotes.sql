-- 0011 — Orçamentos (PROMPT 4; ADENDO, onda 3).
--
-- Regras:
-- * Orçamento é uma proposta: não mexe em estoque nem no financeiro.
-- * Status: rascunho, enviado, aprovado, recusado, cancelado. "Vencido" é
--   derivado da validade (valid_until) e não é gravado.
-- * Só rascunho e enviado podem ser editados. Aprovar e converter gera um
--   pedido com os mesmos itens e preços do orçamento; converter de novo
--   devolve o mesmo pedido (quotes.order_id é único).
-- * Nada é apagado: desistência vira "cancelado" ou "recusado", com motivo.

create type public.quote_status as enum ('draft', 'sent', 'approved', 'rejected', 'cancelled');

create table public.quote_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number integer not null default 0
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number integer not null check (number > 0),
  status public.quote_status not null default 'draft',
  customer_id uuid,
  valid_until date,
  notes text check (notes is null or char_length(notes) <= 2000),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  order_id uuid unique,
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  idempotency_key uuid,
  created_by uuid not null references auth.users (id),
  updated_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  foreign key (organization_id, order_id) references public.orders (organization_id, id),
  constraint quotes_total_matches check (total_cents = subtotal_cents - discount_cents),
  constraint quotes_converted_approved check (order_id is null or status = 'approved')
);
create index quotes_org_created_idx on public.quotes (organization_id, created_at desc);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  position smallint not null check (position >= 0),
  product_id uuid,
  description text not null check (char_length(trim(description)) between 1 and 160),
  unit text not null default 'un',
  quantity numeric(14, 3) not null check (quantity > 0 and quantity <= 1000000),
  unit_price_cents bigint not null check (unit_price_cents between 0 and 100000000000),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  unique (quote_id, position),
  foreign key (organization_id, quote_id) references public.quotes (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id)
);

create table public.quote_status_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  quote_id uuid not null,
  from_status public.quote_status,
  to_status public.quote_status not null,
  reason text,
  changed_by uuid not null references auth.users (id),
  changed_at timestamptz not null default now(),
  foreign key (organization_id, quote_id) references public.quotes (organization_id, id)
);
create index quote_status_history_quote_idx on public.quote_status_history (quote_id, changed_at);

-- ---------------------------------------------------------------------------
-- Itens (mesmas regras dos itens do pedido; preço fica gravado)
-- ---------------------------------------------------------------------------

create function app.write_quote_items(p_org uuid, p_quote uuid, p_items jsonb)
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
  v_line bigint;
  v_subtotal bigint := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;

  delete from public.quote_items where quote_id = p_quote;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := null;
    if nullif(v_item ->> 'product_id', '') is not null then
      select * into v_product from public.products p
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
    v_disc := coalesce((v_item ->> 'discount_cents')::bigint, 0);
    v_line := round(v_qty * v_price)::bigint - v_disc;
    if v_disc < 0 or v_line < 0 then
      raise exception 'invalid_discount' using errcode = '22023';
    end if;

    insert into public.quote_items
      (organization_id, quote_id, position, product_id, description, unit, quantity, unit_price_cents, discount_cents, line_total_cents)
    values
      (p_org, p_quote, v_pos, v_product.id, left(v_desc, 160), coalesce(v_product.unit, 'un'), v_qty, v_price, v_disc, v_line);
    v_subtotal := v_subtotal + v_line;
    v_pos := v_pos + 1;
  end loop;
  return v_subtotal;
end;
$$;
revoke all on function app.write_quote_items(uuid, uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.create_quote(
  p_organization_id uuid,
  p_items jsonb,
  p_idempotency_key uuid,
  p_customer_id uuid default null,
  p_valid_until date default null,
  p_notes text default null,
  p_discount_cents bigint default 0
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_quote public.quotes;
  v_number integer;
  v_subtotal bigint;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_quote from public.quotes q where q.organization_id = p_organization_id and q.idempotency_key = p_idempotency_key;
  if found then
    return v_quote;
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_organization_id
  ) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  insert into public.quote_counters as qc (organization_id, last_number) values (p_organization_id, 1)
  on conflict (organization_id) do update set last_number = qc.last_number + 1
  returning last_number into v_number;

  insert into public.quotes (organization_id, number, customer_id, valid_until, notes, idempotency_key, created_by, updated_by)
  values (p_organization_id, v_number, p_customer_id, p_valid_until, nullif(trim(p_notes), ''), p_idempotency_key, v_user, v_user)
  returning * into v_quote;

  v_subtotal := app.write_quote_items(p_organization_id, v_quote.id, p_items);
  if coalesce(p_discount_cents, 0) < 0 or coalesce(p_discount_cents, 0) > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  update public.quotes q
  set subtotal_cents = v_subtotal, discount_cents = coalesce(p_discount_cents, 0), total_cents = v_subtotal - coalesce(p_discount_cents, 0)
  where q.id = v_quote.id
  returning * into v_quote;

  insert into public.quote_status_history (organization_id, quote_id, from_status, to_status, changed_by)
  values (v_quote.organization_id, v_quote.id, null, v_quote.status, v_user);
  return v_quote;
end;
$$;

create function public.update_quote(
  p_quote_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_valid_until date default null,
  p_notes text default null,
  p_discount_cents bigint default 0
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_user uuid;
  v_subtotal bigint;
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_quote.organization_id);
  if v_quote.status not in ('draft', 'sent') then
    raise exception 'quote_locked' using errcode = '55000';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.organization_id = v_quote.organization_id
  ) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  v_subtotal := app.write_quote_items(v_quote.organization_id, v_quote.id, p_items);
  if coalesce(p_discount_cents, 0) < 0 or coalesce(p_discount_cents, 0) > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  update public.quotes q
  set customer_id = p_customer_id, valid_until = p_valid_until, notes = nullif(trim(p_notes), ''),
      subtotal_cents = v_subtotal, discount_cents = coalesce(p_discount_cents, 0), total_cents = v_subtotal - coalesce(p_discount_cents, 0),
      updated_by = v_user, updated_at = now()
  where q.id = v_quote.id
  returning * into v_quote;
  return v_quote;
end;
$$;

-- Rascunho → enviado → aprovado/recusado; cancelar de rascunho ou enviado.
-- Aprovado e recusado são finais (aprovado segue para pedido).
create function public.set_quote_status(p_quote_id uuid, p_status public.quote_status, p_reason text default null)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_user uuid;
  v_from public.quote_status;
  v_reason text := left(nullif(trim(p_reason), ''), 500);
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_quote.organization_id);
  v_from := v_quote.status;
  if v_from = p_status then
    return v_quote;
  end if;
  if not (
    (v_from = 'draft' and p_status in ('sent', 'approved', 'rejected', 'cancelled'))
    or (v_from = 'sent' and p_status in ('draft', 'approved', 'rejected', 'cancelled'))
  ) then
    raise exception 'invalid_transition' using errcode = '55000';
  end if;
  if p_status in ('rejected', 'cancelled') and (v_reason is null or char_length(v_reason) < 3) then
    raise exception 'cancel_reason_required' using errcode = '22023';
  end if;

  update public.quotes q
  set status = p_status, status_reason = coalesce(v_reason, q.status_reason), updated_by = v_user, updated_at = now()
  where q.id = v_quote.id
  returning * into v_quote;
  insert into public.quote_status_history (organization_id, quote_id, from_status, to_status, reason, changed_by)
  values (v_quote.organization_id, v_quote.id, v_from, p_status, v_reason, v_user);
  return v_quote;
end;
$$;

-- Aprova (se preciso) e gera o pedido com os itens e preços do orçamento.
create function public.convert_quote_to_order(p_quote_id uuid, p_due_at timestamptz default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_user uuid;
  v_order public.orders;
  v_type public.business_type;
  v_items jsonb;
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_quote.organization_id);

  if v_quote.order_id is not null then
    select * into v_order from public.orders o where o.id = v_quote.order_id;
    return v_order;
  end if;
  if v_quote.status not in ('draft', 'sent', 'approved') then
    raise exception 'quote_locked' using errcode = '55000';
  end if;
  if v_quote.status <> 'approved' then
    perform public.set_quote_status(v_quote.id, 'approved');
  end if;

  select o.business_type into v_type from public.organizations o where o.id = v_quote.organization_id;
  select jsonb_agg(jsonb_build_object(
      'product_id', i.product_id, 'description', i.description, 'quantity', i.quantity,
      'unit_price_cents', i.unit_price_cents, 'discount_cents', i.discount_cents) order by i.position)
  into v_items
  from public.quote_items i where i.quote_id = v_quote.id;

  -- A chave do pedido é o id do orçamento: reenvio não cria outro pedido.
  v_order := public.create_order(
    v_quote.organization_id, v_items, v_quote.id,
    case v_type when 'resale' then 'sale' when 'services' then 'service_order' else 'order' end::public.order_kind,
    v_quote.customer_id, 'other', p_due_at,
    nullif(concat_ws(E'\n', 'Do orçamento #' || v_quote.number, v_quote.notes), ''),
    v_quote.discount_cents);

  update public.quotes q set order_id = v_order.id, updated_by = v_user, updated_at = now() where q.id = v_quote.id;
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visão para a lista
-- ---------------------------------------------------------------------------

create view public.quote_summaries
with (security_invoker = true)
as
select
  q.id,
  q.organization_id,
  q.number,
  q.status,
  q.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  q.valid_until,
  q.total_cents,
  q.order_id,
  o.number as order_number,
  q.created_at,
  q.updated_at,
  (
    select string_agg(
      replace(trim(trailing '.' from trim(trailing '0' from i.quantity::text)), '.', ',') || '× ' || i.description,
      ', ' order by i.position)
    from public.quote_items i where i.quote_id = q.id
  ) as items_summary
from public.quotes q
left join public.customers c on c.id = q.customer_id
left join public.orders o on o.id = q.order_id;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.quote_counters enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_status_history enable row level security;

revoke all on public.quote_counters, public.quotes, public.quote_items, public.quote_status_history, public.quote_summaries from anon, authenticated;
grant select on public.quotes, public.quote_items, public.quote_status_history, public.quote_summaries to authenticated;

create policy quotes_select on public.quotes for select to authenticated using (app.is_member(organization_id));
create policy quote_items_select on public.quote_items for select to authenticated using (app.is_member(organization_id));
create policy quote_status_history_select on public.quote_status_history for select to authenticated using (app.is_member(organization_id));

revoke all on function public.create_quote(uuid, jsonb, uuid, uuid, date, text, bigint) from public, anon;
revoke all on function public.update_quote(uuid, jsonb, uuid, date, text, bigint) from public, anon;
revoke all on function public.set_quote_status(uuid, public.quote_status, text) from public, anon;
revoke all on function public.convert_quote_to_order(uuid, timestamptz) from public, anon;
grant execute on function public.create_quote(uuid, jsonb, uuid, uuid, date, text, bigint) to authenticated;
grant execute on function public.update_quote(uuid, jsonb, uuid, date, text, bigint) to authenticated;
grant execute on function public.set_quote_status(uuid, public.quote_status, text) to authenticated;
grant execute on function public.convert_quote_to_order(uuid, timestamptz) to authenticated;
