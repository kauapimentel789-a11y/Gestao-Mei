-- 0021 — Painel do dono do Gestão Fácil (administração da plataforma).
--
-- Regras:
-- * Quem administra a plataforma está em app.platform_admins, pelo hash
--   SHA-256 do e-mail em minúsculas (o repositório é público; o e-mail não
--   fica escrito aqui). Vale só para conta com e-mail confirmado.
-- * Ninguém do app entra nessa lista: authenticated não lê nem escreve a
--   tabela. Para incluir outra pessoa, no SQL Editor do Supabase:
--     select app.add_platform_admin('email@exemplo.com');
-- * O app só pergunta "sou administrador?" (is_platform_admin) e lê o painel
--   (admin_dashboard), que recusa qualquer outra pessoa com 42501. O painel
--   devolve só números e a lista de cadastros, nunca dados dos negócios
--   (clientes, valores, itens).

create table app.platform_admins (
  email_sha256 text primary key check (email_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

revoke all on app.platform_admins from public, anon, authenticated;

insert into app.platform_admins (email_sha256)
values ('98596f34956c16a26672c6cd2c006fcd5d0e154c53478b55fb418a0d2af906f4');

create function app.add_platform_admin(p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.platform_admins (email_sha256)
  values (encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex'))
  on conflict do nothing;
$$;

revoke all on function app.add_platform_admin(text) from public, anon, authenticated;

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join app.platform_admins a
      on a.email_sha256 = encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex')
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Painel
-- ---------------------------------------------------------------------------

-- p_days: 7, 30 ou 365. Até 30 dias a série é por dia; no ano, por mês.
-- Datas no fuso de Brasília.
create function public.admin_dashboard(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_from date;
  v_prev date;
  v_month boolean := p_days = 365;
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 365) then
    raise exception 'invalid_period' using errcode = '22023';
  end if;

  v_from := case when v_month then (date_trunc('month', v_today) - interval '11 months')::date else v_today - (p_days - 1) end;
  v_prev := v_from - (v_today - v_from + 1);

  with
  users as (
    select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
           (u.created_at at time zone 'America/Sao_Paulo')::date as day
    from auth.users u
  ),
  orgs as (
    select o.*, app.effective_plan(o.plan, o.plan_until) as eff_plan,
           (o.created_at at time zone 'America/Sao_Paulo')::date as day
    from public.organizations o
  ),
  -- Última movimentação de cada empresa: pedido, lançamento, cliente, item ou tarefa criados.
  activity as (
    select organization_id, max(created_at) as last_at
    from (
      select organization_id, created_at from public.orders
      union all select organization_id, created_at from public.financial_entries
      union all select organization_id, created_at from public.customers
      union all select organization_id, created_at from public.products
      union all select organization_id, created_at from public.tasks
    ) a
    group by organization_id
  ),
  buckets as (
    select b::date as bucket
    from generate_series(v_from, v_today, case when v_month then interval '1 month' else interval '1 day' end) b
  ),
  period_orders as (
    select o.organization_id, count(*) as n
    from public.orders o
    where (o.created_at at time zone 'America/Sao_Paulo')::date >= v_from
      and o.status <> 'cancelled'
    group by o.organization_id
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_today,
    'by_month', v_month,
    'users', jsonb_build_object(
      'total', (select count(*) from users),
      'new', (select count(*) from users where day >= v_from),
      'new_previous', (select count(*) from users where day >= v_prev and day < v_from),
      'unconfirmed', (select count(*) from users where email_confirmed_at is null),
      'without_company', (select count(*) from users u
        where not exists (select 1 from public.organization_members m where m.user_id = u.id)),
      'signed_in_7d', (select count(*) from users where last_sign_in_at >= now() - interval '7 days'),
      'signed_in_30d', (select count(*) from users where last_sign_in_at >= now() - interval '30 days')
    ),
    'organizations', jsonb_build_object(
      'total', (select count(*) from orgs),
      'new', (select count(*) from orgs where day >= v_from),
      'new_previous', (select count(*) from orgs where day >= v_prev and day < v_from),
      'active_7d', (select count(*) from activity where last_at >= now() - interval '7 days'),
      'active_30d', (select count(*) from activity where last_at >= now() - interval '30 days'),
      'never_used', (select count(*) from orgs o where not exists (select 1 from activity a where a.organization_id = o.id))
    ),
    'by_type', jsonb_build_object(
      'production', (select count(*) from orgs where business_type = 'production'),
      'resale', (select count(*) from orgs where business_type = 'resale'),
      'services', (select count(*) from orgs where business_type = 'services' and practice_area is null),
      'appointments', (select count(*) from orgs where business_type = 'services' and practice_area is not null)
    ),
    'by_plan', jsonb_build_object(
      'free', (select count(*) from orgs where eff_plan = 'free'),
      'pro', (select count(*) from orgs where eff_plan = 'pro'),
      'pro_max', (select count(*) from orgs where eff_plan = 'pro_max')
    ),
    'features', jsonb_build_object(
      'public_orders', (select count(*) from orgs where public_orders_enabled),
      'online_booking', (select count(*) from orgs where online_booking_enabled),
      'pix', (select count(*) from orgs where pix_key is not null)
    ),
    'usage', jsonb_build_object(
      'orders', (select coalesce(sum(n), 0) from period_orders),
      'customers', (select count(*) from public.customers c where (c.created_at at time zone 'America/Sao_Paulo')::date >= v_from),
      'financial_entries', (select count(*) from public.financial_entries f where (f.created_at at time zone 'America/Sao_Paulo')::date >= v_from),
      'tasks', (select count(*) from public.tasks t where (t.created_at at time zone 'America/Sao_Paulo')::date >= v_from)
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bucket', b.bucket,
        'users', (select count(*) from users u
          where u.day >= b.bucket and u.day < b.bucket + case when v_month then interval '1 month' else interval '1 day' end),
        'organizations', (select count(*) from orgs o
          where o.day >= b.bucket and o.day < b.bucket + case when v_month then interval '1 month' else interval '1 day' end)
      ) order by b.bucket), '[]'::jsonb)
      from buckets b
    ),
    'expiring', (
      select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'slug', o.slug, 'plan', o.plan, 'plan_until', o.plan_until)
        order by o.plan_until), '[]'::jsonb)
      from orgs o
      where o.plan <> 'free' and o.plan_until between v_today and v_today + 15
    ),
    'top_organizations', (
      select coalesce(jsonb_agg(x order by (x ->> 'orders')::int desc, x ->> 'name'), '[]'::jsonb)
      from (
        select jsonb_build_object('name', o.name, 'business_type', o.business_type, 'practice_area', o.practice_area,
                                  'plan', o.eff_plan, 'orders', p.n) as x
        from period_orders p
        join orgs o on o.id = p.organization_id
        order by p.n desc, o.name
        limit 10
      ) t
    ),
    'recent_signups', (
      select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'email', u.email,
          'name', pr.display_name,
          'created_at', u.created_at,
          'last_sign_in_at', u.last_sign_in_at,
          'confirmed', u.email_confirmed_at is not null,
          'organization', org.name,
          'business_type', org.business_type,
          'practice_area', org.practice_area,
          'plan', org.eff_plan
        ) as x
        from users u
        left join public.profiles pr on pr.id = u.id
        left join lateral (
          select o.name, o.business_type, o.practice_area, o.eff_plan
          from public.organization_members m
          join orgs o on o.id = m.organization_id
          where m.user_id = u.id
          order by m.created_at
          limit 1
        ) org on true
        order by u.created_at desc
        limit 30
      ) t
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard(integer) from public, anon;
grant execute on function public.admin_dashboard(integer) to authenticated;
