-- 0012 — Relatórios básicos (PROMPT 7.8).
--
-- Um RPC só leitura devolve, para o período informado:
-- * receitas e despesas por categoria, pela data de competência, sem
--   cancelados (inclui a natureza, para separar o que entra no resultado);
-- * vendas por produto ou serviço: itens de pedidos não cancelados, pela data
--   do pedido (fuso de Brasília), agrupados por produto ou descrição avulsa;
-- * evolução mês a mês: faturamento e despesas por competência, entradas e
--   saídas de caixa pela data da baixa.
-- A tela de relatórios explica esses critérios ao usuário.

create function public.finance_report(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform app.assert_member(p_organization_id);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 731 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;

  with entries as (
    select e.direction, e.amount_cents, e.competence_date, c.id as category_id, c.name as category_name, c.nature
    from public.financial_entries e
    join public.financial_categories c on c.id = e.category_id
    where e.organization_id = p_organization_id and e.cancelled_at is null
      and e.competence_date between p_from and p_to
  ),
  by_category as (
    select direction, category_id, category_name, nature, sum(amount_cents)::bigint as total_cents, count(*)::int as entries
    from entries
    group by direction, category_id, category_name, nature
  ),
  sales as (
    select
      coalesce(i.product_id::text, 'avulso:' || lower(trim(i.description))) as key,
      (array_agg(i.product_id))[1] as product_id,
      min(coalesce(p.name, trim(i.description))) as name,
      min(coalesce(p.item_type::text, 'custom')) as item_type,
      min(i.unit) as unit,
      sum(i.quantity) as quantity,
      sum(i.line_total_cents)::bigint as total_cents,
      count(distinct o.id)::int as orders
    from public.order_items i
    join public.orders o on o.id = i.order_id
    left join public.products p on p.id = i.product_id
    where o.organization_id = p_organization_id and o.status <> 'cancelled'
      and (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
    group by 1
  ),
  months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as m
  ),
  cash as (
    select date_trunc('month', p.paid_on)::date as m, e.direction, sum(p.amount_cents)::bigint as total_cents
    from public.financial_payments p
    join public.financial_entries e on e.id = p.entry_id
    where p.organization_id = p_organization_id and p.paid_on between p_from and p_to
    group by 1, 2
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'revenue_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', category_id, 'name', category_name, 'nature', nature, 'total_cents', total_cents, 'entries', entries)
        order by total_cents desc)
      from by_category where direction = 'receivable'), '[]'::jsonb),
    'expense_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', category_id, 'name', category_name, 'nature', nature, 'total_cents', total_cents, 'entries', entries)
        order by total_cents desc)
      from by_category where direction = 'payable'), '[]'::jsonb),
    'sales_by_item', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'product_id', product_id, 'name', name, 'item_type', item_type, 'unit', unit,
        'quantity', quantity, 'total_cents', total_cents, 'orders', orders) order by total_cents desc)
      from (select * from sales order by total_cents desc limit 100) s), '[]'::jsonb),
    'monthly', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(months.m, 'YYYY-MM'),
        'revenue_cents', coalesce((select sum(amount_cents) from entries where nature = 'operating_revenue' and date_trunc('month', competence_date) = months.m), 0),
        'expense_cents', coalesce((select sum(amount_cents) from entries where nature in ('operating_expense', 'tax') and date_trunc('month', competence_date) = months.m), 0),
        'cash_in_cents', coalesce((select total_cents from cash where cash.m = months.m and direction = 'receivable'), 0),
        'cash_out_cents', coalesce((select total_cents from cash where cash.m = months.m and direction = 'payable'), 0)
      ) order by months.m)
      from months)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.finance_report(uuid, date, date) from public, anon;
grant execute on function public.finance_report(uuid, date, date) to authenticated;
