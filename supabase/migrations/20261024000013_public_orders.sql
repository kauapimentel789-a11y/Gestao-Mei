-- 0013 — Link público de encomenda (README do design, item 3; ADENDO 3).
--
-- O cliente da empresa abre /e/<slug> sem login. A página fala com a Edge
-- Function `encomenda`, que valida a entrada (Zod), calcula um identificador
-- anônimo do visitante e chama os dois RPCs abaixo com a service role.
-- anon e authenticated não executam nada daqui nem leem as tabelas.
--
-- * O link fica desligado até o dono ou um admin ligar.
-- * A vitrine mostra só itens ativos, com preço, dos tipos que se vendem
--   (produto acabado, revenda e serviço).
-- * O preço vem sempre do cadastro; o cliente manda só item e quantidade.
-- * O cliente é casado pelo telefone (só dígitos, com ou sem o 55), nunca
--   pelo nome. Cliente existente não tem os dados alterados.
-- * O pedido entra com canal "link" e status "Recebido". Sem usuário logado,
--   created_by/updated_by/changed_by ficam nulos (só permitido no canal link).
-- * Limite de envios: 5 por visitante por hora e 60 por empresa por hora.

alter table public.organizations
  add column public_orders_enabled boolean not null default false;
grant update (public_orders_enabled) on public.organizations to authenticated;

alter table public.orders alter column created_by drop not null;
alter table public.orders alter column updated_by drop not null;
alter table public.orders
  add constraint orders_creator_or_link check (created_by is not null or channel = 'link');
alter table public.order_status_history alter column changed_by drop not null;
alter table public.customers alter column created_by drop not null;

create table public.public_order_attempts (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_hash text not null check (char_length(client_hash) between 16 and 128),
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now()
);
create index public_order_attempts_org_idx on public.public_order_attempts (organization_id, created_at desc);
create index public_order_attempts_client_idx on public.public_order_attempts (organization_id, client_hash, created_at desc);

alter table public.public_order_attempts enable row level security;
revoke all on public.public_order_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vitrine
-- ---------------------------------------------------------------------------

create function public.public_storefront(p_slug text)
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
        and p.item_type in ('finished', 'resale', 'service')), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Envio da encomenda
-- ---------------------------------------------------------------------------

create function public.public_create_order(
  p_slug text,
  p_customer_name text,
  p_phone text,
  p_items jsonb,
  p_idempotency_key uuid,
  p_client_hash text,
  p_due_date date default null,
  p_notes text default null
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
  v_customer uuid;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_qty numeric;
  v_number integer;
  v_subtotal bigint;
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
    return jsonb_build_object('number', v_order.number, 'total_cents', v_order.total_cents);
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

  -- Só item da vitrine, quantidade inteira; o preço vem do cadastro.
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item -> 'quantity') <> 'number' then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty <> trunc(v_qty) or v_qty < 1 or v_qty > 1000 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    if (v_item ->> 'product_id') !~ '^[0-9a-fA-F-]{36}$'
       or not exists (
         select 1 from public.products p
         where p.id = (v_item ->> 'product_id')::uuid and p.organization_id = v_org.id
           and p.active and p.price_cents > 0 and p.item_type in ('finished', 'resale', 'service')) then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
    if v_items @> jsonb_build_array(jsonb_build_object('product_id', v_item ->> 'product_id')) then
      raise exception 'duplicate_input' using errcode = '22023';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_item ->> 'product_id', 'quantity', v_qty));
  end loop;

  -- Cliente pelo telefone, com ou sem o código do país.
  v_local := case when char_length(v_digits) >= 12 and v_digits like '55%' then substr(v_digits, 3) else v_digits end;
  select c.id into v_customer from public.customers c
  where c.organization_id = v_org.id and c.phone_digits in (v_local, '55' || v_local)
  order by c.created_at
  limit 1;
  if v_customer is null then
    insert into public.customers (organization_id, name, phone, created_by)
    values (v_org.id, v_name, left(trim(p_phone), 30), null)
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
  set subtotal_cents = v_subtotal, total_cents = v_subtotal
  where o.id = v_order.id
  returning * into v_order;

  insert into public.order_status_history (organization_id, order_id, from_status, to_status, reason, changed_by)
  values (v_org.id, v_order.id, null, 'received', 'Enviado pelo link de encomenda', null);

  insert into public.public_order_attempts (organization_id, client_hash, order_id)
  values (v_org.id, p_client_hash, v_order.id);

  return jsonb_build_object('number', v_order.number, 'total_cents', v_order.total_cents);
exception
  when unique_violation then
    select * into v_order from public.orders o
    where o.organization_id = v_org.id and o.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('number', v_order.number, 'total_cents', v_order.total_cents);
    end if;
    raise;
end;
$$;

revoke all on function public.public_storefront(text) from public, anon, authenticated;
revoke all on function public.public_create_order(text, text, text, jsonb, uuid, text, date, text) from public, anon, authenticated;
grant execute on function public.public_storefront(text) to service_role;
grant execute on function public.public_create_order(text, text, text, jsonb, uuid, text, date, text) to service_role;
