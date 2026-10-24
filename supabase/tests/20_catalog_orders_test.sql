-- Testes das migrações 0002 e 0003: clientes, itens e pedidos.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('ana',   test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
select test.logout();
select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_b', (public.create_organization('Bruno Reparos', 'services')).id;
select test.logout();

-- ================================================================ cadastros
select test.login_as((select v from ids where k='ana'));

insert into public.customers (organization_id, name, phone)
values ((select v from ids where k='org_a'), 'Maria Souza', '(11) 98234-1120')
returning id as id \gset cust_
insert into ids values ('cust_a', :'cust_id');
select test.assert((select phone_digits from public.customers where id = (select v from ids where k='cust_a')) = '11982341120', 'telefone normalizado em dígitos');
select test.assert((select created_by from public.customers where id = (select v from ids where k='cust_a')) = (select v from ids where k='ana'), 'created_by vem da sessão');

insert into public.products (organization_id, item_type, name, price_cents, cost_cents, unit)
values ((select v from ids where k='org_a'), 'finished', 'Vela aromática 200g', 4990, 1850, 'un')
returning id as id \gset prod_
insert into ids values ('prod_a', :'prod_id');
insert into public.products (organization_id, item_type, name, unit, cost_cents)
values ((select v from ids where k='org_a'), 'raw_material', 'Cera de soja', 'kg', 3800)
returning id as id \gset ins_
insert into ids values ('ins_a', :'ins_id');

select test.assert_fails(
  $$update public.products set stock_qty = 100 where id = (select v from ids where k='ins_a')$$,
  'saldo de estoque não é alterado direto pelo app', '42501');
select test.assert_fails(
  $$insert into public.products (organization_id, item_type, name, stock_qty) values ((select v from ids where k='org_a'), 'resale', 'X', 5)$$,
  'saldo inicial não é gravado direto pelo app', '42501');
select test.assert_fails(
  $$delete from public.customers where id = (select v from ids where k='cust_a')$$,
  'cliente não é apagado', '42501');
select test.assert_fails(
  $$insert into public.products (organization_id, item_type, name, unit) values ((select v from ids where k='org_a'), 'resale', 'Y', 'litros')$$,
  'unidade fora da lista é recusada', '23514');

insert into public.products (organization_id, item_type, name, price_cents)
values ((select v from ids where k='org_a'), 'service', 'Embalagem para presente', 500)
returning track_stock as svc_track \gset
select test.assert(not :'svc_track'::boolean, 'serviço nunca controla estoque');

insert into public.product_categories (organization_id, name) values ((select v from ids where k='org_a'), 'Velas') returning id as cat_id \gset
insert into ids values ('cat_a', :'cat_id');
select test.assert_fails(
  $$insert into public.product_categories (organization_id, name) values ((select v from ids where k='org_a'), ' velas ')$$,
  'categoria repetida (ignorando maiúsculas) é recusada', '23505');

select test.assert_fails(
  $$insert into public.customers (organization_id, name) values ((select v from ids where k='org_b'), 'Intruso')$$,
  'não cadastra cliente em empresa alheia', '42501');
select test.logout();

-- ================================================================ pedidos
select test.login_as((select v from ids where k='ana'));

select (public.create_order(
  (select v from ids where k='org_a'),
  jsonb_build_array(
    jsonb_build_object('product_id', (select v from ids where k='prod_a'), 'quantity', 2),
    jsonb_build_object('description', 'Cartão personalizado', 'quantity', 1, 'unit_price_cents', 800)
  ),
  '11111111-1111-1111-1111-111111111111',
  p_customer_id => (select v from ids where k='cust_a'),
  p_channel => 'whatsapp',
  p_discount_cents => 280,
  p_due_at => now() + interval '1 day'
)).* \gset o1_

insert into ids values ('o1', :'o1_id');
select test.assert(:'o1_number'::int = 1, 'primeiro pedido da empresa é o nº 1');
select test.assert(:'o1_subtotal_cents'::bigint = 2 * 4990 + 800, 'subtotal calculado no banco');
select test.assert(:'o1_total_cents'::bigint = 2 * 4990 + 800 - 280, 'total = subtotal - desconto');
select test.assert(:'o1_status' = 'received', 'pedido começa como Recebido');
select test.assert((select count(*) from public.order_items where order_id = :'o1_id') = 2, 'itens gravados');
select test.assert((select description from public.order_items where order_id = :'o1_id' and position = 0) = 'Vela aromática 200g', 'descrição copiada do cadastro');
select test.assert((select count(*) from public.order_status_history where order_id = :'o1_id') = 1, 'histórico registra a criação');

-- Idempotência
select test.assert((public.create_order(
  (select v from ids where k='org_a'),
  '[{"description":"outro","quantity":1,"unit_price_cents":1}]'::jsonb,
  '11111111-1111-1111-1111-111111111111')).id = :'o1_id', 'mesma chave devolve o mesmo pedido');
select test.assert((select count(*) from public.orders where organization_id = (select v from ids where k='org_a')) = 1, 'reenvio não duplica o pedido');

select (public.create_order((select v from ids where k='org_a'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='prod_a'), 'quantity', 0.5)),
  gen_random_uuid())).number as n2 \gset
select test.assert(:'n2'::int = 2, 'número sequencial por empresa');
select test.assert((select line_total_cents from public.order_items i join public.orders o on o.id = i.order_id where o.number = 2 and o.organization_id = (select v from ids where k='org_a')) = 2495, 'quantidade fracionada calcula sem float');

-- Preço histórico
update public.products set price_cents = 5990 where id = (select v from ids where k='prod_a');
select test.assert((select unit_price_cents from public.order_items where order_id = :'o1_id' and position = 0) = 4990, 'mudar o preço do produto não altera pedidos antigos');

-- Validações
select test.assert_fails($$select public.create_order((select v from ids where k='org_a'), '[]', gen_random_uuid())$$, 'pedido sem itens é recusado', '22023');
select test.assert_fails($$select public.create_order((select v from ids where k='org_a'), '[{"description":"x","quantity":1}]', gen_random_uuid())$$, 'item avulso sem preço é recusado', '22023');
select test.assert_fails($$select public.create_order((select v from ids where k='org_a'), '[{"description":"x","quantity":-1,"unit_price_cents":10}]', gen_random_uuid())$$, 'quantidade negativa é recusada', '22023');
select test.assert_fails($$select public.create_order((select v from ids where k='org_a'), '[{"description":"x","quantity":1,"unit_price_cents":100}]', gen_random_uuid(), p_discount_cents => 101)$$, 'desconto maior que o subtotal é recusado', '22023');
select test.assert_fails($$select public.create_order((select v from ids where k='org_a'), '[{"description":"x","quantity":1,"unit_price_cents":100}]', null)$$, 'chave de idempotência é obrigatória', '22023');
select test.assert_fails($$select public.create_order((select v from ids where k='org_a'), '[{"description":"x","quantity":1,"unit_price_cents":100}]', gen_random_uuid(), p_kind => 'service_order')$$, 'OS só para empresa de serviços', '42501');
select test.assert_fails($$insert into public.orders (organization_id, number, created_by, updated_by) values ((select v from ids where k='org_a'), 99, auth.uid(), auth.uid())$$, 'insert direto em orders é bloqueado', '42501');
select test.assert_fails($$update public.orders set total_cents = 1 where id = (select v from ids where k='org_a')$$, 'update direto em orders é bloqueado', '42501');

-- Status
select test.assert((public.set_order_status(:'o1_id', 'in_progress')).status = 'in_progress', 'Recebido → Em andamento');
select test.assert((public.set_order_status(:'o1_id', 'in_progress')).status = 'in_progress', 'repetir o mesmo status não falha');
select test.assert((select count(*) from public.order_status_history where order_id = :'o1_id') = 2, 'repetição não gera histórico duplicado');
select test.assert_fails($$select public.set_order_status((select v from ids where k='o1'), 'received')$$, 'não volta para Recebido', '55000');
select test.assert((public.set_order_status(:'o1_id', 'completed')).status = 'completed', 'Em andamento → Concluído');
select test.assert_fails($$select public.update_order((select v from ids where k='o1'), '[{"description":"x","quantity":1,"unit_price_cents":1}]')$$, 'pedido concluído não é editado', '55000');
select test.assert((public.set_order_status(:'o1_id', 'in_progress')).status = 'in_progress', 'Concluído pode ser reaberto');
select test.assert((public.set_order_status(:'o1_id', 'delivered')).status = 'delivered', 'avança direto para Entregue');
select test.assert_fails($$select public.set_order_status((select v from ids where k='o1'), 'cancelled', 'desistiu')$$, 'Entregue é final', '55000');

select (public.create_order((select v from ids where k='org_a'), '[{"description":"x","quantity":1,"unit_price_cents":100}]', gen_random_uuid())).id as o3 \gset
insert into ids values ('o3', :'o3');
select test.assert_fails($$select public.set_order_status((select v from ids where k='o3'), 'cancelled')$$, 'cancelar exige motivo', '22023');
select test.assert((public.set_order_status(:'o3', 'cancelled', 'Cliente desistiu')).status = 'cancelled', 'cancela com motivo');
select test.assert((select cancel_reason from public.orders where id = :'o3') = 'Cliente desistiu', 'motivo do cancelamento fica registrado');
select test.assert((select count(*) from public.orders where id = :'o3') = 1, 'pedido cancelado não é apagado');

-- Edição
select (public.create_order((select v from ids where k='org_a'), '[{"description":"x","quantity":1,"unit_price_cents":100}]', gen_random_uuid())).id as o4 \gset
insert into ids values ('o4', :'o4');
select test.assert((public.update_order(:'o4', jsonb_build_array(jsonb_build_object('description','y','quantity',3,'unit_price_cents',250)), p_discount_cents => 50)).total_cents = 700, 'edição recalcula o total');
select test.assert((select count(*) from public.order_items where order_id = :'o4') = 1, 'edição substitui os itens');

-- Lista
select test.assert((select items_summary from public.order_summaries where id = :'o1_id') = '2× Vela aromática 200g, 1× Cartão personalizado', 'resumo dos itens na lista');
select test.assert((select customer_name from public.order_summaries where id = :'o1_id') = 'Maria Souza', 'nome do cliente na lista');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(test.row_count('select * from public.customers') = 0, 'Bruno não vê clientes da Ana');
select test.assert(test.row_count('select * from public.products') = 0, 'Bruno não vê itens da Ana');
select test.assert(test.row_count('select * from public.orders') = 0, 'Bruno não vê pedidos da Ana');
select test.assert(test.row_count('select * from public.order_items') = 0, 'Bruno não vê itens de pedido da Ana');
select test.assert(test.row_count('select * from public.order_summaries') = 0, 'Bruno não vê a lista de pedidos da Ana');
select test.assert(test.row_count('select * from public.order_status_history') = 0, 'Bruno não vê o histórico da Ana');
select test.assert(test.affected($$update public.customers set name = 'X' where id = (select v from ids where k='cust_a')$$) = 0, 'Bruno não altera cliente da Ana');
select test.assert(test.affected($$update public.products set price_cents = 1 where id = (select v from ids where k='prod_a')$$) = 0, 'Bruno não altera item da Ana');
select test.assert_fails($$select public.create_order((select v from ids where k='org_a'), '[{"description":"x","quantity":1,"unit_price_cents":1}]', gen_random_uuid())$$, 'Bruno não cria pedido na empresa da Ana', 'P0002');
select test.assert_fails($$select public.set_order_status((select v from ids where k='o4'), 'cancelled', 'invasão')$$, 'Bruno não muda status de pedido da Ana', 'P0002');
select test.assert_fails($$select public.update_order((select v from ids where k='o4'), '[{"description":"x","quantity":1,"unit_price_cents":1}]')$$, 'Bruno não edita pedido da Ana', 'P0002');
select test.assert_fails(
  $$select public.create_order((select v from ids where k='org_b'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='prod_a'), 'quantity', 1)), gen_random_uuid())$$,
  'pedido não usa item de outra empresa', 'P0002');
select test.assert_fails(
  $$select public.create_order((select v from ids where k='org_b'), '[{"description":"x","quantity":1,"unit_price_cents":1}]', gen_random_uuid(), p_customer_id => (select v from ids where k='cust_a'))$$,
  'pedido não usa cliente de outra empresa', 'P0002');
select test.assert_fails(
  $$insert into public.products (organization_id, item_type, name, category_id) values ((select v from ids where k='org_b'), 'resale', 'X', (select v from ids where k='cat_a'))$$,
  'categoria de outra empresa não pode ser usada (FK composta)', '23503');

select (public.create_order((select v from ids where k='org_b'), '[{"description":"Troca de tomada","quantity":1,"unit_price_cents":8000}]', gen_random_uuid(), p_kind => 'service_order', p_problem_description => 'Tomada queimada')).number as nb \gset
select test.assert(:'nb'::int = 1, 'numeração é independente por empresa');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.orders', 'anon não lê pedidos', '42501');
select test.assert_fails('select * from public.customers', 'anon não lê clientes', '42501');
select test.assert_fails($$select public.create_order(gen_random_uuid(), '[]', gen_random_uuid())$$, 'anon não cria pedido', '42501');
select test.logout();

rollback;
