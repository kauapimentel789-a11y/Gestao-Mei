-- 0016 — Planos e agendamento pelo site (plano Pro Max).
--
-- Planos:
-- * organizations.plan ('free', 'pro', 'pro_max') e plan_until (último dia
--   pago; vazio = sem vencimento). Ninguém do app muda o plano: quem administra
--   o Gestão Fácil roda app.set_plan no SQL Editor do Supabase.
-- * Plano vencido vale como grátis (app.effective_plan), sem precisar de rotina.
--
-- Agendamento pelo site (/agendar/<slug>):
-- * Só empresas de serviços no Pro Max, com o agendamento ligado pelo dono ou
--   admin. A página fala com a Edge Function `encomenda`, que chama os RPCs
--   public_booking_* com a service role (anon e authenticated não executam).
-- * Horário de funcionamento em business_hours: um ou mais intervalos por dia
--   da semana (ex.: 8h–12h e 13h–18h). É configuração, não registro: salvar
--   substitui a semana inteira.
-- * Horários oferecidos de 30 em 30 minutos dentro do funcionamento, com pelo
--   menos 1 h de antecedência e até 60 dias à frente, sem encostar em outro
--   atendimento não cancelado (duração do serviço ou 1 h).
-- * O agendamento vira OS agendada (canal link, status Recebido, sem autor),
--   igual ao pedido do link de encomenda. O horário é conferido de novo com a
--   empresa travada, então dois clientes não pegam o mesmo horário.
-- * Limite de envios compartilhado com o link de encomenda: 5 por visitante e
--   60 por empresa por hora.

-- ---------------------------------------------------------------------------
-- Planos
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column plan text not null default 'free' check (plan in ('free', 'pro', 'pro_max')),
  add column plan_until date,
  add column online_booking_enabled boolean not null default false,
  add constraint organizations_booking_services check (not online_booking_enabled or business_type = 'services');

grant update (online_booking_enabled) on public.organizations to authenticated;

create function app.effective_plan(p_plan text, p_until date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_until is not null and p_until < (now() at time zone 'America/Sao_Paulo')::date then 'free'
    else p_plan
  end;
$$;

grant execute on function app.effective_plan(text, date) to authenticated;

-- Ligar o agendamento exige Pro Max em dia. Desligar sempre pode.
create function app.organizations_booking_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.online_booking_enabled and not old.online_booking_enabled
     and app.effective_plan(new.plan, new.plan_until) <> 'pro_max' then
    raise exception 'plan_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_booking_plan
  before update of online_booking_enabled on public.organizations
  for each row execute function app.organizations_booking_plan();

-- Uso (SQL Editor): select app.set_plan('link-da-empresa', 'pro_max', '2026-12-31');
-- Voltar ao grátis: select app.set_plan('link-da-empresa', 'free');
create function app.set_plan(p_slug text, p_plan text, p_until date default null)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  if p_plan not in ('free', 'pro', 'pro_max') then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  update public.organizations o
  set plan = p_plan,
      plan_until = case when p_plan = 'free' then null else p_until end,
      online_booking_enabled = o.online_booking_enabled and p_plan = 'pro_max'
  where o.slug = lower(trim(p_slug))
  returning * into v_org;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_org;
end;
$$;

revoke all on function app.set_plan(text, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Horário de funcionamento
-- ---------------------------------------------------------------------------

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens_at time not null,
  closes_at time not null,
  created_at timestamptz not null default now(),
  check (opens_at < closes_at)
);
create index business_hours_org_idx on public.business_hours (organization_id, weekday, opens_at);

alter table public.business_hours enable row level security;
revoke all on public.business_hours from anon, authenticated;
grant select on public.business_hours to authenticated;
create policy business_hours_select on public.business_hours
  for select to authenticated using (app.is_member(organization_id));

-- Substitui a semana: [{ "weekday": 1, "opens_at": "08:00", "closes_at": "12:00" }, ...]
create function public.set_business_hours(p_organization_id uuid, p_hours jsonb)
returns setof public.business_hours
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_day smallint;
  v_open time;
  v_close time;
begin
  perform app.assert_member(p_organization_id);
  if not app.has_role(p_organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 28 then
    raise exception 'invalid_hours' using errcode = '22023';
  end if;

  delete from public.business_hours h where h.organization_id = p_organization_id;

  for v_item in select * from jsonb_array_elements(p_hours) loop
    if jsonb_typeof(v_item -> 'weekday') <> 'number'
       or coalesce(v_item ->> 'opens_at', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       or coalesce(v_item ->> 'closes_at', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'invalid_hours' using errcode = '22023';
    end if;
    v_day := (v_item ->> 'weekday')::smallint;
    v_open := (v_item ->> 'opens_at')::time;
    v_close := (v_item ->> 'closes_at')::time;
    if v_day not between 0 and 6 or v_open >= v_close then
      raise exception 'invalid_hours' using errcode = '22023';
    end if;
    if exists (select 1 from public.business_hours h
               where h.organization_id = p_organization_id and h.weekday = v_day
                 and h.opens_at < v_close and h.closes_at > v_open) then
      raise exception 'hours_overlap' using errcode = '22023';
    end if;
    insert into public.business_hours (organization_id, weekday, opens_at, closes_at)
    values (p_organization_id, v_day, v_open, v_close);
  end loop;

  return query select * from public.business_hours h
    where h.organization_id = p_organization_id order by h.weekday, h.opens_at;
end;
$$;

revoke all on function public.set_business_hours(uuid, jsonb) from public, anon;
grant execute on function public.set_business_hours(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Horários livres
-- ---------------------------------------------------------------------------

-- Inícios possíveis num dia (fuso de Brasília) para um serviço de p_minutes.
create function app.booking_free_slots(p_org uuid, p_minutes integer, p_day date)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select s
  from public.business_hours h
  cross join lateral generate_series(
    (p_day + h.opens_at) at time zone 'America/Sao_Paulo',
    (p_day + h.closes_at) at time zone 'America/Sao_Paulo' - make_interval(mins => p_minutes),
    interval '30 minutes') s
  where h.organization_id = p_org
    and h.weekday = extract(dow from p_day)
    and p_day between (now() at time zone 'America/Sao_Paulo')::date
                  and (now() at time zone 'America/Sao_Paulo')::date + 60
    and s >= now() + interval '1 hour'
    and not exists (
      select 1 from public.orders o
      where o.organization_id = p_org
        and o.scheduled_for is not null
        and o.status <> 'cancelled'
        and o.scheduled_for < s + make_interval(mins => p_minutes)
        and o.scheduled_for + make_interval(mins => coalesce(o.scheduled_minutes, 60)) > s)
  order by s;
$$;

revoke all on function app.booking_free_slots(uuid, integer, date) from public;

-- Empresa com o agendamento disponível (ligado, serviços e Pro Max em dia).
create function app.booking_org(p_slug text)
returns public.organizations
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations o
  where o.slug = lower(trim(p_slug))
    and o.online_booking_enabled
    and o.business_type = 'services'
    and app.effective_plan(o.plan, o.plan_until) = 'pro_max';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_org;
end;
$$;

revoke all on function app.booking_org(text) from public;

-- Serviço que se agenda pelo site: ativo, com preço, do cadastro da empresa.
create function app.booking_service(p_org uuid, p_product_id uuid)
returns public.products
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  select * into v_product from public.products p
  where p.id = p_product_id and p.organization_id = p_org
    and p.active and p.item_type = 'service' and p.price_cents > 0;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  return v_product;
end;
$$;

revoke all on function app.booking_service(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- RPCs da página pública
-- ---------------------------------------------------------------------------

create function public.public_booking_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations := app.booking_org(p_slug);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  return jsonb_build_object(
    'name', v_org.name,
    'slug', v_org.slug,
    'today', v_today,
    'last_day', v_today + 60,
    'weekdays', coalesce((
      select jsonb_agg(distinct h.weekday) from public.business_hours h where h.organization_id = v_org.id), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description,
        'price_cents', p.price_cents, 'duration_minutes', coalesce(p.duration_minutes, 60)
      ) order by lower(p.name))
      from public.products p
      where p.organization_id = v_org.id and p.active and p.item_type = 'service' and p.price_cents > 0), '[]'::jsonb)
  );
end;
$$;

create function public.public_booking_slots(p_slug text, p_product_id uuid, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations := app.booking_org(p_slug);
  v_product public.products := app.booking_service(v_org.id, p_product_id);
begin
  return jsonb_build_object(
    'day', p_day,
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', s, 'label', to_char(s at time zone 'America/Sao_Paulo', 'HH24:MI')) order by s)
      from app.booking_free_slots(v_org.id, coalesce(v_product.duration_minutes, 60), p_day) s), '[]'::jsonb)
  );
end;
$$;

-- Agendamento feito pelo cliente sem login.
alter table public.order_schedule_changes alter column changed_by drop not null;

create function public.public_book_appointment(
  p_slug text,
  p_product_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_phone text,
  p_idempotency_key uuid,
  p_client_hash text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations := app.booking_org(p_slug);
  v_product public.products;
  v_order public.orders;
  v_minutes integer;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_local text;
  v_name text := trim(coalesce(p_customer_name, ''));
  v_customer uuid;
  v_number integer;
  v_subtotal bigint;
  v_day date := (p_starts_at at time zone 'America/Sao_Paulo')::date;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if p_client_hash is null or char_length(p_client_hash) not between 16 and 128 then
    raise exception 'invalid_client' using errcode = '22023';
  end if;

  -- Reenvio do mesmo formulário: devolve o agendamento já criado.
  select * into v_order from public.orders o
  where o.organization_id = v_org.id and o.idempotency_key = p_idempotency_key;
  if found then
    return app.booking_result(v_order);
  end if;

  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(v_digits) not between 10 and 13 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'notes_too_long' using errcode = '22023';
  end if;
  if p_starts_at is null then
    raise exception 'slot_unavailable' using errcode = '55000';
  end if;
  v_product := app.booking_service(v_org.id, p_product_id);
  v_minutes := coalesce(v_product.duration_minutes, 60);

  -- Trava por empresa: limite de envios e conferência do horário sem corrida.
  perform pg_advisory_xact_lock(hashtextextended('public_order:' || v_org.id::text, 0));
  if (select count(*) from public.public_order_attempts a
      where a.organization_id = v_org.id and a.client_hash = p_client_hash and a.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.public_order_attempts a
      where a.organization_id = v_org.id and a.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  if not exists (select 1 from app.booking_free_slots(v_org.id, v_minutes, v_day) s where s = p_starts_at) then
    raise exception 'slot_unavailable' using errcode = '55000';
  end if;

  -- Cliente pelo telefone, com ou sem o código do país (igual ao link de encomenda).
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
    (organization_id, number, kind, status, customer_id, channel, scheduled_for, scheduled_minutes,
     notes, idempotency_key, created_by, updated_by)
  values
    (v_org.id, v_number, 'service_order', 'received', v_customer, 'link', p_starts_at, v_minutes,
     nullif(trim(p_notes), ''), p_idempotency_key, null, null)
  returning * into v_order;

  v_subtotal := app.write_order_items(v_org.id, v_order.id, jsonb_build_array(jsonb_build_object('product_id', v_product.id, 'quantity', 1)));
  update public.orders o
  set subtotal_cents = v_subtotal, total_cents = v_subtotal
  where o.id = v_order.id
  returning * into v_order;

  insert into public.order_status_history (organization_id, order_id, from_status, to_status, reason, changed_by)
  values (v_org.id, v_order.id, null, 'received', 'Agendado pelo site', null);

  insert into public.order_schedule_changes (organization_id, order_id, from_at, to_at, minutes, reason, changed_by)
  values (v_org.id, v_order.id, null, p_starts_at, v_minutes, 'Agendado pelo site', null);

  insert into public.public_order_attempts (organization_id, client_hash, order_id)
  values (v_org.id, p_client_hash, v_order.id);

  return app.booking_result(v_order);
exception
  when unique_violation then
    select * into v_order from public.orders o
    where o.organization_id = v_org.id and o.idempotency_key = p_idempotency_key;
    if found then
      return app.booking_result(v_order);
    end if;
    raise;
end;
$$;

create function app.booking_result(p_order public.orders)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', p_order.number,
    'total_cents', p_order.total_cents,
    'starts_at', p_order.scheduled_for,
    'label', to_char(p_order.scheduled_for at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    'service', (select i.description from public.order_items i where i.order_id = p_order.id order by i.position limit 1)
  );
$$;

revoke all on function app.booking_result(public.orders) from public;

revoke all on function public.public_booking_page(text) from public, anon, authenticated;
revoke all on function public.public_booking_slots(text, uuid, date) from public, anon, authenticated;
revoke all on function public.public_book_appointment(text, uuid, timestamptz, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.public_booking_page(text) to service_role;
grant execute on function public.public_booking_slots(text, uuid, date) to service_role;
grant execute on function public.public_book_appointment(text, uuid, timestamptz, text, text, uuid, text, text) to service_role;
