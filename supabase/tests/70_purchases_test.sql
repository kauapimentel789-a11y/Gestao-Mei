-- Testes da migração 0006: fornecedores e compras.
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
with x as (insert into public.products (organization_id, item_type, name, unit) values ((select v from ids where k='org_a'), 'raw_material', 'Cera de soja', 'kg') returning id)
insert into ids select 'cera', id from x;
with x as (insert into public.products (organization_id, item_type, name, unit, track_stock) values ((select v from ids where k='org_a'), 'consumable', 'Fita', 'un', false) returning id)
insert into ids select 'fita', id from x;
with x as (insert into public.products (organization_id, item_type, name) values ((select v from ids where k='org_a'), 'service', 'Entrega') returning id)
insert into ids select 'svc', id from x;

-- ================================================================ fornecedores
with x as (insert into public.suppliers (organization_id, name, document, phone) values ((select v from ids where k='org_a'), 'Casa da Cera', '12345678000199', '(11) 3333-4444') returning id)
insert into ids select 'forn', id from x;
select test.assert((select phone_digits from public.suppliers where id = (select v from ids where k='forn')) = '1133334444', 'telefone do fornecedor normalizado');
select test.assert_fails($$insert into public.suppliers (organization_id, name, document) values ((select v from ids where k='org_a'), 'Outra', '12345678000199')$$,
  'documento repetido na mesma empresa é recusado', '23505');
select test.assert_fails($$insert into public.suppliers (organization_id, name, document) values ((select v from ids where k='org_a'), 'Outra', '123')$$,
  'documento precisa ter 11 ou 14 dígitos', '23514');
select test.assert_fails($$delete from public.suppliers where id = (select v from ids where k='forn')$$, 'fornecedor não é apagado', '42501');

-- ================================================================ compra
select public.create_purchase((select v from ids where k='org_a'),
  jsonb_build_array(
    jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 2, 'unit_cost_cents', 3000),
    jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 0.5, 'unit_cost_cents', 4000),
    jsonb_build_object('product_id', (select v from ids where k='fita'), 'quantity', 10, 'unit_cost_cents', 150)),
  'dddddddd-0000-0000-0000-000000000001',
  p_supplier_id => (select v from ids where k='forn'), p_due_date => current_date + 30, p_invoice_ref => 'NF 123') as c1 \gset
insert into ids select 'c1', (:'c1'::public.purchases).id;
select test.assert((:'c1'::public.purchases).number = 1, 'compra nº 1');
select test.assert((:'c1'::public.purchases).total_cents = 6000 + 2000 + 1500, 'total calculado no banco');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 2.5, 'compra dá entrada no estoque');
select test.assert((select count(*) from public.inventory_movements where purchase_id = (select v from ids where k='c1')) = 1,
  'uma entrada por item que controla estoque (fita não controla)');
select test.assert((select cost_cents from public.products where id = (select v from ids where k='cera')) = 3200, 'custo do item = custo médio da compra (80,00 / 2,5 kg)');
select test.assert((select cost_cents from public.products where id = (select v from ids where k='fita')) = 150, 'item sem estoque recebe o último custo');
select test.assert((select amount_cents || ':' || due_date || ':' || status from public.financial_entry_overview where purchase_id = (select v from ids where k='c1'))
  = '9500:' || (current_date + 30) || ':pending', 'compra gera conta a pagar com o vencimento');
select test.assert((select supplier_name from public.financial_entry_overview where purchase_id = (select v from ids where k='c1')) = 'Casa da Cera', 'conta a pagar mostra o fornecedor');
select test.assert((select category_nature from public.financial_entry_overview where purchase_id = (select v from ids where k='c1')) = 'inventory_purchase',
  'compra entra como compra de estoque, não como despesa');

-- Idempotência
select test.assert((public.create_purchase((select v from ids where k='org_a'),
  '[{"product_id":"00000000-0000-0000-0000-000000000000","quantity":1,"unit_cost_cents":1}]', 'dddddddd-0000-0000-0000-000000000001')).id
  = (select v from ids where k='c1'), 'mesma chave devolve a mesma compra');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = 2.5, 'reenvio não soma estoque de novo');
select test.assert((select count(*) from public.financial_entries where purchase_id is not null) = 1, 'reenvio não duplica a conta a pagar');

-- Custo médio ponderado com saldo existente: 2,5 kg a 32,00 + 2,5 kg a 42,00 = 37,00
insert into ids select 'c2', (public.create_purchase((select v from ids where k='org_a'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 2.5, 'unit_cost_cents', 4200)),
  gen_random_uuid(), p_paid_account_id => (select v from ids where k='caixa'), p_paid_method => 'pix')).id;
select test.assert((select cost_cents from public.products where id = (select v from ids where k='cera')) = 3700, 'custo médio ponderado pelo saldo');
select test.assert((select status from public.financial_entry_overview where purchase_id = (select v from ids where k='c2')) = 'paid', 'compra à vista já nasce paga');
select test.assert((select balance_cents from public.financial_account_balances where id = (select v from ids where k='caixa')) = -10500, 'pagamento à vista sai do caixa');

-- Validações
select test.assert_fails($$select public.create_purchase((select v from ids where k='org_a'), '[]', gen_random_uuid())$$, 'compra sem itens é recusada', '22023');
select test.assert_fails($$select public.create_purchase((select v from ids where k='org_a'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='svc'), 'quantity', 1, 'unit_cost_cents', 1)), gen_random_uuid())$$,
  'serviço não é comprado como item', 'P0002');
select test.assert_fails($$select public.create_purchase((select v from ids where k='org_a'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 0, 'unit_cost_cents', 1)), gen_random_uuid())$$,
  'quantidade zero é recusada', '22023');
select test.assert_fails($$select public.create_purchase((select v from ids where k='org_a'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1, 'unit_cost_cents', -1)), gen_random_uuid())$$,
  'custo negativo é recusado', '22023');
select test.assert_fails($$select public.create_purchase((select v from ids where k='org_a'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1, 'unit_cost_cents', 1)), gen_random_uuid(), p_purchase_date => current_date + 5)$$,
  'compra com data futura é recusada', '22023');
select test.assert_fails($$insert into public.purchases (organization_id, number, purchase_date, idempotency_key, created_by) values ((select v from ids where k='org_a'), 99, current_date, gen_random_uuid(), auth.uid())$$,
  'insert direto em compras é bloqueado', '42501');
select test.assert_fails($$select public.inventory_reverse((select id from public.inventory_movements where purchase_id = (select v from ids where k='c1')), 'Errado', gen_random_uuid())$$,
  'entrada de compra só sai cancelando a compra', '55000');
select test.assert_fails($$select public.cancel_financial_entry((select id from public.financial_entries where purchase_id = (select v from ids where k='c1')), 'Errado')$$,
  'conta da compra só é cancelada pela compra', '55000');

-- ================================================================ cancelamento
select test.assert_fails($$select public.cancel_purchase((select v from ids where k='c2'), 'Errado')$$,
  'compra paga não é cancelada sem estornar o pagamento', '55000');
select test.assert_fails($$select public.cancel_purchase((select v from ids where k='c1'), '')$$, 'cancelar compra exige motivo', '22023');
select from public.inventory_move((select v from ids where k='cera'), 'production_consumption', 4, gen_random_uuid());
select test.assert((public.cancel_purchase((select v from ids where k='c1'), 'Nota lançada em dobro')).status = 'cancelled', 'compra cancelada');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='cera')) = -1.5,
  'cancelar estorna a entrada, mesmo se o material já foi usado');
select test.assert((select negative_authorized from public.inventory_movements where purchase_id = (select v from ids where k='c1') and movement_type = 'reversal'),
  'estorno que deixa negativo fica marcado');
select test.assert((select status from public.financial_entry_overview where purchase_id = (select v from ids where k='c1')) = 'cancelled', 'cancelar compra cancela a conta a pagar');
select from public.cancel_purchase((select v from ids where k='c1'), 'De novo');
select test.assert((select count(*) from public.inventory_movements where purchase_id = (select v from ids where k='c1') and movement_type = 'reversal') = 1,
  'cancelar duas vezes não estorna duas vezes');
select test.assert((select count(*) from public.purchases where organization_id = (select v from ids where k='org_a')) = 2, 'compra cancelada continua no histórico');

-- Lançamento manual com fornecedor
insert into ids select 'cat_aluguel', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Aluguel';
insert into ids select 'frete', (public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'Frete', 900,
  (select v from ids where k='cat_aluguel'), current_date, gen_random_uuid(), p_supplier_id => (select v from ids where k='forn'))).id;
select test.assert((select supplier_name from public.financial_entry_overview where id = (select v from ids where k='frete')) = 'Casa da Cera',
  'lançamento manual aceita fornecedor');

select test.assert((select items_summary from public.purchase_summaries where id = (select v from ids where k='c2')) = '2,5 kg Cera de soja', 'resumo da compra lista os itens');
select test.assert(not exists (
  select 1 from public.products p
  where p.organization_id = (select v from ids where k='org_a')
    and p.stock_qty <> coalesce((select sum(m.quantity) from public.inventory_movements m where m.product_id = p.id), 0)
), 'saldo de cada item bate com as movimentações');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(test.row_count('select * from public.purchases') = 0, 'outra empresa não vê compras');
select test.assert(test.row_count('select * from public.suppliers') = 0, 'outra empresa não vê fornecedores');
select test.assert_fails($$select public.create_purchase((select v from ids where k='org_b'), jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='cera'), 'quantity', 1, 'unit_cost_cents', 1)), gen_random_uuid())$$,
  'compra não usa item de outra empresa', 'P0002');
select test.assert_fails($$select public.create_purchase((select v from ids where k='org_b'), '[{"product_id":"00000000-0000-0000-0000-000000000000","quantity":1,"unit_cost_cents":1}]', gen_random_uuid(), p_supplier_id => (select v from ids where k='forn'))$$,
  'compra não usa fornecedor de outra empresa', 'P0002');
select test.assert_fails($$select public.create_purchase((select v from ids where k='org_a'), '[]', gen_random_uuid())$$, 'não compra em empresa alheia', 'P0002');
select test.assert_fails($$select public.cancel_purchase((select v from ids where k='c2'), 'Invasão')$$, 'não cancela compra alheia', 'P0002');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.purchases', 'anon não lê compras', '42501');
select test.assert_fails('select * from public.suppliers', 'anon não lê fornecedores', '42501');
select test.logout();

rollback;
