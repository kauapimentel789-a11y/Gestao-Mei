-- Testes da migração 0013: link público de encomenda.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

insert into ids values
  ('ana',   test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_b', (public.create_organization('Bruno Reparos', 'services', 'bruno-reparos')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_b'), 'service', 'Instalação', 15000) returning id)
insert into ids select 'inst', id from x;
select test.logout();

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production', 'ana-atelie')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_a'), 'finished', 'Bolo', 9000) returning id)
insert into ids select 'bolo', id from x;
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_a'), 'finished', 'Brownie', 1200) returning id)
insert into ids select 'brownie', id from x;
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_a'), 'raw_material', 'Farinha', 800) returning id)
insert into ids select 'farinha', id from x;
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_a'), 'finished', 'Sem preço', 0) returning id)
insert into ids select 'zero', id from x;
with x as (insert into public.products (organization_id, item_type, name, price_cents, active) values ((select v from ids where k='org_a'), 'finished', 'Antigo', 500, false) returning id)
insert into ids select 'inativo', id from x;
with x as (insert into public.customers (organization_id, name, phone) values ((select v from ids where k='org_a'), 'Carla Souza', '(11) 98888-7777') returning id)
insert into ids select 'cli', id from x;
select test.logout();

-- Desligado por padrão.
set role service_role;
select test.assert_fails($$select public.public_storefront('ana-atelie')$$, 'link desligado não abre', 'P0002');
reset role;

-- Ninguém fora da service role chama os RPCs.
select test.login_anon();
select test.assert_fails($$select public.public_storefront('ana-atelie')$$, 'anon não chama a vitrine direto', '42501');
select test.assert_fails($$select * from public.public_order_attempts$$, 'anon não lê tentativas', '42501');
select test.logout();
select test.login_as((select v from ids where k='ana'));
select test.assert_fails($$select public.public_create_order('ana-atelie', 'X', '11999998888', '[]', gen_random_uuid(), repeat('a', 32))$$,
  'usuário logado não chama o envio direto', '42501');
update public.organizations set public_orders_enabled = true where id = (select v from ids where k='org_a');
select test.logout();

select test.login_as((select v from ids where k='bruno'));
select test.assert(test.affected($$update public.organizations set public_orders_enabled = true where id = (select v from ids where k='org_a')$$) = 0,
  'outra empresa não liga o link alheio');
update public.organizations set public_orders_enabled = true where id = (select v from ids where k='org_b');
select test.logout();

set role service_role;
select public.public_storefront(' Ana-Atelie ') as sf \gset
select test.assert((:'sf'::jsonb ->> 'name') = 'Ana Ateliê', 'vitrine pelo slug, sem diferenciar maiúsculas');
select test.assert(jsonb_array_length(:'sf'::jsonb -> 'products') = 2 and (:'sf'::jsonb -> 'products' -> 0 ->> 'name') = 'Bolo'
  and (:'sf'::jsonb -> 'products' -> 1 ->> 'name') = 'Brownie', 'só itens ativos, com preço e vendáveis');
select test.assert(not (:'sf'::jsonb -> 'products' -> 0 ? 'cost_cents') and not (:'sf'::jsonb ? 'id'), 'vitrine não expõe custo nem id da empresa');

-- Pedido: preço do cadastro, mesmo que o cliente mande outro.
insert into ids values ('k1', gen_random_uuid());
select public.public_create_order('ana-atelie', ' Carla ', '+55 11 98888-7777',
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 2, 'unit_price_cents', 1),
                    jsonb_build_object('product_id', (select v from ids where k='brownie'), 'quantity', 3)),
  (select v from ids where k='k1'), repeat('a', 32), ((now() at time zone 'America/Sao_Paulo')::date + 3), 'Sem lactose') as o1 \gset
reset role;

select test.assert((:'o1'::jsonb ->> 'total_cents')::bigint = 21600, 'total com os preços do cadastro');
select test.assert((select channel = 'link' and status = 'received' and kind = 'order' and created_by is null and notes = 'Sem lactose'
  from public.orders where idempotency_key = (select v from ids where k='k1')), 'pedido entra pelo link como Recebido');
select test.assert((select customer_id from public.orders where idempotency_key = (select v from ids where k='k1')) = (select v from ids where k='cli'),
  'cliente casado pelo telefone com 55');
select test.assert((select name from public.customers where id = (select v from ids where k='cli')) = 'Carla Souza', 'cliente existente não é alterado');
select test.assert((select (due_at at time zone 'America/Sao_Paulo')::date from public.orders where idempotency_key = (select v from ids where k='k1'))
  = (now() at time zone 'America/Sao_Paulo')::date + 3, 'data desejada vira o prazo');
select test.assert((select count(*) from public.order_status_history h join public.orders o on o.id = h.order_id
  where o.idempotency_key = (select v from ids where k='k1') and h.changed_by is null) = 1, 'histórico registra a entrada');

set role service_role;
select public.public_create_order('ana-atelie', 'Carla', '11988887777',
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 1)),
  (select v from ids where k='k1'), repeat('a', 32)) as o1b \gset
reset role;
select test.assert((:'o1b'::jsonb ->> 'number') = (:'o1'::jsonb ->> 'number'), 'reenvio devolve o mesmo pedido');
select test.assert((select count(*) from public.orders where organization_id = (select v from ids where k='org_a')) = 1, 'reenvio não duplica');

set role service_role;
select public.public_create_order('ana-atelie', 'Davi', '(21) 97777-6666',
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 1)), gen_random_uuid(), repeat('b', 32)) as o2 \gset
reset role;
select test.assert((select count(*) from public.customers where organization_id = (select v from ids where k='org_a') and phone_digits = '21977776666' and created_by is null) = 1,
  'telefone novo cria cliente');

set role service_role;
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'Eva', '11966665555', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('c', 32))$$,
  (select v from ids where k='farinha')), 'insumo não pode ser encomendado', 'P0002');
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'Eva', '11966665555', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('c', 32))$$,
  (select v from ids where k='inativo')), 'item inativo não pode ser encomendado', 'P0002');
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'Eva', '11966665555', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('c', 32))$$,
  (select v from ids where k='inst')), 'item de outra empresa recusado', 'P0002');
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'Eva', '11966665555', '[{"product_id": "%s", "quantity": 1.5}]', gen_random_uuid(), repeat('c', 32))$$,
  (select v from ids where k='bolo')), 'quantidade fracionada recusada', '22023');
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'Eva', '11966665555', '[{"product_id": "%s", "quantity": "2"}]', gen_random_uuid(), repeat('c', 32))$$,
  (select v from ids where k='bolo')), 'quantidade como texto recusada', '22023');
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'Eva', '11966665555', '[{"product_id": "%s", "quantity": 1}, {"product_id": "%s", "quantity": 2}]', gen_random_uuid(), repeat('c', 32))$$,
  (select v from ids where k='bolo'), (select v from ids where k='bolo')), 'item repetido recusado', '22023');
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'Eva', '1234', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('c', 32))$$,
  (select v from ids where k='bolo')), 'telefone curto recusado', '22023');
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'E', '11966665555', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('c', 32))$$,
  (select v from ids where k='bolo')), 'nome curto recusado', '22023');
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'Eva', '11966665555', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('c', 32), '2020-01-01')$$,
  (select v from ids where k='bolo')), 'data no passado recusada', '22023');
select test.assert_fails($$select public.public_create_order('ana-atelie', 'Eva', '11966665555', '[]', gen_random_uuid(), repeat('c', 32))$$, 'sem itens recusado', '22023');
select test.assert_fails(format($$select public.public_create_order('nao-existe', 'Eva', '11966665555', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('c', 32))$$,
  (select v from ids where k='bolo')), 'slug inexistente', 'P0002');

-- Limite: 5 por visitante por hora (o visitante "a" já enviou 1).
select public.public_create_order('ana-atelie', 'Carla', '11988887777', format('[{"product_id": "%s", "quantity": 1}]', (select v from ids where k='bolo'))::jsonb, gen_random_uuid(), repeat('a', 32))
from generate_series(1, 4);
select test.assert_fails(format($$select public.public_create_order('ana-atelie', 'Carla', '11988887777', '[{"product_id": "%s", "quantity": 1}]', gen_random_uuid(), repeat('a', 32))$$,
  (select v from ids where k='bolo')), 'sexto envio na hora é barrado', '54000');
select test.assert(public.public_create_order('ana-atelie', 'Davi', '21977776666', format('[{"product_id": "%s", "quantity": 1}]', (select v from ids where k='bolo'))::jsonb,
  gen_random_uuid(), repeat('b', 32)) ? 'number', 'outro visitante continua enviando');

-- Serviços: vira ordem de serviço.
select public.public_create_order('bruno-reparos', 'Fabio', '31955554444', format('[{"product_id": "%s", "quantity": 1}]', (select v from ids where k='inst'))::jsonb,
  gen_random_uuid(), repeat('d', 32)) as o3 \gset
reset role;
select test.assert((select kind from public.orders where organization_id = (select v from ids where k='org_b')) = 'service_order', 'em serviços entra como OS');

-- Fora do link, pedido sem autor continua proibido.
select test.assert_fails(format($$insert into public.orders (organization_id, number, channel) values ('%s', 999, 'whatsapp')$$, (select v from ids where k='org_a')),
  'pedido sem autor só pelo link', '23514');

-- A empresa vê os pedidos do link normalmente.
select test.login_as((select v from ids where k='ana'));
select test.assert((select count(*) from public.orders where channel = 'link') = 7, 'dona vê os pedidos do link');
select test.logout();

rollback;
