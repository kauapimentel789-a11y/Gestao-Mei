-- 0018 — O cliente remarca ou cancela pelo próprio link (plano Pro Max).
--
-- Ao agendar pelo site, o cliente recebe um link só dele (/horario/<código>).
-- Por ele vê o horário marcado, remarca para outro horário livre ou cancela,
-- até 2 horas antes. O código é aleatório (64 caracteres) e o banco guarda só
-- o hash dele em `booking_access`, uma tabela sem acesso para o app: quem
-- consulta é a Edge Function `encomenda`, com a service role.
--
-- Nada é apagado: remarcar grava em `order_schedule_changes` e cancelar muda o
-- status com motivo e histórico, como no app (autor vazio = o próprio cliente).
-- Atendimento com pagamento registrado não é cancelado pelo link.
--
-- Também: quando o telefone já é de um cliente cadastrado com outro nome, o
-- nome digitado vai para as observações ("Agendado como Maria").

create table public.booking_access (
  order_id uuid primary key references public.orders (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index booking_access_org_idx on public.booking_access (organization_id);

alter table public.booking_access enable row level security;
revoke all on public.booking_access from anon, authenticated;
-- Sem permissão para o app: só as funções do agendamento leem esta tabela.
create policy booking_access_select on public.booking_access
  for select to authenticated using (app.is_member(organization_id));

create function app.booking_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

revoke all on function app.booking_token_hash(text) from public;

-- Novo código para o atendimento (troca o anterior, se houver).
create function app.booking_issue_token(p_order public.orders)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into public.booking_access (order_id, organization_id, token_hash)
  values (p_order.id, p_order.organization_id, app.booking_token_hash(v_token))
  on conflict (order_id) do update set token_hash = excluded.token_hash, created_at = now();
  return v_token;
end;
$$;

revoke all on function app.booking_issue_token(public.orders) from public;

-- ---------------------------------------------------------------------------
-- Horários livres sem contar o próprio atendimento (para remarcar)
-- ---------------------------------------------------------------------------

create function app.booking_free_slots(p_org uuid, p_minutes integer, p_day date, p_ignore_order uuid)
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
        and o.id is distinct from p_ignore_order
        and o.scheduled_for is not null
        and o.status <> 'cancelled'
        and o.scheduled_for < s + make_interval(mins => p_minutes)
        and o.scheduled_for + make_interval(mins => coalesce(o.scheduled_minutes, 60)) > s)
  order by s;
$$;

revoke all on function app.booking_free_slots(uuid, integer, date, uuid) from public;

create or replace function app.booking_free_slots(p_org uuid, p_minutes integer, p_day date)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select app.booking_free_slots(p_org, p_minutes, p_day, null);
$$;

-- ---------------------------------------------------------------------------
-- Agendar: agora devolve o código do link e anota o nome digitado
-- ---------------------------------------------------------------------------

create or replace function public.public_book_appointment(
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
  v_customer_name text;
  v_notes text := nullif(trim(p_notes), '');
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
     notes, idempotency_key, created_by, updated_by)
  values
    (v_org.id, v_number, 'service_order', 'received', v_customer, 'link', p_starts_at, v_minutes,
     v_notes, p_idempotency_key, null, null)
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
-- Página do cliente: ver, remarcar e cancelar
-- ---------------------------------------------------------------------------

-- Atendimento do código, com a empresa ainda oferecendo o agendamento.
create function app.booking_by_token(p_token text, p_lock boolean default false)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_lock then
    select o.* into v_order from public.orders o
    join public.booking_access b on b.order_id = o.id
    where b.token_hash = app.booking_token_hash(p_token)
    for update of o;
  else
    select o.* into v_order from public.orders o
    join public.booking_access b on b.order_id = o.id
    where b.token_hash = app.booking_token_hash(p_token);
  end if;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Agendamento desligado ou plano vencido: o link também para.
  perform app.booking_org((select o.slug from public.organizations o where o.id = v_order.organization_id));
  return v_order;
end;
$$;

revoke all on function app.booking_by_token(text, boolean) from public;

-- Dá para mudar: não cancelado nem concluído, e faltando mais de 2 horas.
create function app.booking_changeable(p_order public.orders)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_order.status in ('received', 'confirmed')
     and p_order.scheduled_for is not null
     and p_order.scheduled_for > now() + interval '2 hours';
$$;

revoke all on function app.booking_changeable(public.orders) from public;

create function public.public_booking_manage(p_token text)
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

create function public.public_booking_manage_slots(p_token text, p_day date)
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
      from app.booking_free_slots(v_order.organization_id, coalesce(v_order.scheduled_minutes, 60), p_day, v_order.id) s
      where s <> v_order.scheduled_for), '[]'::jsonb)
  );
end;
$$;

-- Limite de mudanças por atendimento: 5 por dia, contra abuso do link.
create function app.booking_assert_change_limit(p_order public.orders)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.order_schedule_changes c
      where c.order_id = p_order.id and c.changed_by is null and c.from_at is not null
        and c.changed_at > now() - interval '1 day') >= 5 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
end;
$$;

revoke all on function app.booking_assert_change_limit(public.orders) from public;

create function public.public_booking_reschedule(p_token text, p_starts_at timestamptz)
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
  if not exists (select 1 from app.booking_free_slots(v_order.organization_id, v_minutes, v_day, v_order.id) s where s = p_starts_at) then
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

create function public.public_booking_cancel(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := app.booking_by_token(p_token, true);
  v_reason text := 'Cancelado pelo cliente pelo site';
begin
  if v_order.status = 'cancelled' then
    return public.public_booking_manage(p_token);
  end if;
  if not app.booking_changeable(v_order) then
    raise exception 'booking_locked' using errcode = '55000';
  end if;
  if v_order.stock_consumed_at is not null
     or exists (select 1 from public.financial_entries e where e.order_id = v_order.id and e.paid_cents <> 0) then
    raise exception 'order_has_payments' using errcode = '55000';
  end if;

  update public.orders o
  set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason, updated_by = null, updated_at = now()
  where o.id = v_order.id;

  insert into public.order_status_history (organization_id, order_id, from_status, to_status, reason, changed_by)
  values (v_order.organization_id, v_order.id, v_order.status, 'cancelled', v_reason, null);

  return public.public_booking_manage(p_token);
end;
$$;

revoke all on function public.public_book_appointment(text, uuid, timestamptz, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.public_booking_manage(text) from public, anon, authenticated;
revoke all on function public.public_booking_manage_slots(text, date) from public, anon, authenticated;
revoke all on function public.public_booking_reschedule(text, timestamptz) from public, anon, authenticated;
revoke all on function public.public_booking_cancel(text) from public, anon, authenticated;
grant execute on function public.public_book_appointment(text, uuid, timestamptz, text, text, uuid, text, text) to service_role;
grant execute on function public.public_booking_manage(text) to service_role;
grant execute on function public.public_booking_manage_slots(text, date) to service_role;
grant execute on function public.public_booking_reschedule(text, timestamptz) to service_role;
grant execute on function public.public_booking_cancel(text) to service_role;
