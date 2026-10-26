-- Testes da migração 0023: venda por quilo e taxa de entrega por bairro.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

insert into ids values
  ('ana', test.create_user('ana@example.com', 'Ana')),
  ('eva', test.create_user('eva@example.com', 'Eva'));

select test.login_as((select v from ids where k='eva'));
insert into ids select 'org_e', (public.create_organization('Eva Doces', 'production', 'eva-doces')).id;
insert into ids select 'zona_e', (public.save_delivery_zone((select v from ids where k='org_e'), null, 'Centro', 300)).id;
select test.logout();

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org', (public.create_organization('Assadão da Ana', 'production', 'assadao-da-ana')).id;
with x as (insert into public.products (organization_id, item_type, name, unit, price_cents, track_stock)
  values ((select v from ids where k='org'), 'finished', 'Picanha assada', 'kg', 5990, true) returning id)
insert into ids select 'picanha', id from x;
with x as (insert into public.products (organization_id, item_type, name, price_cents, track_stock)
  values ((select v from ids where k='org'), 'finished', 'Farofa', 800, false) returning id)
insert into ids select 'farofa', id from x;
select from public.inventory_move((select v from ids where k='picanha'), 'manual_in', 10, gen_random_uuid(), 'Assado do dia');

-- ================================================================ bairros
insert into ids select 'centro', (public.save_delivery_zone((select v from ids where k='org'), null, '  Centro ', 500)).id;
insert into ids select 'vila', (public.save_delivery_zone((select v from ids where k='org'), null, 'Vila Nova', 800)).id;
select test.assert((select name = 'Centro' and fee_cents = 500 and active from public.delivery_zones where id = (select v from ids where k='centro')),
  'bairro cadastrado com o nome limpo');
select test.assert_fails($$select public.save_delivery_zone((select v from ids where k='org'), null, 'centro', 100)$$,
  'bairro ativo repetido recusado', '23505');
select test.assert_fails($$select public.save_delivery_zone((select v from ids where k='org'), null, 'X', 100)$$,
  'nome curto recusado', '22023');
select test.assert_fails($$select public.save_delivery_zone((select v from ids where k='org'), null, 'Longe', -1)$$,
  'taxa negativa recusada', '22023');
select test.assert_fails($$insert into public.delivery_zones (organization_id, name, fee_cents) values ((select v from ids where k='org'), 'Direto', 1)$$,
  'app não grava bairro direto', '42501');
select test.assert((select count(*) from public.delivery_zones) = 2, 'só lê os bairros da própria empresa');
select test.assert_fails($$select public.save_delivery_zone((select v from ids where k='org'), (select v from ids where k='zona_e'), 'Meu', 1)$$,
  'não altera bairro de outra empresa', 'P0002');

-- ================================================================ pedido por peso com entrega
insert into ids select 'o1', (public.create_order((select v from ids where k='org'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='picanha'), 'quantity', 1.25),
                    jsonb_build_object('product_id', (select v from ids where k='farofa'), 'quantity', 2)),
  gen_random_uuid(), p_discount_cents => 100,
  p_delivery_zone_id => (select v from ids where k='centro'), p_delivery_address => ' Rua A, 10 ')).id;
select test.assert((select subtotal_cents = 7488 + 1600 and delivery_fee_cents = 500 and total_cents = 9088 - 100 + 500
  and delivery_area = 'Centro' and delivery_address = 'Rua A, 10' from public.orders where id = (select v from ids where k='o1')),
  '1,25 kg × 59,90 = 74,88; total = itens − desconto + entrega');
select test.assert((select unit = 'kg' and quantity = 1.25 from public.order_items where order_id = (select v from ids where k='o1') and position = 0),
  'item gravado em kg');
select test.assert((select amount_cents from public.financial_entries where order_id = (select v from ids where k='o1')) is null,
  'sem recebimento ainda, sem título');

select test.assert((public.create_order((select v from ids where k='org'), '[{"description":"Marmita","quantity":1,"unit_price_cents":2000}]',
  gen_random_uuid(), p_delivery_fee_cents => 700)).total_cents = 2700, 'taxa avulsa sem bairro');
select test.assert((public.create_order((select v from ids where k='org'), '[{"description":"Marmita","quantity":1,"unit_price_cents":2000}]',
  gen_random_uuid(), p_delivery_zone_id => (select v from ids where k='vila'), p_delivery_fee_cents => 0)).total_cents = 2000,
  'taxa do bairro pode ser dispensada');
select test.assert_fails($$select public.create_order((select v from ids where k='org'), '[{"description":"x","quantity":1,"unit_price_cents":100}]',
  gen_random_uuid(), p_delivery_zone_id => (select v from ids where k='zona_e'))$$, 'bairro de outra empresa recusado', 'P0002');
select test.assert_fails($$select public.create_order((select v from ids where k='org'), '[{"description":"x","quantity":1,"unit_price_cents":100}]',
  gen_random_uuid(), p_discount_cents => 150, p_delivery_fee_cents => 500)$$, 'desconto não come a taxa de entrega', '22023');
select test.assert_fails($$select public.create_order((select v from ids where k='org'), '[{"description":"x","quantity":1,"unit_price_cents":100}]',
  gen_random_uuid(), p_delivery_fee_cents => -5)$$, 'taxa negativa recusada no pedido', '22023');

-- ================================================================ peso na balança
select test.assert((public.set_order_weights((select v from ids where k='o1'),
  jsonb_build_array(jsonb_build_object('item_id', (select id from public.order_items where order_id = (select v from ids where k='o1') and position = 0), 'quantity', 1.42)))).total_cents
  = 8506 + 1600 - 100 + 500, 'peso conferido recalcula item e total (1,42 kg = 85,06)');
select test.assert_fails($$select public.set_order_weights((select v from ids where k='o1'),
  jsonb_build_array(jsonb_build_object('item_id', (select id from public.order_items where order_id = (select v from ids where k='o1') and position = 1), 'quantity', 3)))$$,
  'só itens em kg mudam pelo peso', 'P0002');
select test.assert_fails($$select public.set_order_weights((select v from ids where k='o1'),
  jsonb_build_array(jsonb_build_object('item_id', (select id from public.order_items where order_id = (select v from ids where k='o1') and position = 0), 'quantity', 1.2345)))$$,
  'mais de 3 casas recusado', '22023');

-- Recebimento acompanha o total, e a baixa sai em quilos.
select from public.receive_order_payment((select v from ids where k='o1'), 1000,
  (select id from public.financial_accounts where organization_id = (select v from ids where k='org') and name = 'Caixa'), 'pix', current_date, gen_random_uuid());
select test.assert((select amount_cents from public.financial_entries where order_id = (select v from ids where k='o1')) = 10506,
  'título a receber com a entrega');
select from public.inventory_consume_order((select v from ids where k='o1'), false);
select test.assert((select stock_qty from public.products where id = (select v from ids where k='picanha')) = 8.58, 'estoque baixado em kg (10 − 1,42)');
select test.assert_fails($$select public.set_order_weights((select v from ids where k='o1'),
  jsonb_build_array(jsonb_build_object('item_id', (select id from public.order_items where order_id = (select v from ids where k='o1') and position = 0), 'quantity', 1.5)))$$,
  'peso não muda depois da baixa do estoque', '55000');

-- Edição mantém o bairro mesmo desativado depois.
insert into ids select 'o2', (public.create_order((select v from ids where k='org'), '[{"description":"x","quantity":1,"unit_price_cents":1000}]',
  gen_random_uuid(), p_delivery_zone_id => (select v from ids where k='vila'))).id;
select from public.save_delivery_zone((select v from ids where k='org'), (select v from ids where k='vila'), 'Vila Nova', 900, false);
select test.assert((public.update_order((select v from ids where k='o2'), '[{"description":"x","quantity":2,"unit_price_cents":1000}]',
  p_delivery_zone_id => (select v from ids where k='vila'))).total_cents = 2900, 'edição aceita o bairro já escolhido, com a taxa atual');
select test.assert_fails($$select public.create_order((select v from ids where k='org'), '[{"description":"x","quantity":1,"unit_price_cents":100}]',
  gen_random_uuid(), p_delivery_zone_id => (select v from ids where k='vila'))$$, 'bairro desativado não vale em pedido novo', 'P0002');
select test.logout();

select test.login_as((select v from ids where k='eva'));
select test.assert_fails($$select public.set_order_weights((select v from ids where k='o2'), '[{"item_id":"00000000-0000-0000-0000-000000000000","quantity":1}]')$$,
  'outra empresa não mexe no peso', 'P0002');
select test.assert_fails($$select public.save_delivery_zone((select v from ids where k='org'), null, 'Invasor', 1)$$,
  'outra empresa não cadastra bairro', 'P0002');
select test.logout();

-- ================================================================ link de encomenda
select test.login_as((select v from ids where k='ana'));
update public.organizations set public_orders_enabled = true where id = (select v from ids where k='org');
select test.logout();

set role service_role;
select public.public_storefront('assadao-da-ana') as sf \gset
select test.assert(jsonb_array_length(:'sf'::jsonb -> 'delivery_zones') = 1 and (:'sf'::jsonb -> 'delivery_zones' -> 0 ->> 'name') = 'Centro'
  and (:'sf'::jsonb -> 'delivery_zones' -> 0 ->> 'fee_cents')::int = 500, 'vitrine mostra os bairros ativos com a taxa');

select public.public_create_order('assadao-da-ana', 'Rafa', '11955554444',
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='picanha'), 'quantity', 1.5)),
  gen_random_uuid(), repeat('a', 32), null, null, (select v from ids where k='centro'), 'Rua B, 200 - casa') as p1 \gset
select test.assert((:'p1'::jsonb ->> 'total_cents')::bigint = 8985 + 500 and (:'p1'::jsonb ->> 'delivery_fee_cents')::int = 500,
  'link: 1,5 kg + entrega do bairro');
select test.assert_fails(format($$select public.public_create_order('assadao-da-ana', 'Rafa', '11955554444', '[{"product_id": "%s", "quantity": 0.05}]', gen_random_uuid(), repeat('b', 32))$$,
  (select v from ids where k='picanha')), 'peso abaixo de 100 g recusado', '22023');
select test.assert_fails(format($$select public.public_create_order('assadao-da-ana', 'Rafa', '11955554444', '[{"product_id": "%s", "quantity": 1.5}]', gen_random_uuid(), repeat('b', 32))$$,
  (select v from ids where k='farofa')), 'item por unidade continua inteiro', '22023');
select test.assert_fails(format($$select public.public_create_order('assadao-da-ana', 'Rafa', '11955554444', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('b', 32), null, null, '%s', null)$$,
  (select v from ids where k='farofa'), (select v from ids where k='centro')), 'entrega sem endereço recusada', '22023');
select test.assert_fails(format($$select public.public_create_order('assadao-da-ana', 'Rafa', '11955554444', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('b', 32), null, null, '%s', 'Rua C, 1')$$,
  (select v from ids where k='farofa'), (select v from ids where k='vila')), 'bairro desativado recusado no link', 'P0002');
select test.assert_fails(format($$select public.public_create_order('assadao-da-ana', 'Rafa', '11955554444', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('b', 32), null, null, '%s', 'Rua C, 1')$$,
  (select v from ids where k='farofa'), (select v from ids where k='zona_e')), 'bairro de outra empresa recusado no link', 'P0002');
reset role;

select test.assert((select delivery_area = 'Centro' and delivery_address = 'Rua B, 200 - casa' and total_cents = subtotal_cents + delivery_fee_cents
  from public.orders where channel = 'link' and organization_id = (select v from ids where k='org')), 'pedido do link guarda bairro e endereço');
select test.assert((select address = 'Rua B, 200 - casa' from public.customers where phone_digits = '11955554444'), 'cliente novo leva o endereço');

set role service_role;
select public.public_create_order('assadao-da-ana', 'Rafa', '11955554444',
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='farofa'), 'quantity', 1)),
  gen_random_uuid(), repeat('c', 32), null, null, null, 'Rua ignorada, 1') as p2 \gset
reset role;
select test.assert((:'p2'::jsonb ->> 'total_cents')::bigint = 800, 'retirada não cobra entrega');
select test.assert((select count(*) from public.orders where channel = 'link' and delivery_address is not null and organization_id = (select v from ids where k='org')) = 1,
  'retirada não guarda endereço');

select test.login_anon();
select test.assert_fails($$select * from public.delivery_zones$$, 'anônimo não lê bairros', '42501');
select test.assert_fails($$select public.save_delivery_zone(gen_random_uuid(), null, 'X1', 1)$$, 'anônimo não cadastra bairro', '42501');
select test.logout();

rollback;
