-- 0019 — Profissionais: quem atende (barbeiro, dentista, manicure...).
--
-- * O dono ou admin cadastra os profissionais (só o nome). Nada é apagado:
--   quem sai é desativado e some das escolhas, mas continua nos atendimentos.
-- * Cada atendimento pode ter um profissional (orders.professional_id).
-- * Na página de agendamento, o cliente escolhe com quem quer ser atendido ou
--   "sem preferência"; aí o sistema escolhe o primeiro livre no horário.
-- * Horário livre: com profissionais cadastrados, um atendimento ocupa só o
--   horário do profissional dele. Atendimento sem profissional ocupa o horário
--   de todos (é o que vale hoje, antes de alguém ser escolhido). Sem
--   profissional cadastrado nada muda.

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id)
);
create unique index professionals_org_name_idx on public.professionals (organization_id, lower(name)) where active;
create index professionals_org_idx on public.professionals (organization_id, active, lower(name));

alter table public.professionals enable row level security;
revoke all on public.professionals from anon, authenticated;
grant select on public.professionals to authenticated;
create policy professionals_select on public.professionals
  for select to authenticated using (app.is_member(organization_id));

alter table public.orders add column professional_id uuid;
alter table public.orders
  add constraint orders_professional_fk foreign key (organization_id, professional_id)
  references public.professionals (organization_id, id);
create index orders_professional_idx on public.orders (organization_id, professional_id, scheduled_for)
  where professional_id is not null;

-- Cria (p_id vazio) ou atualiza nome e situação. Dono ou admin.
create function public.save_professional(p_organization_id uuid, p_id uuid, p_name text, p_active boolean default true)
returns public.professionals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_row public.professionals;
begin
  if not app.has_role(p_organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'invalid_professional_name' using errcode = '22023';
  end if;
  if exists (select 1 from public.professionals p
             where p.organization_id = p_organization_id and p.active and coalesce(p_active, true)
               and lower(p.name) = lower(v_name) and p.id is distinct from p_id) then
    raise exception 'professional_exists' using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.professionals (organization_id, name, active, created_by)
    values (p_organization_id, v_name, coalesce(p_active, true), v_user)
    returning * into v_row;
  else
    update public.professionals p
    set name = v_name, active = coalesce(p_active, p.active)
    where p.id = p_id and p.organization_id = p_organization_id
    returning * into v_row;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_row;
end;
$$;

-- Escolhe (ou tira) o profissional de um atendimento. Qualquer membro.
create function public.set_order_professional(p_order_id uuid, p_professional_id uuid)
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
  if v_order.kind <> 'service_order' then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'order_closed' using errcode = '55000';
  end if;
  if v_order.professional_id is not distinct from p_professional_id then
    return v_order;
  end if;
  if p_professional_id is not null and not exists (
    select 1 from public.professionals p
    where p.id = p_professional_id and p.organization_id = v_order.organization_id and p.active) then
    raise exception 'professional_not_found' using errcode = 'P0002';
  end if;

  update public.orders o
  set professional_id = p_professional_id, updated_by = v_user, updated_at = now()
  where o.id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;

revoke all on function public.save_professional(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.set_order_professional(uuid, uuid) from public, anon;
grant execute on function public.save_professional(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.set_order_professional(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Horários livres por profissional
-- ---------------------------------------------------------------------------

-- Horário [p_at, p_at + p_minutes) ocupado para o profissional (vazio = sem
-- profissional cadastrado: qualquer atendimento ocupa).
create function app.booking_busy(p_org uuid, p_at timestamptz, p_minutes integer, p_ignore_order uuid, p_professional uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.organization_id = p_org
      and o.id is distinct from p_ignore_order
      and o.scheduled_for is not null
      and o.status <> 'cancelled'
      and o.scheduled_for < p_at + make_interval(mins => p_minutes)
      and o.scheduled_for + make_interval(mins => coalesce(o.scheduled_minutes, 60)) > p_at
      and (p_professional is null or o.professional_id is null or o.professional_id = p_professional));
$$;

revoke all on function app.booking_busy(uuid, timestamptz, integer, uuid, uuid) from public;

-- Primeiro profissional ativo livre no horário (por nome); vazio se ninguém
-- estiver livre ou se a empresa não tiver profissionais.
create function app.booking_pick_professional(p_org uuid, p_at timestamptz, p_minutes integer, p_ignore_order uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.professionals p
  where p.organization_id = p_org and p.active
    and not app.booking_busy(p_org, p_at, p_minutes, p_ignore_order, p.id)
  order by lower(p.name), p.id
  limit 1;
$$;

revoke all on function app.booking_pick_professional(uuid, timestamptz, integer, uuid) from public;

create function app.booking_free_slots(p_org uuid, p_minutes integer, p_day date, p_ignore_order uuid, p_professional uuid)
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
    and case
      when p_professional is not null then not app.booking_busy(p_org, s, p_minutes, p_ignore_order, p_professional)
      when exists (select 1 from public.professionals p where p.organization_id = p_org and p.active)
        then app.booking_pick_professional(p_org, s, p_minutes, p_ignore_order) is not null
      else not app.booking_busy(p_org, s, p_minutes, p_ignore_order, null)
    end
  order by s;
$$;

revoke all on function app.booking_free_slots(uuid, integer, date, uuid, uuid) from public;

create or replace function app.booking_free_slots(p_org uuid, p_minutes integer, p_day date, p_ignore_order uuid)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select app.booking_free_slots(p_org, p_minutes, p_day, p_ignore_order, null);
$$;

-- Profissional ativo da empresa; vazio passa direto.
create function app.booking_professional(p_org uuid, p_professional uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_professional is null then
    return null;
  end if;
  if not exists (select 1 from public.professionals p
                 where p.id = p_professional and p.organization_id = p_org and p.active) then
    raise exception 'professional_not_found' using errcode = 'P0002';
  end if;
  return p_professional;
end;
$$;

revoke all on function app.booking_professional(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Página pública com profissionais
-- ---------------------------------------------------------------------------

create or replace function public.public_booking_page(p_slug text)
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
    'practice_area', v_org.practice_area,
    'tagline', v_org.public_tagline,
    'about', v_org.public_about,
    'whatsapp', v_org.public_whatsapp,
    'address', v_org.public_address,
    'instagram', v_org.public_instagram,
    'today', v_today,
    'last_day', v_today + 60,
    'weekdays', coalesce((
      select jsonb_agg(distinct h.weekday) from public.business_hours h where h.organization_id = v_org.id), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', h.weekday, 'opens_at', to_char(h.opens_at, 'HH24:MI'), 'closes_at', to_char(h.closes_at, 'HH24:MI')
      ) order by h.weekday, h.opens_at)
      from public.business_hours h where h.organization_id = v_org.id), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description,
        'price_cents', p.price_cents, 'duration_minutes', coalesce(p.duration_minutes, 60)
      ) order by lower(p.name))
      from public.products p
      where p.organization_id = v_org.id and p.active and p.item_type = 'service' and p.price_cents > 0), '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by lower(p.name))
      from public.professionals p
      where p.organization_id = v_org.id and p.active), '[]'::jsonb)
  );
end;
$$;

drop function public.public_booking_slots(text, uuid, date);
create function public.public_booking_slots(p_slug text, p_product_id uuid, p_day date, p_professional_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations := app.booking_org(p_slug);
  v_product public.products := app.booking_service(v_org.id, p_product_id);
  v_professional uuid := app.booking_professional(v_org.id, p_professional_id);
begin
  return jsonb_build_object(
    'day', p_day,
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', s, 'label', to_char(s at time zone 'America/Sao_Paulo', 'HH24:MI')) order by s)
      from app.booking_free_slots(v_org.id, coalesce(v_product.duration_minutes, 60), p_day, null, v_professional) s), '[]'::jsonb)
  );
end;
$$;

create or replace function app.booking_result(p_order public.orders)
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
    'service', (select i.description from public.order_items i where i.order_id = p_order.id order by i.position limit 1),
    'professional', (select p.name from public.professionals p where p.id = p_order.professional_id)
  );
$$;

drop function public.public_book_appointment(text, uuid, timestamptz, text, text, uuid, text, text);
create function public.public_book_appointment(
  p_slug text,
  p_product_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_phone text,
  p_idempotency_key uuid,
  p_client_hash text,
  p_notes text default null,
  p_professional_id uuid default null
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
  v_customer_name text;
  v_notes text := nullif(trim(p_notes), '');
  v_number integer;
  v_subtotal bigint;
  v_day date := (p_starts_at at time zone 'America/Sao_Paulo')::date;
  v_professional uuid;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if p_client_hash is null or char_length(p_client_hash) not between 16 and 128 then
    raise exception 'invalid_client' using errcode = '22023';
  end if;

  -- Reenvio do mesmo formulário: devolve o agendamento já criado, com um
  -- código novo (a primeira resposta não chegou ao cliente).
  select * into v_order from public.orders o
  where o.organization_id = v_org.id and o.idempotency_key = p_idempotency_key;
  if found then
    return app.booking_result(v_order) || jsonb_build_object('manage_token', app.booking_issue_token(v_order));
  end if;

  if char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(v_digits) not between 10 and 13 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'notes_too_long' using errcode = '22023';
  end if;
  if p_starts_at is null then
    raise exception 'slot_unavailable' using errcode = '55000';
  end if;
  v_product := app.booking_service(v_org.id, p_product_id);
  v_minutes := coalesce(v_product.duration_minutes, 60);
  v_professional := app.booking_professional(v_org.id, p_professional_id);

  -- Trava por empresa: limite de envios e conferência do horário sem corrida.
  perform pg_advisory_xact_lock(hashtextextended('public_order:' || v_org.id::text, 0));
  if (select count(*) from public.public_order_attempts a
      where a.organization_id = v_org.id and a.client_hash = p_client_hash and a.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.public_order_attempts a
      where a.organization_id = v_org.id and a.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  if not exists (select 1 from app.booking_free_slots(v_org.id, v_minutes, v_day, null, v_professional) s where s = p_starts_at) then
    raise exception 'slot_unavailable' using errcode = '55000';
  end if;
  -- Sem preferência: fica com o primeiro profissional livre (se houver).
  if v_professional is null then
    v_professional := app.booking_pick_professional(v_org.id, p_starts_at, v_minutes, null);
  end if;

  -- Cliente pelo telefone, com ou sem o código do país (igual ao link de encomenda).
  v_local := case when char_length(v_digits) >= 12 and v_digits like '55%' then substr(v_digits, 3) else v_digits end;
  select c.id, c.name into v_customer, v_customer_name from public.customers c
  where c.organization_id = v_org.id and c.phone_digits in (v_local, '55' || v_local)
  order by c.created_at
  limit 1;
  if v_customer is null then
    insert into public.customers (organization_id, name, phone, created_by)
    values (v_org.id, v_name, left(trim(p_phone), 30), null)
    returning id into v_customer;
  elsif lower(v_customer_name) <> lower(v_name) then
    -- Mesmo telefone, outro nome (um familiar, por exemplo): fica anotado.
    v_notes := left(concat_ws(E'\n', 'Agendado como ' || v_name, v_notes), 1200);
  end if;

  insert into public.order_counters as oc (organization_id, last_number)
  values (v_org.id, 1)
  on conflict (organization_id) do update set last_number = oc.last_number + 1
  returning last_number into v_number;

  insert into public.orders
    (organization_id, number, kind, status, customer_id, channel, scheduled_for, scheduled_minutes,
     notes, idempotency_key, created_by, updated_by, professional_id)
  values
    (v_org.id, v_number, 'service_order', 'received', v_customer, 'link', p_starts_at, v_minutes,
     v_notes, p_idempotency_key, null, null, v_professional)
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

  return app.booking_result(v_order) || jsonb_build_object('manage_token', app.booking_issue_token(v_order));
exception
  when unique_violation then
    select * into v_order from public.orders o
    where o.organization_id = v_org.id and o.idempotency_key = p_idempotency_key;
    if found then
      return app.booking_result(v_order) || jsonb_build_object('manage_token', app.booking_issue_token(v_order));
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- Link do cliente: mostra o profissional e remarca na agenda dele
-- ---------------------------------------------------------------------------

create or replace function public.public_booking_manage(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders := app.booking_by_token(p_token);
  v_org public.organizations;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_org from public.organizations o where o.id = v_order.organization_id;
  return jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_org.name,
      'slug', v_org.slug,
      'practice_area', v_org.practice_area,
      'whatsapp', v_org.public_whatsapp,
      'address', v_org.public_address),
    'number', v_order.number,
    'service', (select i.description from public.order_items i where i.order_id = v_order.id order by i.position limit 1),
    'professional', (select p.name from public.professionals p where p.id = v_order.professional_id),
    'total_cents', v_order.total_cents,
    'starts_at', v_order.scheduled_for,
    'minutes', coalesce(v_order.scheduled_minutes, 60),
    'label', to_char(v_order.scheduled_for at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    'status', case
      when v_order.status = 'cancelled' then 'cancelled'
      when v_order.status in ('completed', 'delivered') or coalesce(v_order.scheduled_for <= now(), true) then 'past'
      else 'active' end,
    'can_change', app.booking_changeable(v_order),
    'today', v_today,
    'last_day', v_today + 60,
    'weekdays', coalesce((
      select jsonb_agg(distinct h.weekday) from public.business_hours h where h.organization_id = v_org.id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.public_booking_manage_slots(p_token text, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders := app.booking_by_token(p_token);
begin
  if not app.booking_changeable(v_order) then
    raise exception 'booking_locked' using errcode = '55000';
  end if;
  return jsonb_build_object(
    'day', p_day,
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', s, 'label', to_char(s at time zone 'America/Sao_Paulo', 'HH24:MI')) order by s)
      from app.booking_free_slots(v_order.organization_id, coalesce(v_order.scheduled_minutes, 60), p_day, v_order.id, v_order.professional_id) s
      where s <> v_order.scheduled_for), '[]'::jsonb)
  );
end;
$$;

create or replace function public.public_booking_reschedule(p_token text, p_starts_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := app.booking_by_token(p_token, true);
  v_minutes integer := coalesce(v_order.scheduled_minutes, 60);
  v_day date := (p_starts_at at time zone 'America/Sao_Paulo')::date;
begin
  if not app.booking_changeable(v_order) then
    raise exception 'booking_locked' using errcode = '55000';
  end if;
  if p_starts_at is null then
    raise exception 'slot_unavailable' using errcode = '55000';
  end if;
  -- Mesmo horário (toque duplo): nada muda.
  if p_starts_at = v_order.scheduled_for then
    return public.public_booking_manage(p_token);
  end if;
  perform app.booking_assert_change_limit(v_order);

  -- Mesma trava do agendamento: ninguém pega o horário ao mesmo tempo.
  perform pg_advisory_xact_lock(hashtextextended('public_order:' || v_order.organization_id::text, 0));
  if not exists (select 1 from app.booking_free_slots(v_order.organization_id, v_minutes, v_day, v_order.id, v_order.professional_id) s
                 where s = p_starts_at) then
    raise exception 'slot_unavailable' using errcode = '55000';
  end if;

  insert into public.order_schedule_changes (organization_id, order_id, from_at, to_at, minutes, reason, changed_by)
  values (v_order.organization_id, v_order.id, v_order.scheduled_for, p_starts_at, v_minutes, 'Remarcado pelo cliente pelo site', null);

  update public.orders o
  set scheduled_for = p_starts_at, updated_by = null, updated_at = now()
  where o.id = v_order.id;

  return public.public_booking_manage(p_token);
end;
$$;

revoke all on function public.public_booking_slots(text, uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.public_book_appointment(text, uuid, timestamptz, text, text, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.public_booking_slots(text, uuid, date, uuid) to service_role;
grant execute on function public.public_book_appointment(text, uuid, timestamptz, text, text, uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Lista da agenda com o profissional
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
  c.phone_digits as customer_phone_digits,
  o.professional_id,
  pr.name as professional_name
from public.orders o
left join public.customers c on c.id = o.customer_id
left join public.professionals pr on pr.id = o.professional_id;
