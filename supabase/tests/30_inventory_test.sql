-- Testes da migração 0004: movimentações de estoque.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create temp table movs (k text primary key, v bigint);
grant all on movs to authenticated, anon;

insert into ids values
  ('ana',   test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
with x as (
  insert into public.products (organization_id, item_type, name, unit, cost_cents)
  values ((select v from ids where k='org_a'), 'raw_material', 'Cera de soja', 'kg', 3800) returning id)
insert into ids select 'cera', id from x;
with x as (
  insert into public.products (organization_id, item_type, name, unit, price_cents)
  values ((select v from ids where k='org_a'), 'finished', 'Vela 200g', 'un', 4990) returning id)
insert into ids select 'vela', id from x;
with x as (
  insert into public.products (organization_id, item_type, name, price_cents)
  values ((select v from ids where k='org_a'), 'service', 'Embalagem', 500) returning id)
insert into ids select 'svc', id from x;
select test.logout();

select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_b', (public.create_organization('Bruno Reparos', 'services')).id;
select test.logout();

-- ================================================================ entradas e saídas
select test.login_as((select v from ids where k='ana'));

insert into movs select 'compra', (public.inventory_move((select v from ids where k='cera'), 'purchase', 5.5,
  'aaaaaaaa-0000-0000-0000-000000000001')).id;
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 5.5, 'compra soma ao saldo');
select test.assert((select balance_before = 0 and balance_after = 5.5 and quantity = 5.5 from public.inventory_movements
  where id = (select v from movs where k='compra')), 'movimentação guarda saldo antes e depois');
select test.assert((select created_by from public.inventory_movements where id = (select v from movs where k='compra'))
  = (select v from ids where k='ana'), 'autor vem da sessão');

select test.assert((public.inventory_move((select v from ids where k='cera'), 'purchase', 5.5,
  'aaaaaaaa-0000-0000-0000-000000000001')).id = (select v from movs where k='compra'), 'mesma chave devolve a mesma movimentação');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 5.5, 'reenvio não soma de novo');

select from public.inventory_move((select v from ids where k='cera'), 'production_consumption', 1.25, gen_random_uuid());
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 4.25, 'consumo subtrai do saldo');
select test.assert((select quantity from public.inventory_movements where product_id = (select v from ids where k='cera')
  order by id desc limit 1) = -1.25, 'saída é gravada com sinal negativo');

select test.assert_fails($$select public.inventory_move((select v from ids where k='cera'), 'sale', 10, gen_random_uuid())$$,
  'saída maior que o saldo é bloqueada', '55000');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 4.25, 'saldo intacto após bloqueio');
select from public.inventory_move((select v from ids where k='cera'), 'manual_out', 5, gen_random_uuid(), 'Doação para feira', true);
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = -0.75, 'saldo negativo só com autorização');
select test.assert((select negative_authorized from public.inventory_movements where product_id = (select v from ids where k='cera')
  order by id desc limit 1), 'autorização de negativo fica registrada');

select test.assert_fails($$select public.inventory_move((select v from ids where k='cera'), 'loss', 1, gen_random_uuid())$$,
  'perda exige motivo', '22023');
select test.assert_fails($$select public.inventory_move((select v from ids where k='cera'), 'purchase', 0, gen_random_uuid())$$,
  'quantidade zero é recusada', '22023');
select test.assert_fails($$select public.inventory_move((select v from ids where k='cera'), 'purchase', -2, gen_random_uuid())$$,
  'quantidade negativa é recusada', '22023');
select test.assert_fails($$select public.inventory_move((select v from ids where k='cera'), 'purchase', 1.0001, gen_random_uuid())$$,
  'mais de 3 casas decimais é recusado', '22023');
select test.assert_fails($$select public.inventory_move((select v from ids where k='cera'), 'purchase', 1, null)$$,
  'chave de idempotência é obrigatória', '22023');
select test.assert_fails($$select public.inventory_move((select v from ids where k='cera'), 'adjustment', 1, gen_random_uuid())$$,
  'ajuste não passa por inventory_move', '22023');
select test.assert_fails($$select public.inventory_move((select v from ids where k='svc'), 'purchase', 1, gen_random_uuid())$$,
  'serviço não movimenta estoque', '55000');

-- ================================================================ ajuste
select test.assert((public.inventory_adjust((select v from ids where k='cera'), 3, 'Contagem do mês', gen_random_uuid())).quantity = 3.75,
  'ajuste grava a diferença até a contagem');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 3, 'saldo igual à contagem');
select test.assert_fails($$select public.inventory_adjust((select v from ids where k='cera'), 3, 'Contagem', gen_random_uuid())$$,
  'ajuste sem diferença é recusado', '22023');
select test.assert_fails($$select public.inventory_adjust((select v from ids where k='cera'), 2, '', gen_random_uuid())$$,
  'ajuste exige motivo', '22023');
select test.assert_fails($$select public.inventory_adjust((select v from ids where k='cera'), -1, 'Contagem', gen_random_uuid())$$,
  'contagem negativa é recusada', '22023');

-- ================================================================ estorno
select test.assert((public.inventory_reverse((select v from movs where k='compra'), 'Lançado errado', gen_random_uuid())).quantity = -5.5,
  'estorno grava a movimentação inversa');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = -2.5,
  'estorno de entrada já consumida pode deixar o saldo negativo');
select test.assert((select count(*) from public.inventory_movements where reverses_movement_id = (select v from movs where k='compra')) = 1,
  'estorno ligado à movimentação original');
select from public.inventory_reverse((select v from movs where k='compra'), 'De novo', gen_random_uuid());
select test.assert((select count(*) from public.inventory_movements where reverses_movement_id = (select v from movs where k='compra')) = 1,
  'estornar duas vezes não duplica');
select test.assert_fails($$select public.inventory_reverse((select id from public.inventory_movements where movement_type = 'reversal' limit 1), 'x estorno', gen_random_uuid())$$,
  'estorno não é estornado', '55000');
select test.assert((select count(*) from public.inventory_movements where id = (select v from movs where k='compra')) = 1,
  'movimentação estornada continua no histórico');

-- Imutável e protegido
select test.assert_fails($$update public.inventory_movements set quantity = 1 where id = (select v from movs where k='compra')$$,
  'movimentação não é editada', '42501');
select test.assert_fails($$delete from public.inventory_movements where id = (select v from movs where k='compra')$$,
  'movimentação não é apagada', '42501');
select test.assert_fails($$insert into public.inventory_movements (organization_id, product_id, movement_type, quantity, balance_before, balance_after, created_by)
  values ((select v from ids where k='org_a'), (select v from ids where k='cera'), 'purchase', 1, 0, 1, auth.uid())$$,
  'insert direto em movimentações é bloqueado', '42501');

-- ================================================================ baixa de pedido
select from public.inventory_move((select v from ids where k='vela'), 'purchase', 10, gen_random_uuid());
insert into ids select 'o1', (public.create_order((select v from ids where k='org_a'),
  jsonb_build_array(
    jsonb_build_object('product_id', (select v from ids where k='vela'), 'quantity', 2),
    jsonb_build_object('product_id', (select v from ids where k='vela'), 'quantity', 1),
    jsonb_build_object('product_id', (select v from ids where k='svc'), 'quantity', 1),
    jsonb_build_object('description', 'Cartão', 'quantity', 1, 'unit_price_cents', 800)),
  gen_random_uuid())).id;
select test.assert((select stock_qty from public.products where id = (select v from ids where k='vela')) = 10, 'criar pedido não baixa estoque');

select test.assert((public.inventory_consume_order((select v from ids where k='o1'))).stock_consumed_at is not null, 'pedido marcado como baixado');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='vela')) = 7, 'baixa soma as linhas do mesmo item');
select test.assert((select count(*) from public.inventory_movements where order_id = (select v from ids where k='o1')) = 1,
  'uma movimentação por item; serviço e item avulso não movimentam');
select test.assert((select movement_type::text from public.inventory_movements where order_id = (select v from ids where k='o1')) = 'sale',
  'baixa de pedido é saída por venda');
select from public.inventory_consume_order((select v from ids where k='o1'));
select test.assert((select stock_qty from public.products where id = (select v from ids where k='vela')) = 7, 'baixar de novo não desconta duas vezes');
select test.assert((select stock_consumed_at is not null from public.order_summaries where id = (select v from ids where k='o1')),
  'resumo do pedido expõe a baixa');

select test.assert_fails($$select public.update_order((select v from ids where k='o1'), '[{"description":"x","quantity":1,"unit_price_cents":1}]')$$,
  'itens de pedido baixado não mudam', '55000');

select from public.set_order_status((select v from ids where k='o1'), 'cancelled', 'Cliente desistiu');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='vela')) = 10, 'cancelar pedido baixado devolve o estoque');
select test.assert((select count(*) from public.inventory_movements where order_id = (select v from ids where k='o1') and movement_type = 'reversal') = 1,
  'devolução é um estorno ligado ao pedido');

insert into ids select 'o2', (public.create_order((select v from ids where k='org_a'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='vela'), 'quantity', 11)), gen_random_uuid())).id;
select test.assert_fails($$select public.inventory_consume_order((select v from ids where k='o2'))$$,
  'baixa de pedido sem saldo é bloqueada', '55000');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='vela')) = 10
  and (select stock_consumed_at is null from public.orders where id = (select v from ids where k='o2')), 'bloqueio não deixa baixa parcial');
select from public.set_order_status((select v from ids where k='o2'), 'cancelled', 'Sem estoque');
select test.assert_fails($$select public.inventory_consume_order((select v from ids where k='o2'), true)$$,
  'pedido cancelado não é baixado', '55000');

-- Reconciliação: saldo = soma do histórico em todos os itens
select test.assert(not exists (
  select 1 from public.products p
  where p.organization_id = (select v from ids where k='org_a')
    and p.stock_qty <> coalesce((select sum(m.quantity) from public.inventory_movements m where m.product_id = p.id), 0)
), 'saldo de cada item bate com a soma das movimentações');
select test.assert(not exists (
  select 1 from public.inventory_movements m
  join lateral (select m2.balance_after from public.inventory_movements m2
                where m2.product_id = m.product_id and m2.id < m.id order by m2.id desc limit 1) prev on true
  where m.balance_before <> prev.balance_after
), 'saldo antes de cada movimentação = saldo depois da anterior');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(test.row_count('select * from public.inventory_movements') = 0, 'outra empresa não vê movimentações');
select test.assert_fails($$select public.inventory_move((select v from ids where k='cera'), 'purchase', 1, gen_random_uuid())$$,
  'outra empresa não movimenta o item', 'P0002');
select test.assert_fails($$select public.inventory_adjust((select v from ids where k='cera'), 100, 'Contagem', gen_random_uuid())$$,
  'outra empresa não ajusta o item', 'P0002');
select test.assert_fails($$select public.inventory_reverse((select v from movs where k='compra'), 'Estorno', gen_random_uuid())$$,
  'outra empresa não estorna', 'P0002');
select test.assert_fails($$select public.inventory_consume_order((select v from ids where k='o1'))$$,
  'outra empresa não baixa o pedido', 'P0002');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.inventory_movements', 'anon não lê movimentações', '42501');
select test.assert_fails($$select public.inventory_move(gen_random_uuid(), 'purchase', 1, gen_random_uuid())$$, 'anon não movimenta', '42501');
select test.logout();

rollback;
