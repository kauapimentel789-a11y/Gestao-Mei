-- Testes da migração 0012: relatórios.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('ana',   test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_b', (public.create_organization('Bruno Reparos', 'services')).id;
select test.logout();

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
insert into ids select 'caixa', id from public.financial_accounts where organization_id = (select v from ids where k='org_a');
insert into ids select 'vendas', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Vendas';
insert into ids select 'aluguel', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Aluguel';
insert into ids select 'mp', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and nature = 'inventory_purchase';

-- Setembro: venda 1.000,00 (recebida em outubro); aluguel 300,00 pago em setembro; compra de estoque 200,00.
select from public.create_financial_entry((select v from ids where k='org_a'), 'receivable', 'Encomenda', 100000, (select v from ids where k='vendas'),
  '2026-10-05', gen_random_uuid(), p_competence_date => '2026-09-20', p_paid_account_id => (select v from ids where k='caixa'), p_paid_method => 'pix', p_paid_on => '2026-10-05');
select from public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'Aluguel set', 30000, (select v from ids where k='aluguel'),
  '2026-09-10', gen_random_uuid(), p_competence_date => '2026-09-01', p_paid_account_id => (select v from ids where k='caixa'), p_paid_method => 'pix', p_paid_on => '2026-09-10');
select from public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'Cera', 20000, (select v from ids where k='mp'),
  '2026-09-15', gen_random_uuid(), p_competence_date => '2026-09-15');
insert into ids select 'canc', (public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'Errado', 99900, (select v from ids where k='aluguel'),
  '2026-09-15', gen_random_uuid(), p_competence_date => '2026-09-15')).id;
select from public.cancel_financial_entry((select v from ids where k='canc'), 'Lançado errado');

-- Pedidos de hoje: 2 bolos + item avulso; um pedido cancelado não conta.
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_a'), 'finished', 'Bolo', 9000) returning id)
insert into ids select 'bolo', id from x;
select from public.create_order((select v from ids where k='org_a'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 2),
                    jsonb_build_object('description', 'Topo', 'quantity', 1, 'unit_price_cents', 2500)), gen_random_uuid());
select from public.create_order((select v from ids where k='org_a'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 1),
                    jsonb_build_object('description', ' topo ', 'quantity', 1, 'unit_price_cents', 3000)), gen_random_uuid());
insert into ids select 'oc', (public.create_order((select v from ids where k='org_a'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 10)), gen_random_uuid())).id;
select from public.set_order_status((select v from ids where k='oc'), 'cancelled', 'Desistiu');

select public.finance_report((select v from ids where k='org_a'), '2026-09-01', '2026-10-31') as r \gset
select test.assert(((:'r'::jsonb) -> 'revenue_by_category' -> 0 ->> 'total_cents')::bigint = 100000, 'receita por categoria pela competência');
select test.assert(jsonb_array_length((:'r'::jsonb) -> 'expense_by_category') = 2, 'despesas agrupadas por categoria, sem cancelados');
select test.assert(((:'r'::jsonb) -> 'expense_by_category' -> 0 ->> 'name') = 'Aluguel' and ((:'r'::jsonb) -> 'expense_by_category' -> 0 ->> 'total_cents')::bigint = 30000,
  'maior despesa primeiro');
select test.assert(((:'r'::jsonb) -> 'expense_by_category' -> 1 ->> 'nature') = 'inventory_purchase', 'natureza vai junto para separar compra de estoque');
select test.assert(jsonb_array_length((:'r'::jsonb) -> 'monthly') = 2, 'dois meses no período');
select test.assert(((:'r'::jsonb) -> 'monthly' -> 0 ->> 'revenue_cents')::bigint = 100000 and ((:'r'::jsonb) -> 'monthly' -> 0 ->> 'cash_in_cents')::bigint = 0,
  'setembro: faturou, não recebeu');
select test.assert(((:'r'::jsonb) -> 'monthly' -> 0 ->> 'expense_cents')::bigint = 30000, 'setembro: despesa sem a compra de estoque');
select test.assert(((:'r'::jsonb) -> 'monthly' -> 0 ->> 'cash_out_cents')::bigint = 30000, 'setembro: saída de caixa');
select test.assert(((:'r'::jsonb) -> 'monthly' -> 1 ->> 'cash_in_cents')::bigint = 100000, 'outubro: recebimento');

select public.finance_report((select v from ids where k='org_a'), (now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date) as s \gset
select test.assert(((:'s'::jsonb) -> 'sales_by_item' -> 0 ->> 'name') = 'Bolo' and ((:'s'::jsonb) -> 'sales_by_item' -> 0 ->> 'quantity')::numeric = 3,
  'vendas por produto somam pedidos não cancelados');
select test.assert(((:'s'::jsonb) -> 'sales_by_item' -> 0 ->> 'orders')::int = 2, 'conta em quantos pedidos apareceu');
select test.assert(((:'s'::jsonb) -> 'sales_by_item' -> 1 ->> 'total_cents')::bigint = 5500, 'itens avulsos com a mesma descrição se juntam');
select test.assert_fails($$select public.finance_report((select v from ids where k='org_a'), '2026-10-01', '2026-09-01')$$, 'período invertido recusado', '22023');
select test.logout();

select test.login_as((select v from ids where k='bruno'));
select test.assert_fails($$select public.finance_report((select v from ids where k='org_a'), '2026-09-01', '2026-10-31')$$, 'não lê relatório alheio', 'P0002');
select test.logout();

select test.login_anon();
select test.assert_fails($$select public.finance_report((select v from ids where k='org_a'), '2026-09-01', '2026-10-31')$$, 'anon não lê relatório', '42501');
select test.logout();

rollback;
