-- Testes da migração 0011: orçamentos.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('ana',   test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_b', (public.create_organization('Bruno Reparos', 'services')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_b'), 'service', 'Instalação', 15000) returning id)
insert into ids select 'inst', id from x;
select test.logout();

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents, unit) values ((select v from ids where k='org_a'), 'finished', 'Bolo', 9000, 'un') returning id)
insert into ids select 'bolo', id from x;
with x as (insert into public.customers (organization_id, name) values ((select v from ids where k='org_a'), 'Joana') returning id)
insert into ids select 'joana', id from x;

-- ================================================================ criar
select public.create_quote((select v from ids where k='org_a'),
  jsonb_build_array(
    jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 2),
    jsonb_build_object('description', 'Topo personalizado', 'quantity', 1, 'unit_price_cents', 2500)),
  'bbbbbbbb-0000-0000-0000-000000000001', p_customer_id => (select v from ids where k='joana'), p_valid_until => '2026-11-30', p_discount_cents => 500) as q1 \gset
insert into ids select 'q1', (:'q1'::public.quotes).id;
select test.assert((:'q1'::public.quotes).number = 1, 'orçamento nº 1');
select test.assert((:'q1'::public.quotes).total_cents = 18000 + 2500 - 500, 'total calculado no banco');
select test.assert((:'q1'::public.quotes).status = 'draft', 'nasce rascunho');
select test.assert((public.create_quote((select v from ids where k='org_a'), '[]', 'bbbbbbbb-0000-0000-0000-000000000001')).id = (select v from ids where k='q1'),
  'mesma chave devolve o mesmo orçamento');
select test.assert((select items_summary || ' | ' || customer_name from public.quote_summaries where id = (select v from ids where k='q1')) = '2× Bolo, 1× Topo personalizado | Joana',
  'resumo com itens e cliente');
select test.assert_fails($$select public.create_quote((select v from ids where k='org_a'), '[]', gen_random_uuid())$$, 'sem itens recusado', '22023');
select test.assert_fails($$select public.create_quote((select v from ids where k='org_a'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 1)), gen_random_uuid(), p_discount_cents => 99999)$$,
  'desconto maior que o subtotal recusado', '22023');
select test.assert(not exists (select 1 from public.inventory_movements), 'orçamento não mexe no estoque');
select test.assert(not exists (select 1 from public.financial_entries), 'orçamento não gera financeiro');
select test.assert(not exists (select 1 from public.orders), 'orçamento não é pedido');

-- Preço do orçamento fica gravado mesmo se o produto mudar de preço.
update public.products set price_cents = 12000 where id = (select v from ids where k='bolo');
select test.assert((select unit_price_cents from public.quote_items where quote_id = (select v from ids where k='q1') and position = 0) = 9000, 'preço histórico preservado');

-- ================================================================ editar e status
select from public.update_quote((select v from ids where k='q1'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 3, 'unit_price_cents', 9000)),
  (select v from ids where k='joana'), '2026-12-15', 'Entrega no salão', 0);
select test.assert((select total_cents from public.quotes where id = (select v from ids where k='q1')) = 27000, 'edição recalcula o total');
select from public.set_quote_status((select v from ids where k='q1'), 'sent');
select from public.set_quote_status((select v from ids where k='q1'), 'sent');
select test.assert((select count(*) from public.quote_status_history where quote_id = (select v from ids where k='q1')) = 2, 'mesmo status não duplica o histórico');
select test.assert_fails($$select public.set_quote_status((select v from ids where k='q1'), 'rejected')$$, 'recusar exige motivo', '22023');

-- ================================================================ converter
select public.convert_quote_to_order((select v from ids where k='q1'), '2026-12-20 10:00-03') as o1 \gset
insert into ids select 'o1', (:'o1'::public.orders).id;
select test.assert((select status from public.quotes where id = (select v from ids where k='q1')) = 'approved', 'converter aprova o orçamento');
select test.assert((select order_id from public.quotes where id = (select v from ids where k='q1')) = (select v from ids where k='o1'), 'orçamento aponta para o pedido');
select test.assert((:'o1'::public.orders).kind = 'order' and (:'o1'::public.orders).total_cents = 27000, 'pedido com o total do orçamento');
select test.assert((select unit_price_cents from public.order_items where order_id = (select v from ids where k='o1')) = 9000, 'pedido usa o preço do orçamento, não o atual');
select test.assert((:'o1'::public.orders).customer_id = (select v from ids where k='joana'), 'pedido com o cliente do orçamento');
select test.assert((:'o1'::public.orders).notes like 'Do orçamento #1%', 'pedido registra a origem');
select test.assert((public.convert_quote_to_order((select v from ids where k='q1'))).id = (select v from ids where k='o1'), 'converter de novo devolve o mesmo pedido');
select test.assert((select count(*) from public.orders) = 1, 'não duplica o pedido');
select test.assert_fails($$select public.update_quote((select v from ids where k='q1'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 1)))$$,
  'aprovado não é editado', '55000');
select test.assert_fails($$select public.set_quote_status((select v from ids where k='q1'), 'cancelled', 'Mudou de ideia')$$, 'aprovado não volta', '55000');

insert into ids select 'q2', (public.create_quote((select v from ids where k='org_a'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 1)), gen_random_uuid())).id;
select from public.set_quote_status((select v from ids where k='q2'), 'rejected', 'Achou caro');
select test.assert_fails($$select public.convert_quote_to_order((select v from ids where k='q2'))$$, 'recusado não vira pedido', '55000');
select test.assert((select number from public.quotes where id = (select v from ids where k='q2')) = 2, 'numeração sequencial');
select test.assert_fails($$insert into public.quotes (organization_id, number, created_by, updated_by) values ((select v from ids where k='org_a'), 99, auth.uid(), auth.uid())$$, 'insert direto bloqueado', '42501');
select test.assert_fails($$delete from public.quotes where id = (select v from ids where k='q2')$$, 'orçamento não é apagado', '42501');
select test.logout();

-- Serviços viram ordem de serviço.
select test.login_as((select v from ids where k='bruno'));
insert into ids select 'qb', (public.create_quote((select v from ids where k='org_b'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='inst'), 'quantity', 1)), gen_random_uuid())).id;
select test.assert((public.convert_quote_to_order((select v from ids where k='qb'))).kind = 'service_order', 'em serviços o orçamento vira OS');

-- ================================================================ isolamento
select test.assert(test.row_count('select * from public.quotes') = 1, 'só vê os próprios orçamentos');
select test.assert(test.row_count($$select * from public.quote_items where quote_id = (select v from ids where k='q1')$$) = 0, 'não vê itens alheios');
select test.assert_fails($$select public.convert_quote_to_order((select v from ids where k='q2'))$$, 'não converte orçamento alheio', 'P0002');
select test.assert_fails($$select public.create_quote((select v from ids where k='org_b'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 1)), gen_random_uuid())$$,
  'não usa produto alheio', 'P0002');
select test.assert_fails($$select public.create_quote((select v from ids where k='org_b'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='inst'), 'quantity', 1)), gen_random_uuid(), p_customer_id => (select v from ids where k='joana'))$$,
  'não usa cliente alheio', 'P0002');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.quotes', 'anon não lê orçamentos', '42501');
select test.logout();

rollback;
