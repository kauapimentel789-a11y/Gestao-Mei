-- Testes da migração 0007: receitas e produção.
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
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production', p_hourly_rate_cents => 3000)).id;
with x as (insert into public.products (organization_id, item_type, name, unit, price_cents) values ((select v from ids where k='org_a'), 'finished', 'Vela', 'un', 3500) returning id)
insert into ids select 'vela', id from x;
with x as (insert into public.products (organization_id, item_type, name, unit) values ((select v from ids where k='org_a'), 'finished', 'Sabonete', 'un') returning id)
insert into ids select 'sabonete', id from x;
with x as (insert into public.products (organization_id, item_type, name, unit, cost_cents) values ((select v from ids where k='org_a'), 'raw_material', 'Cera', 'kg', 4000) returning id)
insert into ids select 'cera', id from x;
with x as (insert into public.products (organization_id, item_type, name, unit, cost_cents) values ((select v from ids where k='org_a'), 'raw_material', 'Pavio', 'un', 50) returning id)
insert into ids select 'pavio', id from x;
with x as (insert into public.products (organization_id, item_type, name, unit, track_stock) values ((select v from ids where k='org_a'), 'consumable', 'Fita', 'un', false) returning id)
insert into ids select 'fita', id from x;
with x as (insert into public.products (organization_id, item_type, name) values ((select v from ids where k='org_a'), 'service', 'Entrega') returning id)
insert into ids select 'svc', id from x;
select from public.inventory_move((select v from ids where k='cera'), 'purchase', 3, gen_random_uuid());
select from public.inventory_move((select v from ids where k='pavio'), 'purchase', 25, gen_random_uuid());

-- ================================================================ receita
-- Lote de 10 velas: 1 kg de cera, 10 pavios, 2 fitas, 60 min de trabalho.
insert into ids select 'rec', (public.save_recipe((select v from ids where k='vela'),
  jsonb_build_array(
    jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1),
    jsonb_build_object('product_id', (select v from ids where k='pavio'), 'quantity', 10),
    jsonb_build_object('product_id', (select v from ids where k='fita'), 'quantity', 2)),
  10, 60, 'Derreter em banho-maria')).id;
select test.assert((select count(*) from public.recipe_items where recipe_id = (select v from ids where k='rec')) = 3, 'receita salva com 3 insumos');
select test.assert((select materials_cost_cents || ':' || missing_cost_inputs || ':' || labor_cost_cents || ':' || unit_cost_cents
  from public.recipe_costs where recipe_id = (select v from ids where k='rec')) = '4500:1:3000:750',
  'custo estimado: insumos 45,00 (fita sem custo) + 1 h a 30,00 = 75,00 por lote de 10');

-- Salvar de novo substitui os insumos e mantém a mesma receita.
select test.assert((public.save_recipe((select v from ids where k='vela'),
  jsonb_build_array(
    jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1),
    jsonb_build_object('product_id', (select v from ids where k='pavio'), 'quantity', 10)),
  10, 60)).id = (select v from ids where k='rec'), 'salvar de novo atualiza a mesma receita');
select test.assert((select count(*) from public.recipe_items where recipe_id = (select v from ids where k='rec')) = 2, 'insumos substituídos');
select from public.save_recipe((select v from ids where k='vela'),
  jsonb_build_array(
    jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1),
    jsonb_build_object('product_id', (select v from ids where k='pavio'), 'quantity', 10),
    jsonb_build_object('product_id', (select v from ids where k='fita'), 'quantity', 2)),
  10, 60);

select test.assert_fails($$select public.save_recipe((select v from ids where k='cera'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='pavio'), 'quantity', 1)))$$,
  'matéria-prima não tem receita', '22023');
select test.assert_fails($$select public.save_recipe((select v from ids where k='sabonete'), '[]')$$, 'receita sem insumos é recusada', '22023');
select test.assert_fails($$select public.save_recipe((select v from ids where k='sabonete'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='sabonete'), 'quantity', 1)))$$,
  'produto não é insumo dele mesmo', '22023');
select test.assert_fails($$select public.save_recipe((select v from ids where k='sabonete'), jsonb_build_array(
    jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1),
    jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 2)))$$,
  'insumo repetido é recusado', '22023');
select test.assert_fails($$select public.save_recipe((select v from ids where k='sabonete'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='svc'), 'quantity', 1)))$$,
  'serviço não é insumo', 'P0002');
select test.assert_fails($$select public.save_recipe((select v from ids where k='sabonete'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 0)))$$,
  'quantidade zero é recusada', '22023');
select test.assert_fails($$select public.save_recipe((select v from ids where k='sabonete'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1)), 0)$$,
  'rendimento zero é recusado', '22023');
select test.assert_fails($$select public.save_recipe((select v from ids where k='sabonete'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1)), 1, -5)$$,
  'minutos negativos são recusados', '22023');
select test.assert(not exists (select 1 from public.recipes where product_id = (select v from ids where k='sabonete')), 'receita recusada não fica pela metade');
select test.assert_fails($$insert into public.recipes (organization_id, product_id, updated_by) values ((select v from ids where k='org_a'), (select v from ids where k='sabonete'), auth.uid())$$,
  'insert direto em receitas é bloqueado', '42501');

-- ================================================================ produção
select test.assert_fails($$select public.register_production((select v from ids where k='sabonete'), 5, gen_random_uuid())$$,
  'produzir exige receita', '55000');

-- 20 velas = 2 lotes: 2 kg de cera, 20 pavios, 2 h de trabalho.
select public.register_production((select v from ids where k='vela'), 20, 'eeeeeeee-0000-0000-0000-000000000001') as p1 \gset
insert into ids select 'p1', (:'p1'::public.production_runs).id;
select test.assert((:'p1'::public.production_runs).number = 1, 'produção nº 1');
select test.assert((select materials_cost_cents || ':' || labor_cost_cents || ':' || unit_cost_cents || ':' || missing_cost_inputs
  from public.production_runs where id = (select v from ids where k='p1')) = '9000:6000:750:1', 'custo efetivo: insumos 90,00 + mão de obra 60,00 = 7,50 por vela');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='vela')) = 20, 'produção dá entrada no produto pronto');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 1, 'produção baixa a cera');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='pavio')) = 5, 'produção baixa os pavios');
select test.assert((select cost_cents from public.products where id = (select v from ids where k='vela')) = 750, 'produto sem custo recebe o custo da produção');
select test.assert((select count(*) from public.inventory_movements where production_run_id = (select v from ids where k='p1')) = 3,
  'consumo de 2 insumos com estoque + 1 entrada (fita não controla estoque)');
select test.assert((select count(*) from public.inventory_movements where production_run_id = (select v from ids where k='p1') and movement_type = 'production_output') = 1,
  'entrada registrada como produção');
select test.assert(not exists (select 1 from public.financial_entries where organization_id = (select v from ids where k='org_a')),
  'produção não gera lançamento financeiro');

-- Idempotência
select test.assert((public.register_production((select v from ids where k='vela'), 999, 'eeeeeeee-0000-0000-0000-000000000001')).id
  = (select v from ids where k='p1'), 'mesma chave devolve a mesma produção');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='vela')) = 20, 'reenvio não produz de novo');

-- Estoque insuficiente bloqueia, a menos que autorizado.
update public.products set cost_cents = 6000 where id = (select v from ids where k='cera');
select test.assert_fails($$select public.register_production((select v from ids where k='vela'), 10, gen_random_uuid())$$,
  'faltando pavio a produção é bloqueada', '55000');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 1, 'produção bloqueada não baixa nada');
select test.assert(not exists (select 1 from public.production_runs where number = 2), 'produção bloqueada não consome número');

-- 10 velas: insumos 60,00 + 5,00, mão de obra 30,00 = 9,50 por vela.
-- Custo médio: (20 × 7,50 + 10 × 9,50) / 30 = 8,17
insert into ids select 'p2', (public.register_production((select v from ids where k='vela'), 10, gen_random_uuid(), p_allow_negative => true, p_notes => 'Faltou pavio')).id;
select test.assert((select unit_cost_cents from public.production_runs where id = (select v from ids where k='p2')) = 950, 'custo efetivo usa o custo atual dos insumos');
select test.assert((select cost_cents from public.products where id = (select v from ids where k='vela')) = 817, 'custo do produto vira custo médio ponderado');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='pavio')) = -5, 'produção autorizada deixa o insumo negativo');
select test.assert((select bool_and(negative_authorized) from public.inventory_movements where production_run_id = (select v from ids where k='p2') and product_id = (select v from ids where k='pavio')),
  'consumo que deixa negativo fica marcado');

select test.assert_fails($$select public.register_production((select v from ids where k='vela'), 0, gen_random_uuid())$$, 'quantidade zero é recusada', '22023');
select test.assert_fails($$select public.register_production((select v from ids where k='vela'), 1, null)$$, 'chave de idempotência obrigatória', '22023');
select test.assert_fails($$select public.register_production((select v from ids where k='vela'), 1, gen_random_uuid(), p_order_id => gen_random_uuid())$$,
  'pedido inexistente é recusado', 'P0002');
select test.assert_fails($$insert into public.production_runs (organization_id, number, product_id, quantity, materials_cost_cents, labor_cost_cents, unit_cost_cents, idempotency_key, created_by)
  values ((select v from ids where k='org_a'), 99, (select v from ids where k='vela'), 1, 0, 0, 0, gen_random_uuid(), auth.uid())$$,
  'insert direto em produções é bloqueado', '42501');
select test.assert_fails($$select public.inventory_reverse((select id from public.inventory_movements where production_run_id = (select v from ids where k='p1') limit 1), 'Errado', gen_random_uuid())$$,
  'movimentação de produção só sai cancelando a produção', '55000');

-- ================================================================ cancelamento
select test.assert_fails($$select public.cancel_production((select v from ids where k='p2'), '')$$, 'cancelar exige motivo', '22023');
select test.assert((public.cancel_production((select v from ids where k='p2'), 'Lançada errada')).status = 'cancelled', 'produção cancelada');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='vela')) = 20, 'cancelar estorna a entrada do produto');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 1, 'cancelar devolve a cera');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='pavio')) = 5, 'cancelar devolve os pavios');
select from public.cancel_production((select v from ids where k='p2'), 'De novo');
select test.assert((select count(*) from public.inventory_movements where production_run_id = (select v from ids where k='p2') and movement_type = 'reversal') = 3,
  'cancelar duas vezes não estorna duas vezes');
select test.assert((select count(*) from public.production_runs where organization_id = (select v from ids where k='org_a')) = 2, 'produção cancelada continua no histórico');

-- ================================================================ demanda
insert into ids select 'o1', (public.create_order((select v from ids where k='org_a'),
  jsonb_build_array(
    jsonb_build_object('product_id', (select v from ids where k='vela'), 'quantity', 25),
    jsonb_build_object('product_id', (select v from ids where k='sabonete'), 'quantity', 3, 'unit_price_cents', 1200)),
  gen_random_uuid())).id;
select test.assert((select ordered_qty || ':' || to_produce_qty || ':' || has_recipe from public.production_demand where product_id = (select v from ids where k='vela'))
  = '25.000:5.000:true', 'demanda: 25 pedidas, 20 em estoque, faltam 5');
select test.assert((select to_produce_qty || ':' || has_recipe from public.production_demand where product_id = (select v from ids where k='sabonete'))
  = '3.000:false', 'demanda mostra produto ainda sem receita');
insert into ids select 'p3', (public.register_production((select v from ids where k='vela'), 5, gen_random_uuid(), p_order_id => (select v from ids where k='o1'), p_allow_negative => true)).id;
select test.assert((select order_id from public.production_runs where id = (select v from ids where k='p3')) = (select v from ids where k='o1'), 'produção vinculada ao pedido');
select test.assert((select to_produce_qty from public.production_demand where product_id = (select v from ids where k='vela')) = 0, 'produzido para o pedido zera a falta');

select test.assert(not exists (
  select 1 from public.products p
  where p.organization_id = (select v from ids where k='org_a')
    and p.stock_qty <> coalesce((select sum(m.quantity) from public.inventory_movements m where m.product_id = p.id), 0)
), 'saldo de cada item bate com as movimentações');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(test.row_count('select * from public.recipes') = 0, 'outra empresa não vê receitas');
select test.assert(test.row_count('select * from public.recipe_items') = 0, 'outra empresa não vê insumos de receitas');
select test.assert(test.row_count('select * from public.production_runs') = 0, 'outra empresa não vê produções');
select test.assert(test.row_count('select * from public.recipe_costs') = 0, 'outra empresa não vê custos de receita');
select test.assert(test.row_count('select * from public.production_demand') = 0, 'outra empresa não vê demanda');
select test.assert_fails($$select public.save_recipe((select v from ids where k='vela'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1)))$$,
  'não edita receita alheia', 'P0002');
select test.assert_fails($$select public.register_production((select v from ids where k='vela'), 1, gen_random_uuid())$$, 'não produz em empresa alheia', 'P0002');
select test.assert_fails($$select public.cancel_production((select v from ids where k='p1'), 'Invasão')$$, 'não cancela produção alheia', 'P0002');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.recipes', 'anon não lê receitas', '42501');
select test.assert_fails('select * from public.production_runs', 'anon não lê produções', '42501');
select test.assert_fails($$select public.register_production((select v from ids where k='vela'), 1, gen_random_uuid())$$, 'anon não produz', '42501');
select test.logout();

rollback;
