-- 0023 — Venda por quilo e taxa de entrega por bairro (assadão, açougue,
-- marmitaria, doceria que entrega).
--
-- Venda por quilo:
-- * Item com unidade "kg" tem preço por quilo. A quantidade do pedido já
--   aceitava 3 casas (0003), então 1,250 kg × R$ 59,90 = R$ 74,88 e a baixa
--   do estoque sai em quilos, como qualquer item.
-- * No link de encomenda o cliente pede um peso aproximado (de 0,1 a 100 kg).
-- * `set_order_weights` grava o peso conferido na balança depois, só dos
--   itens em kg, com o preço já gravado no pedido. Como qualquer edição de
--   itens, não vale depois da baixa do estoque nem com o pedido fechado.
--
-- Taxa de entrega:
-- * `delivery_zones`: bairros (ou regiões) com a taxa de cada um. O dono ou
--   admin cadastra pela RPC `save_delivery_zone`; nada é apagado, desativa.
-- * O pedido guarda a taxa, o bairro (id e nome copiados no momento, como o
--   preço do item) e o endereço. Total = itens − desconto + entrega.
--   O desconto continua limitado ao valor dos itens.
-- * `create_order` e `update_order` ganham os campos de entrega no fim (os
--   que chamam pela posição continuam iguais). Com bairro e sem taxa, vale a
--   taxa do cadastro; sem bairro dá para informar uma taxa avulsa.
-- * O link de encomenda mostra os bairros ativos; o cliente escolhe retirada
--   ou entrega (bairro + endereço) e a taxa vem do cadastro.

-- ---------------------------------------------------------------------------
-- Bairros de entrega
-- ---------------------------------------------------------------------------

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  fee_cents bigint not null check (fee_cents between 0 and 100000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index delivery_zones_org_name_idx on public.delivery_zones (organization_id, lower(name)) where active;
create index delivery_zones_org_idx on public.delivery_zones (organization_id, active, lower(name));

alter table public.delivery_zones enable row level security;
revoke all on public.delivery_zones from anon, authenticated;
grant select on public.delivery_zones to authenticated;
create policy delivery_zones_select on public.delivery_zones
  for select to authenticated using (app.is_member(organization_id));

-- Cria (p_id vazio) ou atualiza nome, taxa e situação. Dono ou admin.
create function public.save_delivery_zone(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_fee_cents bigint,
  p_active boolean default true
)
returns public.delivery_zones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_row public.delivery_zones;
begin
  if not app.has_role(p_organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'invalid_zone_name' using errcode = '22023';
  end if;
  if p_fee_cents is null or p_fee_cents not between 0 and 100000000 then
    raise exception 'invalid_delivery_fee' using errcode = '22023';
  end if;
  if exists (select 1 from public.delivery_zones z
             where z.organization_id = p_organization_id and z.active and coalesce(p_active, true)
               and lower(z.name) = lower(v_name) and z.id is distinct from p_id) then
    raise exception 'zone_exists' using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.delivery_zones (organization_id, name, fee_cents, active, created_by)
    values (p_organization_id, v_name, p_fee_cents, coalesce(p_active, true), v_user)
    returning * into v_row;
  else
    update public.delivery_zones z
    set name = v_name, fee_cents = p_fee_cents, active = coalesce(p_active, z.active), updated_at = now()
    where z.id = p_id and z.organization_id = p_organization_id
    returning * into v_row;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;

revoke all on function public.save_delivery_zone(uuid, uuid, text, bigint, boolean) from public, anon;
grant execute on function public.save_delivery_zone(uuid, uuid, text, bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Entrega no pedido
-- ---------------------------------------------------------------------------

alter table public.orders
  add column delivery_fee_cents bigint not null default 0 check (delivery_fee_cents between 0 and 100000000),
  add column delivery_zone_id uuid,
  add column delivery_area text check (delivery_area is null or char_length(delivery_area) between 1 and 60),
  add column delivery_address text check (delivery_address is null or char_length(delivery_address) between 1 and 300),
  add constraint orders_delivery_zone_fk foreign key (organization_id, delivery_zone_id)
    references public.delivery_zones (organization_id, id);

alter table public.orders drop constraint orders_total_matches;
alter table public.orders
  add constraint orders_total_matches check (total_cents = subtotal_cents - discount_cents + delivery_fee_cents);

-- Confere bairro e taxa e devolve o que o pedido grava. p_current_zone é o
-- bairro que o pedido já tem: um bairro desativado depois continua valendo
-- na edição desse pedido.
create function app.resolve_delivery(
  p_org uuid,
  p_zone_id uuid,
  p_fee_cents bigint,
  p_address text,
  p_current_zone uuid default null,
  out zone_id uuid,
  out area text,
  out fee_cents bigint,
  out address text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zone public.delivery_zones;
begin
  address := nullif(trim(coalesce(p_address, '')), '');
  if address is not null and char_length(address) > 300 then
    raise exception 'address_too_long' using errcode = '22023';
  end if;
  if p_zone_id is not null then
    select * into v_zone from public.delivery_zones z
    where z.id = p_zone_id and z.organization_id = p_org and (z.active or z.id = p_current_zone);
    if not found then
      raise exception 'delivery_zone_not_found' using errcode = 'P0002';
    end if;
    zone_id := v_zone.id;
    area := v_zone.name;
    fee_cents := coalesce(p_fee_cents, v_zone.fee_cents);
  else
    fee_cents := coalesce(p_fee_cents, 0);
  end if;
  if fee_cents not between 0 and 100000000 then
    raise exception 'invalid_delivery_fee' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.resolve_delivery(uuid, uuid, bigint, text, uuid) from public;

-- ---------------------------------------------------------------------------
-- create_order / update_order com entrega (mesmo corpo da 0003 + entrega)
-- ---------------------------------------------------------------------------

drop function public.create_order(uuid, jsonb, uuid, public.order_kind, uuid, public.order_channel,
  timestamptz, text, bigint, public.order_status, text, timestamptz);

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
  p_scheduled_for timestamptz default null,
  p_delivery_zone_id uuid default null,
  p_delivery_fee_cents bigint default null,
  p_delivery_address text default null
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
  v_delivery record;
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
  select * into v_delivery from app.resolve_delivery(p_organization_id, p_delivery_zone_id, p_delivery_fee_cents, p_delivery_address);

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
      delivery_fee_cents = v_delivery.fee_cents,
      delivery_zone_id = v_delivery.zone_id,
      delivery_area = v_delivery.area,
      delivery_address = v_delivery.address,
      total_cents = v_subtotal - coalesce(p_discount_cents, 0) + v_delivery.fee_cents
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

drop function public.update_order(uuid, jsonb, uuid, public.order_channel, timestamptz, text, bigint, text, timestamptz);

create function public.update_order(
  p_order_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_channel public.order_channel default 'other',
  p_due_at timestamptz default null,
  p_notes text default null,
  p_discount_cents bigint default 0,
  p_problem_description text default null,
  p_scheduled_for timestamptz default null,
  p_delivery_zone_id uuid default null,
  p_delivery_fee_cents bigint default null,
  p_delivery_address text default null
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
  v_delivery record;
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
  select * into v_delivery
  from app.resolve_delivery(v_order.organization_id, p_delivery_zone_id, p_delivery_fee_cents, p_delivery_address, v_order.delivery_zone_id);

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
      delivery_fee_cents = v_delivery.fee_cents,
      delivery_zone_id = v_delivery.zone_id,
      delivery_area = v_delivery.area,
      delivery_address = v_delivery.address,
      total_cents = v_subtotal - coalesce(p_discount_cents, 0) + v_delivery.fee_cents,
      updated_by = v_user,
      updated_at = now()
  where o.id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.create_order(uuid, jsonb, uuid, public.order_kind, uuid, public.order_channel,
  timestamptz, text, bigint, public.order_status, text, timestamptz, uuid, bigint, text) from public, anon;
revoke all on function public.update_order(uuid, jsonb, uuid, public.order_channel, timestamptz, text, bigint,
  text, timestamptz, uuid, bigint, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, uuid, public.order_kind, uuid, public.order_channel,
  timestamptz, text, bigint, public.order_status, text, timestamptz, uuid, bigint, text) to authenticated;
grant execute on function public.update_order(uuid, jsonb, uuid, public.order_channel, timestamptz, text, bigint,
  text, timestamptz, uuid, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Peso conferido na balança
-- ---------------------------------------------------------------------------

-- p_weights: [{ "item_id": uuid, "quantity": number }], só itens em kg do
-- pedido. O preço por quilo é o que ficou gravado no item.
create function public.set_order_weights(p_order_id uuid, p_weights jsonb)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_user uuid;
  v_w jsonb;
  v_item public.order_items;
  v_qty numeric;
  v_line bigint;
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
  if p_weights is null or jsonb_typeof(p_weights) <> 'array' or jsonb_array_length(p_weights) = 0
     or jsonb_array_length(p_weights) > 100 then
    raise exception 'items_required' using errcode = '22023';
  end if;

  for v_w in select * from jsonb_array_elements(p_weights) loop
    if jsonb_typeof(v_w -> 'quantity') <> 'number' then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    v_qty := (v_w ->> 'quantity')::numeric;
    if v_qty <= 0 or v_qty > 1000000 or scale(v_qty) > 3 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    select * into v_item from public.order_items i
    where i.order_id = v_order.id and i.id::text = (v_w ->> 'item_id') and i.unit = 'kg';
    if not found then
      raise exception 'item_not_found' using errcode = 'P0002';
    end if;
    v_line := round(v_qty * v_item.unit_price_cents)::bigint - v_item.discount_cents;
    if v_line < 0 then
      raise exception 'invalid_discount' using errcode = '22023';
    end if;
    -- O gatilho da 0004 recusa a mudança se o estoque do pedido já foi baixado.
    update public.order_items i set quantity = v_qty, line_total_cents = v_line where i.id = v_item.id;
  end loop;

  select coalesce(sum(i.line_total_cents), 0) into v_subtotal from public.order_items i where i.order_id = v_order.id;
  if v_order.discount_cents > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  update public.orders o
  set subtotal_cents = v_subtotal,
      total_cents = v_subtotal - o.discount_cents + o.delivery_fee_cents,
      updated_by = v_user,
      updated_at = now()
  where o.id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.set_order_weights(uuid, jsonb) from public, anon;
grant execute on function public.set_order_weights(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Link de encomenda: bairros na vitrine, peso e entrega no envio
-- ---------------------------------------------------------------------------

create or replace function public.public_storefront(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations o where o.slug = lower(trim(p_slug)) and o.public_orders_enabled;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'name', v_org.name,
    'slug', v_org.slug,
    'business_type', v_org.business_type,
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description, 'unit', p.unit,
        'item_type', p.item_type, 'price_cents', p.price_cents
      ) order by lower(p.name))
      from public.products p
      where p.organization_id = v_org.id and p.active and p.price_cents > 0
        and p.item_type in ('finished', 'resale', 'service')), '[]'::jsonb),
    'delivery_zones', coalesce((
      select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee_cents', z.fee_cents) order by lower(z.name))
      from public.delivery_zones z
      where z.organization_id = v_org.id and z.active), '[]'::jsonb)
  );
end;
$$;

drop function public.public_create_order(text, text, text, jsonb, uuid, text, date, text);

create function public.public_create_order(
  p_slug text,
  p_customer_name text,
  p_phone text,
  p_items jsonb,
  p_idempotency_key uuid,
  p_client_hash text,
  p_due_date date default null,
  p_notes text default null,
  p_delivery_zone_id uuid default null,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_order public.orders;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_local text;
  v_name text := trim(coalesce(p_customer_name, ''));
  v_address text := nullif(regexp_replace(trim(coalesce(p_address, '')), '\s+', ' ', 'g'), '');
  v_customer uuid;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_product public.products;
  v_qty numeric;
  v_number integer;
  v_subtotal bigint;
  v_zone public.delivery_zones;
begin
  select * into v_org from public.organizations o where o.slug = lower(trim(p_slug)) and o.public_orders_enabled;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if p_client_hash is null or char_length(p_client_hash) not between 16 and 128 then
    raise exception 'invalid_client' using errcode = '22023';
  end if;

  -- Reenvio do mesmo formulário: devolve o pedido já criado.
  select * into v_order from public.orders o
  where o.organization_id = v_org.id and o.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('number', v_order.number, 'total_cents', v_order.total_cents,
      'delivery_fee_cents', v_order.delivery_fee_cents);
  end if;

  -- Trava por empresa: as contagens do limite não correm em paralelo.
  perform pg_advisory_xact_lock(hashtextextended('public_order:' || v_org.id::text, 0));
  if (select count(*) from public.public_order_attempts a
      where a.organization_id = v_org.id and a.client_hash = p_client_hash and a.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.public_order_attempts a
      where a.organization_id = v_org.id and a.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(v_digits) not between 10 and 13 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if p_due_date is not null and (p_due_date < v_today or p_due_date > v_today + 365) then
    raise exception 'invalid_due_date' using errcode = '22023';
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'notes_too_long' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;

  -- Entrega: bairro ativo da empresa e endereço; sem bairro é retirada.
  if p_delivery_zone_id is not null then
    select * into v_zone from public.delivery_zones z
    where z.id = p_delivery_zone_id and z.organization_id = v_org.id and z.active;
    if not found then
      raise exception 'delivery_zone_not_found' using errcode = 'P0002';
    end if;
    if v_address is null or char_length(v_address) not between 5 and 200 then
      raise exception 'address_required' using errcode = '22023';
    end if;
  else
    v_address := null;
  end if;

  -- Só item da vitrine; o preço vem do cadastro. Quantidade inteira, ou peso
  -- aproximado (de 0,1 a 100 kg, até 3 casas) nos itens vendidos por quilo.
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item -> 'quantity') <> 'number' then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    if (v_item ->> 'product_id') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
    select * into v_product from public.products p
    where p.id = (v_item ->> 'product_id')::uuid and p.organization_id = v_org.id
      and p.active and p.price_cents > 0 and p.item_type in ('finished', 'resale', 'service');
    if not found then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
    if v_product.unit = 'kg' then
      if v_qty < 0.1 or v_qty > 100 or scale(v_qty) > 3 then
        raise exception 'invalid_quantity' using errcode = '22023';
      end if;
    elsif v_qty <> trunc(v_qty) or v_qty < 1 or v_qty > 1000 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    if v_items @> jsonb_build_array(jsonb_build_object('product_id', v_item ->> 'product_id')) then
      raise exception 'duplicate_input' using errcode = '22023';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_item ->> 'product_id', 'quantity', v_qty));
  end loop;

  -- Cliente pelo telefone, com ou sem o código do país. Cliente novo leva o
  -- endereço de entrega; o cadastro de quem já existe não muda.
  v_local := case when char_length(v_digits) >= 12 and v_digits like '55%' then substr(v_digits, 3) else v_digits end;
  select c.id into v_customer from public.customers c
  where c.organization_id = v_org.id and c.phone_digits in (v_local, '55' || v_local)
  order by c.created_at
  limit 1;
  if v_customer is null then
    insert into public.customers (organization_id, name, phone, address, created_by)
    values (v_org.id, v_name, left(trim(p_phone), 30), v_address, null)
    returning id into v_customer;
  end if;

  insert into public.order_counters as oc (organization_id, last_number)
  values (v_org.id, 1)
  on conflict (organization_id) do update set last_number = oc.last_number + 1
  returning last_number into v_number;

  insert into public.orders
    (organization_id, number, kind, status, customer_id, channel, due_at, notes, idempotency_key, created_by, updated_by)
  values
    (v_org.id, v_number,
     case v_org.business_type when 'services' then 'service_order' else 'order' end::public.order_kind,
     'received', v_customer, 'link',
     case when p_due_date is null then null else (p_due_date + time '18:00') at time zone 'America/Sao_Paulo' end,
     nullif(trim(p_notes), ''), p_idempotency_key, null, null)
  returning * into v_order;

  v_subtotal := app.write_order_items(v_org.id, v_order.id, v_items);
  update public.orders o
  set subtotal_cents = v_subtotal,
      delivery_fee_cents = coalesce(v_zone.fee_cents, 0),
      delivery_zone_id = v_zone.id,
      delivery_area = v_zone.name,
      delivery_address = v_address,
      total_cents = v_subtotal + coalesce(v_zone.fee_cents, 0)
  where o.id = v_order.id
  returning * into v_order;

  insert into public.order_status_history (organization_id, order_id, from_status, to_status, reason, changed_by)
  values (v_org.id, v_order.id, null, 'received', 'Enviado pelo link de encomenda', null);

  insert into public.public_order_attempts (organization_id, client_hash, order_id)
  values (v_org.id, p_client_hash, v_order.id);

  return jsonb_build_object('number', v_order.number, 'total_cents', v_order.total_cents,
    'delivery_fee_cents', v_order.delivery_fee_cents);
exception
  when unique_violation then
    select * into v_order from public.orders o
    where o.organization_id = v_org.id and o.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('number', v_order.number, 'total_cents', v_order.total_cents,
        'delivery_fee_cents', v_order.delivery_fee_cents);
    end if;
    raise;
end;
$$;

revoke all on function public.public_create_order(text, text, text, jsonb, uuid, text, date, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.public_create_order(text, text, text, jsonb, uuid, text, date, text, uuid, text)
  to service_role;
