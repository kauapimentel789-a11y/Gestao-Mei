-- 0009 — Acompanhamento do faturamento do MEI (PROMPT 7.9).
--
-- Regras:
-- * Faturamento considerado = títulos a receber não cancelados com categoria
--   de natureza "vendas e serviços" (operating_revenue), pela data de
--   competência. "Outras receitas" ficam fora e aparecem para conferência.
--   Recebimentos (caixa) são mostrados ao lado, nunca no lugar.
-- * Pedidos entregues ou concluídos que ainda não têm título (nunca tiveram
--   recebimento lançado) não entram no faturamento e aparecem para conferir.
-- * O limite anual não fica no código: cada empresa registra o valor e a data
--   de início da validade. Um novo valor encerra o anterior; o histórico fica.
-- * É acompanhamento gerencial; não substitui a apuração oficial.

create table public.revenue_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  annual_limit_cents bigint not null check (annual_limit_cents > 0 and annual_limit_cents <= 100000000000),
  valid_from date not null,
  valid_to date,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, valid_from),
  constraint revenue_limits_range check (valid_to is null or valid_to >= valid_from)
);
create index revenue_limits_org_idx on public.revenue_limits (organization_id, valid_from desc);

-- Registra um novo limite a partir de uma data. O limite em vigor antes dela
-- passa a valer até a véspera; limites com início posterior são recusados
-- (para não reescrever o passado sem querer).
create function public.set_revenue_limit(
  p_organization_id uuid,
  p_annual_limit_cents bigint,
  p_valid_from date,
  p_note text default null
)
returns public.revenue_limits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_row public.revenue_limits;
begin
  if not app.has_role(p_organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_annual_limit_cents is null or p_annual_limit_cents <= 0 or p_annual_limit_cents > 100000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_valid_from is null then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  perform 1 from public.organizations o where o.id = p_organization_id for update;
  if exists (select 1 from public.revenue_limits l where l.organization_id = p_organization_id and l.valid_from > p_valid_from) then
    raise exception 'limit_newer_exists' using errcode = '55000';
  end if;
  if exists (select 1 from public.revenue_limits l where l.organization_id = p_organization_id and l.valid_from = p_valid_from) then
    raise exception 'limit_same_date' using errcode = '55000';
  end if;

  update public.revenue_limits l
  set valid_to = p_valid_from - 1
  where l.organization_id = p_organization_id and l.valid_to is null;

  insert into public.revenue_limits (organization_id, annual_limit_cents, valid_from, note, created_by)
  values (p_organization_id, p_annual_limit_cents, p_valid_from, left(nullif(trim(p_note), ''), 300), v_user)
  returning * into v_row;
  return v_row;
end;
$$;

-- Resumo do ano: faturamento e recebimentos por mês, limite aplicável e
-- itens para conferir.
create function public.mei_revenue_year(p_organization_id uuid, p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from date;
  v_to date;
  v_result jsonb;
begin
  perform app.assert_member(p_organization_id);
  if p_year is null or p_year not between 2000 and 2100 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  v_from := make_date(p_year, 1, 1);
  v_to := make_date(p_year, 12, 31);

  with months as (
    select generate_series(1, 12) as m
  ),
  comp as (
    select extract(month from e.competence_date)::int as m, c.nature, e.amount_cents
    from public.financial_entries e
    join public.financial_categories c on c.id = e.category_id
    where e.organization_id = p_organization_id and e.direction = 'receivable' and e.cancelled_at is null
      and e.competence_date between v_from and v_to
  ),
  rec as (
    select extract(month from p.paid_on)::int as m, p.amount_cents
    from public.financial_payments p
    join public.financial_entries e on e.id = p.entry_id
    join public.financial_categories c on c.id = e.category_id
    where p.organization_id = p_organization_id and e.direction = 'receivable' and c.nature = 'operating_revenue'
      and p.paid_on between v_from and v_to
  ),
  lim as (
    select l.* from public.revenue_limits l
    where l.organization_id = p_organization_id and l.valid_from <= v_to and (l.valid_to is null or l.valid_to >= v_from)
    order by l.valid_from desc
    limit 1
  ),
  other as (
    select e.id, e.description, e.amount_cents, e.competence_date
    from public.financial_entries e
    join public.financial_categories c on c.id = e.category_id
    where e.organization_id = p_organization_id and e.direction = 'receivable' and e.cancelled_at is null
      and c.nature = 'other_revenue' and e.competence_date between v_from and v_to
    order by e.competence_date desc
    limit 50
  ),
  unbilled as (
    select o.id, o.number, o.kind, o.total_cents, (o.created_at at time zone 'America/Sao_Paulo')::date as order_date
    from public.orders o
    where o.organization_id = p_organization_id and o.status in ('completed', 'delivered') and o.total_cents > 0
      and (o.created_at at time zone 'America/Sao_Paulo')::date between v_from and v_to
      and not exists (select 1 from public.financial_entries e where e.order_id = o.id)
    order by o.created_at desc
    limit 50
  )
  select jsonb_build_object(
    'year', p_year,
    'months', (
      select jsonb_agg(jsonb_build_object(
        'month', months.m,
        'revenue_cents', coalesce((select sum(amount_cents) from comp where comp.m = months.m and nature = 'operating_revenue'), 0),
        'other_revenue_cents', coalesce((select sum(amount_cents) from comp where comp.m = months.m and nature = 'other_revenue'), 0),
        'received_cents', coalesce((select sum(amount_cents) from rec where rec.m = months.m), 0)
      ) order by months.m)
      from months
    ),
    'limit', (select to_jsonb(lim) - 'organization_id' - 'created_by' from lim),
    'other_revenue_entries', coalesce((select jsonb_agg(to_jsonb(other)) from other), '[]'::jsonb),
    'unbilled_orders', coalesce((select jsonb_agg(to_jsonb(unbilled)) from unbilled), '[]'::jsonb),
    'unbilled_orders_cents', coalesce((
      select sum(o.total_cents) from public.orders o
      where o.organization_id = p_organization_id and o.status in ('completed', 'delivered')
        and (o.created_at at time zone 'America/Sao_Paulo')::date between v_from and v_to
        and not exists (select 1 from public.financial_entries e where e.order_id = o.id)
    ), 0)
  ) into v_result;
  return v_result;
end;
$$;

alter table public.revenue_limits enable row level security;
revoke all on public.revenue_limits from anon, authenticated;
grant select on public.revenue_limits to authenticated;
create policy revenue_limits_select on public.revenue_limits
  for select to authenticated using (app.is_member(organization_id));

revoke all on function public.set_revenue_limit(uuid, bigint, date, text) from public, anon;
revoke all on function public.mei_revenue_year(uuid, integer) from public, anon;
grant execute on function public.set_revenue_limit(uuid, bigint, date, text) to authenticated;
grant execute on function public.mei_revenue_year(uuid, integer) to authenticated;
