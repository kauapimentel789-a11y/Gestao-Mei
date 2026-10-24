-- 0014 — Atendimentos com hora marcada (consultórios, escritórios, salões).
--
-- Não é um tipo de negócio novo: é uma empresa de serviços com área de
-- atendimento (practice_area). O atendimento continua sendo uma ordem de
-- serviço (orders.kind = 'service_order'), então financeiro, limite do MEI,
-- tarefas e relatórios funcionam igual.
--
-- Regras:
-- * book_appointment cria o atendimento já com data, hora e duração, numa
--   transação só. Choque de horário não bloqueia: o app avisa antes de salvar.
-- * "Faltou" é um cancelamento com no_show_at (nada é apagado). Só depois do
--   horário marcado.
-- * Lembrete enviado fica em reminder_sent_at e volta a vazio quando o horário muda.
-- * Anotações do atendimento (service_notes) só são acrescentadas, nunca
--   editadas nem apagadas. Só membros da empresa leem.

-- ---------------------------------------------------------------------------
-- Empresa: área de atendimento
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column practice_area text
    check (practice_area is null or practice_area in ('health', 'professional', 'beauty', 'other')),
  add constraint organizations_practice_services
    check (practice_area is null or business_type = 'services');

grant update (practice_area) on public.organizations to authenticated;

drop function public.create_organization(text, public.business_type, text, bigint);

create function public.create_organization(
  p_name text,
  p_business_type public.business_type,
  p_slug text default null,
  p_hourly_rate_cents bigint default 0,
  p_practice_area text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_slug text;
  v_org public.organizations;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if p_practice_area is not null and p_business_type <> 'services' then
    raise exception 'invalid_practice_area' using errcode = '22023';
  end if;

  -- Limite simples contra abuso: até 10 empresas criadas por usuário.
  if (select count(*) from public.organizations o where o.created_by = v_user) >= 10 then
    raise exception 'organization_limit_reached' using errcode = '54000';
  end if;

  v_slug := app.slugify(coalesce(nullif(trim(p_slug), ''), p_name));
  if v_slug !~ '^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  if exists (select 1 from public.organizations o where o.slug = v_slug) then
    raise exception 'slug_taken' using errcode = '23505';
  end if;

  insert into public.organizations (name, slug, business_type, enabled_modules, hourly_rate_cents, practice_area, created_by)
  values (trim(p_name), v_slug, p_business_type, array[p_business_type], coalesce(p_hourly_rate_cents, 0), p_practice_area, v_user)
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, v_user, 'owner');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, public.business_type, text, bigint, text) from public, anon;
grant execute on function public.create_organization(text, public.business_type, text, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Serviço do cadastro: duração padrão
-- ---------------------------------------------------------------------------

alter table public.products
  add column duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 1440);

grant insert (duration_minutes), update (duration_minutes) on public.products to authenticated;

-- ---------------------------------------------------------------------------
-- Atendimento: falta e lembrete
-- ---------------------------------------------------------------------------

alter table public.orders
  add column no_show_at timestamptz,
  add column reminder_sent_at timestamptz,
  add constraint orders_no_show_cancelled check (no_show_at is null or status = 'cancelled');

-- Novo horário pede novo lembrete.
create function app.orders_reset_reminder()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scheduled_for is distinct from old.scheduled_for then
    new.reminder_sent_at := null;
  end if;
  return new;
end;
$$;

create trigger orders_reset_reminder
  before update of scheduled_for on public.orders
  for each row execute function app.orders_reset_reminder();

-- ---------------------------------------------------------------------------
-- Anotações do atendimento
-- ---------------------------------------------------------------------------

create table public.service_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null,
  customer_id uuid,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  idempotency_key uuid not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, order_id) references public.orders (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id)
);
create index service_notes_order_idx on public.service_notes (order_id, created_at);
create index service_notes_customer_idx on public.service_notes (organization_id, customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Marca um atendimento: cliente, serviço (do cadastro ou avulso), data, hora e
-- duração. Sem duração, usa a do serviço do cadastro ou 1 h.
create function public.book_appointment(
  p_organization_id uuid,
  p_customer_id uuid,
  p_scheduled_for timestamptz,
  p_idempotency_key uuid,
  p_product_id uuid default null,
  p_description text default null,
  p_price_cents bigint default null,
  p_minutes integer default null,
  p_notes text default null,
  p_channel public.order_channel default 'other'
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_order public.orders;
  v_product public.products;
  v_minutes integer;
  v_item jsonb;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_order from public.orders o
  where o.organization_id = p_organization_id and o.idempotency_key = p_idempotency_key;
  if found then
    return v_order;
  end if;

  if p_customer_id is null then
    raise exception 'customer_required' using errcode = '22023';
  end if;
  if p_scheduled_for is null then
    raise exception 'schedule_required' using errcode = '22023';
  end if;

  if p_product_id is not null then
    select * into v_product from public.products p
    where p.id = p_product_id and p.organization_id = p_organization_id and p.item_type = 'service';
    if not found then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
    v_item := jsonb_build_object('product_id', v_product.id, 'quantity', 1);
    if p_price_cents is not null then
      v_item := v_item || jsonb_build_object('unit_price_cents', p_price_cents);
    end if;
  else
    if nullif(trim(p_description), '') is null then
      raise exception 'description_required' using errcode = '22023';
    end if;
    v_item := jsonb_build_object('description', trim(p_description), 'quantity', 1, 'unit_price_cents', coalesce(p_price_cents, 0));
  end if;

  v_minutes := coalesce(p_minutes, v_product.duration_minutes, 60);
  if v_minutes not between 5 and 1440 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;

  v_order := public.create_order(
    p_organization_id, jsonb_build_array(v_item), p_idempotency_key, 'service_order', p_customer_id, p_channel,
    null, p_notes, 0, 'received', null, p_scheduled_for);
  -- Duas requisições iguais ao mesmo tempo: create_order devolveu o da primeira.
  if v_order.scheduled_minutes is not null then
    return v_order;
  end if;

  update public.orders o
  set scheduled_minutes = v_minutes
  where o.id = v_order.id
  returning * into v_order;

  insert into public.order_schedule_changes (organization_id, order_id, from_at, to_at, minutes, changed_by)
  values (v_order.organization_id, v_order.id, null, p_scheduled_for, v_minutes, v_user);

  return v_order;
end;
$$;

-- Cliente não compareceu: cancela com motivo fixo e marca a falta.
create function public.mark_no_show(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform app.assert_member(v_order.organization_id);
  if v_order.no_show_at is not null then
    return v_order;
  end if;
  if v_order.scheduled_for is null then
    raise exception 'not_scheduled' using errcode = '55000';
  end if;
  if v_order.scheduled_for > now() then
    raise exception 'appointment_not_started' using errcode = '55000';
  end if;

  perform public.set_order_status(v_order.id, 'cancelled', 'Não compareceu');

  update public.orders o
  set no_show_at = now()
  where o.id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;

-- O app abriu o WhatsApp com o lembrete.
create function public.mark_reminder_sent(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform app.assert_member(v_order.organization_id);
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'order_closed' using errcode = '55000';
  end if;

  update public.orders o
  set reminder_sent_at = now()
  where o.id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;

create function public.add_service_note(p_order_id uuid, p_body text, p_idempotency_key uuid)
returns public.service_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_user uuid;
  v_note public.service_notes;
begin
  select * into v_order from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_order.organization_id);

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_note from public.service_notes n
  where n.organization_id = v_order.organization_id and n.idempotency_key = p_idempotency_key;
  if found then
    return v_note;
  end if;

  if p_body is null or char_length(trim(p_body)) not between 1 and 4000 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  insert into public.service_notes (organization_id, order_id, customer_id, body, idempotency_key, created_by)
  values (v_order.organization_id, v_order.id, v_order.customer_id, trim(p_body), p_idempotency_key, v_user)
  returning * into v_note;
  return v_note;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lista com falta e lembrete, para a agenda
-- ---------------------------------------------------------------------------

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
  o.problem_description,
  o.no_show_at,
  o.reminder_sent_at,
  c.phone_digits as customer_phone_digits
from public.orders o
left join public.customers c on c.id = o.customer_id;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.service_notes enable row level security;
revoke all on public.service_notes from anon, authenticated;
grant select on public.service_notes to authenticated;
create policy service_notes_select on public.service_notes
  for select to authenticated using (app.is_member(organization_id));

revoke all on function public.book_appointment(uuid, uuid, timestamptz, uuid, uuid, text, bigint, integer, text, public.order_channel) from public, anon;
revoke all on function public.mark_no_show(uuid) from public, anon;
revoke all on function public.mark_reminder_sent(uuid) from public, anon;
revoke all on function public.add_service_note(uuid, text, uuid) from public, anon;
grant execute on function public.book_appointment(uuid, uuid, timestamptz, uuid, uuid, text, bigint, integer, text, public.order_channel) to authenticated;
grant execute on function public.mark_no_show(uuid) to authenticated;
grant execute on function public.mark_reminder_sent(uuid) to authenticated;
grant execute on function public.add_service_note(uuid, text, uuid) to authenticated;
