-- Testes da migração 0009: faturamento do MEI.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('ana',   test.create_user('ana@example.com', 'Ana')),
  ('carla', test.create_user('carla@example.com', 'Carla')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_b', (public.create_organization('Bruno Reparos', 'services')).id;
select test.logout();

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
insert into ids select 'caixa', id from public.financial_accounts where organization_id = (select v from ids where k='org_a');
insert into ids select 'vendas', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Vendas';
insert into ids select 'outras', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Outras receitas';
select test.logout();
insert into public.organization_members (organization_id, user_id, role) values ((select v from ids where k='org_a'), (select v from ids where k='carla'), 'member');

select test.login_as((select v from ids where k='ana'));

-- ================================================================ limite
select test.assert((public.mei_revenue_year((select v from ids where k='org_a'), 2026)) -> 'limit' = 'null'::jsonb, 'sem limite cadastrado o limite é nulo');
insert into ids select 'lim1', (public.set_revenue_limit((select v from ids where k='org_a'), 8100000, '2018-01-01', 'Valor informado pela usuária')).id;
insert into ids select 'lim2', (public.set_revenue_limit((select v from ids where k='org_a'), 13000000, '2027-01-01')).id;
select test.assert((select valid_to from public.revenue_limits where id = (select v from ids where k='lim1')) = '2026-12-31', 'novo limite encerra o anterior na véspera');
select test.assert(((public.mei_revenue_year((select v from ids where k='org_a'), 2026)) -> 'limit' ->> 'annual_limit_cents')::bigint = 8100000, '2026 usa o limite vigente em 2026');
select test.assert(((public.mei_revenue_year((select v from ids where k='org_a'), 2027)) -> 'limit' ->> 'annual_limit_cents')::bigint = 13000000, '2027 usa o novo limite');
select test.assert_fails($$select public.set_revenue_limit((select v from ids where k='org_a'), 9000000, '2026-06-01')$$, 'não reescreve o passado com limite novo existente', '55000');
select test.assert_fails($$select public.set_revenue_limit((select v from ids where k='org_a'), 9000000, '2027-01-01')$$, 'mesma data recusada', '55000');
select test.assert_fails($$select public.set_revenue_limit((select v from ids where k='org_a'), 0, '2028-01-01')$$, 'limite zero recusado', '22023');
select test.assert_fails($$insert into public.revenue_limits (organization_id, annual_limit_cents, valid_from, created_by) values ((select v from ids where k='org_a'), 1, '2030-01-01', auth.uid())$$,
  'insert direto bloqueado', '42501');
select test.assert(test.row_count('select * from public.revenue_limits') = 2, 'histórico de limites preservado');

-- ================================================================ faturamento
-- Março: venda de 500,00 recebida em abril; outra receita de 50,00. Maio: venda de 300,00 sem recebimento.
insert into ids select 'e1', (public.create_financial_entry((select v from ids where k='org_a'), 'receivable', 'Encomenda casamento', 50000,
  (select v from ids where k='vendas'), '2026-04-10', gen_random_uuid(), p_competence_date => '2026-03-15')).id;
select from public.settle_financial_entry((select v from ids where k='e1'), 50000, (select v from ids where k='caixa'), 'pix', '2026-04-10', gen_random_uuid());
select from public.create_financial_entry((select v from ids where k='org_a'), 'receivable', 'Rendimento', 5000,
  (select v from ids where k='outras'), '2026-03-20', gen_random_uuid(), p_competence_date => '2026-03-20');
select from public.create_financial_entry((select v from ids where k='org_a'), 'receivable', 'Feira', 30000,
  (select v from ids where k='vendas'), '2026-05-30', gen_random_uuid(), p_competence_date => '2026-05-02');
insert into ids select 'e4', (public.create_financial_entry((select v from ids where k='org_a'), 'receivable', 'Cancelada', 99900,
  (select v from ids where k='vendas'), '2026-05-30', gen_random_uuid(), p_competence_date => '2026-05-03')).id;
select from public.cancel_financial_entry((select v from ids where k='e4'), 'Lançada errada');
select from public.create_financial_entry((select v from ids where k='org_a'), 'receivable', 'Ano passado', 70000,
  (select v from ids where k='vendas'), '2025-12-30', gen_random_uuid(), p_competence_date => '2025-12-30');

select public.mei_revenue_year((select v from ids where k='org_a'), 2026) as r \gset
select test.assert(((:'r'::jsonb) -> 'months' -> 2 ->> 'revenue_cents')::bigint = 50000, 'março: faturamento pela competência');
select test.assert(((:'r'::jsonb) -> 'months' -> 2 ->> 'received_cents')::bigint = 0, 'março: nada recebido');
select test.assert(((:'r'::jsonb) -> 'months' -> 3 ->> 'received_cents')::bigint = 50000, 'abril: recebimento no mês em que entrou');
select test.assert(((:'r'::jsonb) -> 'months' -> 2 ->> 'other_revenue_cents')::bigint = 5000, 'outras receitas separadas');
select test.assert(((:'r'::jsonb) -> 'months' -> 4 ->> 'revenue_cents')::bigint = 30000, 'maio: conta a venda não recebida e ignora a cancelada');
select test.assert((select sum((m ->> 'revenue_cents')::bigint) from jsonb_array_elements((:'r'::jsonb) -> 'months') m) = 80000, 'acumulado do ano ignora outro ano');
select test.assert(jsonb_array_length((:'r'::jsonb) -> 'months') = 12, '12 meses');
select test.assert(jsonb_array_length((:'r'::jsonb) -> 'other_revenue_entries') = 1, 'outra receita aparece para conferir');

-- Pedido concluído sem recebimento lançado fica fora e aparece para conferir.
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_a'), 'finished', 'Bolo', 12000) returning id)
insert into ids select 'bolo', id from x;
insert into ids select 'o1', (public.create_order((select v from ids where k='org_a'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 1)), gen_random_uuid())).id;
select from public.set_order_status((select v from ids where k='o1'), 'completed');
select public.mei_revenue_year((select v from ids where k='org_a'), extract(year from now() at time zone 'America/Sao_Paulo')::int) as r2 \gset
select test.assert(((:'r2'::jsonb) ->> 'unbilled_orders_cents')::bigint = 12000, 'pedido concluído sem título entra no valor a conferir');
select test.assert(((:'r2'::jsonb) -> 'unbilled_orders' -> 0 ->> 'number')::int = 1, 'lista o pedido a conferir');
select from public.receive_order_payment((select v from ids where k='o1'), 12000, (select v from ids where k='caixa'), 'cash', current_date, gen_random_uuid());
select public.mei_revenue_year((select v from ids where k='org_a'), extract(year from now() at time zone 'America/Sao_Paulo')::int) as r3 \gset
select test.assert(((:'r3'::jsonb) ->> 'unbilled_orders_cents')::bigint = 0, 'depois do recebimento o pedido sai da conferência');
select test.assert_fails($$select public.mei_revenue_year((select v from ids where k='org_a'), 1990)$$, 'ano inválido', '22023');
select test.logout();

-- Membro comum vê, mas não muda o limite.
select test.login_as((select v from ids where k='carla'));
select test.assert(public.mei_revenue_year((select v from ids where k='org_a'), 2026) is not null, 'membro vê o acompanhamento');
select test.assert_fails($$select public.set_revenue_limit((select v from ids where k='org_a'), 9000000, '2029-01-01')$$, 'membro não muda o limite', '42501');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(test.row_count('select * from public.revenue_limits') = 0, 'outra empresa não vê limites');
select test.assert_fails($$select public.mei_revenue_year((select v from ids where k='org_a'), 2026)$$, 'não lê faturamento alheio', 'P0002');
select test.assert_fails($$select public.set_revenue_limit((select v from ids where k='org_a'), 1, '2029-01-01')$$, 'não muda limite alheio', 'P0002');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.revenue_limits', 'anon não lê limites', '42501');
select test.logout();

rollback;
