-- 0026 — Minhas finanças: espaço pessoal na mesma conta.
--
-- O app junta a gestão da empresa (PJ) e das finanças pessoais (PF). O espaço
-- pessoal é uma linha de organizations com kind = 'personal', assim reaproveita
-- tudo o que já existe e é testado: membros e RLS (app.is_member), contas,
-- categorias, títulos, baixas, transferências, saldos e resumos do financeiro.
--
-- Regras:
-- * Cada pessoa tem no máximo um espaço pessoal criado por ela, criado pela
--   RPC create_personal_space (idempotente).
-- * Espaço pessoal não tem tipo de negócio, área de atendimento, link de
--   encomenda nem agendamento online (garantido por check).
-- * Categorias e contas padrão de pessoa física no lugar das da empresa.
-- * O painel do dono conta só empresas; espaços pessoais aparecem à parte.
-- * Na exclusão de conta, descrições e observações dos lançamentos pessoais
--   são anonimizadas (não há obrigação fiscal de guardá-las).

create type public.organization_kind as enum ('business', 'personal');

alter table public.organizations
  add column kind public.organization_kind not null default 'business';

alter table public.organizations alter column business_type drop not null;

alter table public.organizations
  drop constraint organizations_main_type_enabled,
  add constraint organizations_main_type_enabled check (business_type is null or business_type = any (enabled_modules)),
  add constraint organizations_kind_type check ((kind = 'business') = (business_type is not null)),
  add constraint organizations_personal_private check (
    kind = 'business' or (practice_area is null and not public_orders_enabled and not online_booking_enabled)
  );

create unique index organizations_one_personal_uq on public.organizations (created_by) where kind = 'personal';

-- ---------------------------------------------------------------------------
-- Dados padrão do espaço pessoal
-- ---------------------------------------------------------------------------

create function app.seed_personal_finance(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.financial_accounts (organization_id, name, kind, created_by)
  select p_org, a.name, a.kind::public.financial_account_kind, null
  from (values ('Carteira', 'cash'), ('Conta do banco', 'bank')) as a (name, kind)
  where not exists (select 1 from public.financial_accounts x where x.organization_id = p_org);

  insert into public.financial_categories (organization_id, name, direction, nature)
  select p_org, c.name, c.direction::public.financial_direction, c.nature::public.category_nature
  from (values
    ('Salário', 'receivable', 'other_revenue'),
    ('Pró-labore', 'receivable', 'other_revenue'),
    ('Renda extra', 'receivable', 'other_revenue'),
    ('Rendimentos', 'receivable', 'other_revenue'),
    ('Outras entradas', 'receivable', 'other_revenue'),
    ('Moradia', 'payable', 'operating_expense'),
    ('Mercado', 'payable', 'operating_expense'),
    ('Contas da casa', 'payable', 'operating_expense'),
    ('Transporte', 'payable', 'operating_expense'),
    ('Saúde', 'payable', 'operating_expense'),
    ('Educação', 'payable', 'operating_expense'),
    ('Lazer', 'payable', 'operating_expense'),
    ('Restaurantes e delivery', 'payable', 'operating_expense'),
    ('Assinaturas', 'payable', 'operating_expense'),
    ('Roupas e cuidados', 'payable', 'operating_expense'),
    ('Pets', 'payable', 'operating_expense'),
    ('Impostos e taxas', 'payable', 'tax'),
    ('Investimentos e reserva', 'payable', 'investment'),
    ('Outros gastos', 'payable', 'operating_expense')
  ) as c (name, direction, nature)
  on conflict do nothing;
end;
$$;
revoke all on function app.seed_personal_finance(uuid) from public;

create or replace function app.organizations_seed_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'personal' then
    perform app.seed_personal_finance(new.id);
  else
    perform app.seed_finance(new.id, new.business_type);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: abrir (ou devolver) o espaço pessoal de quem está logado
-- ---------------------------------------------------------------------------

create function public.create_personal_space()
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org public.organizations;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Trava por pessoa: duas chamadas ao mesmo tempo devolvem o mesmo espaço.
  perform pg_advisory_xact_lock(hashtextextended('personal_space:' || v_user::text, 0));

  select o.* into v_org from public.organizations o
  where o.created_by = v_user and o.kind = 'personal';
  if found then
    if not exists (select 1 from public.organization_members m where m.organization_id = v_org.id and m.user_id = v_user) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    return v_org;
  end if;

  insert into public.organizations (name, slug, kind, business_type, enabled_modules, created_by)
  values ('Minhas finanças', 'pessoal-' || replace(gen_random_uuid()::text, '-', ''), 'personal', null, '{}', v_user)
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, v_user, 'owner');

  return v_org;
end;
$$;

revoke all on function public.create_personal_space() from public, anon;
grant execute on function public.create_personal_space() to authenticated;

-- ---------------------------------------------------------------------------
-- Painel do dono: só empresas contam como empresas
-- ---------------------------------------------------------------------------

create or replace function public.admin_dashboard(p_days integer)
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
    where o.kind = 'business'
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
        where not exists (select 1 from public.organization_members m
          join public.organizations o on o.id = m.organization_id and o.kind = 'business'
          where m.user_id = u.id)),
      'with_personal', (select count(*) from public.organizations o where o.kind = 'personal'),
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

-- ---------------------------------------------------------------------------
-- Exclusão de conta: lançamentos pessoais sem descrição nem observações
-- ---------------------------------------------------------------------------

create or replace function public.close_user_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_closed integer := 0;
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  for v_org in
    select m.organization_id
    from public.organization_members m
    where m.user_id = p_user_id
      and not exists (
        select 1 from public.organization_members o
        where o.organization_id = m.organization_id and o.user_id <> p_user_id)
  loop
    -- Trava a empresa: nada de pedido pelo link no meio da exclusão.
    perform 1 from public.organizations o where o.id = v_org for update;

    update public.organizations set
      name = 'Empresa excluída',
      slug = 'excluida-' || replace(v_org::text, '-', ''),
      public_orders_enabled = false,
      online_booking_enabled = false,
      pix_key_type = null, pix_key = null, pix_name = null, pix_city = null,
      public_tagline = null, public_about = null, public_whatsapp = null,
      public_address = null, public_instagram = null,
      closed_at = coalesce(closed_at, now())
    where id = v_org;

    update public.customers set
      name = 'Cliente removido', phone = null, document = null, address = null, notes = null,
      birth_day = null, birth_month = null, birth_year = null
    where organization_id = v_org;

    update public.suppliers set
      name = 'Fornecedor removido', document = null, phone = null, email = null, notes = null,
      contact_name = null, address = null
    where organization_id = v_org;

    update public.orders set notes = null, problem_description = null, delivery_address = null
    where organization_id = v_org
      and (notes is not null or problem_description is not null or delivery_address is not null);

    update public.quotes set notes = null where organization_id = v_org and notes is not null;

    update public.service_notes set body = '[removido]' where organization_id = v_org;

    delete from public.booking_access where organization_id = v_org;

    -- Finanças pessoais: sem obrigação fiscal, o texto livre sai.
    if exists (select 1 from public.organizations o where o.id = v_org and o.kind = 'personal') then
      update public.financial_entries set description = 'Lançamento removido', notes = null where organization_id = v_org;
      update public.financial_payments set notes = null where organization_id = v_org and notes is not null;
      update public.financial_transfers set description = null where organization_id = v_org and description is not null;
    end if;

    v_closed := v_closed + 1;
  end loop;

  update public.profiles set display_name = 'Conta excluída' where id = p_user_id;
  update auth.users set raw_user_meta_data = '{}'::jsonb where id = p_user_id;

  return jsonb_build_object('closed_organizations', v_closed);
end;
$$;
