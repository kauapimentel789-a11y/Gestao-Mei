-- Testes da migração 0005: financeiro essencial.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create temp table nums (k text primary key, v bigint);
grant all on nums to authenticated, anon;

insert into ids values
  ('ana',   test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
select test.logout();
select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_b', (public.create_organization('Bruno Reparos', 'services')).id;
select test.logout();

-- ================================================================ dados padrão
select test.login_as((select v from ids where k='ana'));
insert into ids select 'caixa', id from public.financial_accounts where organization_id = (select v from ids where k='org_a') and name = 'Caixa';
select test.assert((select count(*) from public.financial_accounts where organization_id = (select v from ids where k='org_a')) = 1, 'empresa nasce com a conta Caixa');
select test.assert((select count(*) from public.financial_categories where organization_id = (select v from ids where k='org_a')) = 14, 'empresa nasce com categorias padrão');
select test.assert(exists (select 1 from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Matéria-prima e embalagens'), 'categorias seguem o tipo de negócio');
insert into ids select 'cat_vendas', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Vendas';
insert into ids select 'cat_aluguel', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Aluguel';
insert into ids select 'cat_compra', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Matéria-prima e embalagens';
insert into ids select 'cat_retirada', id from public.financial_categories where organization_id = (select v from ids where k='org_a') and name = 'Retirada do dono';

with x as (
  insert into public.financial_accounts (organization_id, name, kind, opening_balance_cents, opening_date)
  values ((select v from ids where k='org_a'), 'Banco', 'bank', 100000, current_date - 30) returning id)
insert into ids select 'banco', id from x;
select test.assert_fails($$update public.financial_accounts set opening_balance_cents = 1 where id = (select v from ids where k='banco')$$,
  'saldo inicial não muda depois de criado', '42501');
select test.assert_fails($$delete from public.financial_accounts where id = (select v from ids where k='banco')$$,
  'conta não é apagada', '42501');
select test.assert_fails($$insert into public.financial_categories (organization_id, name, direction, nature) values ((select v from ids where k='org_a'), 'X', 'receivable', 'operating_expense')$$,
  'natureza precisa combinar com a direção', '23514');
select test.assert_fails($$insert into public.financial_categories (organization_id, name, direction, nature) values ((select v from ids where k='org_a'), ' aluguel ', 'payable', 'operating_expense')$$,
  'categoria repetida é recusada', '23505');

-- ================================================================ títulos e baixas
insert into ids select 'aluguel', (public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'Aluguel de outubro',
  120000, (select v from ids where k='cat_aluguel'), current_date + 5, 'bbbbbbbb-0000-0000-0000-000000000001')).id;
select test.assert((select status from public.financial_entry_overview where id = (select v from ids where k='aluguel')) = 'pending', 'título novo está pendente');
select test.assert((select competence_date = due_date from public.financial_entries where id = (select v from ids where k='aluguel')), 'competência padrão = vencimento');
select test.assert((public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'outro', 1,
  (select v from ids where k='cat_aluguel'), current_date, 'bbbbbbbb-0000-0000-0000-000000000001')).id = (select v from ids where k='aluguel'),
  'mesma chave devolve o mesmo título');
select test.assert((select count(*) from public.financial_entries where organization_id = (select v from ids where k='org_a')) = 1, 'reenvio não duplica título');

insert into nums select 'p1', (public.settle_financial_entry((select v from ids where k='aluguel'), 50000, (select v from ids where k='banco'),
  'pix', current_date, 'cccccccc-0000-0000-0000-000000000001')).id;
select test.assert((select status || ':' || open_cents from public.financial_entry_overview where id = (select v from ids where k='aluguel')) = 'partial:70000', 'pagamento parcial reduz o aberto');
select test.assert((public.settle_financial_entry((select v from ids where k='aluguel'), 50000, (select v from ids where k='banco'),
  'pix', current_date, 'cccccccc-0000-0000-0000-000000000001')).id = (select v from nums where k='p1'), 'mesma chave devolve a mesma baixa');
select test.assert((select paid_cents from public.financial_entries where id = (select v from ids where k='aluguel')) = 50000, 'reenvio não paga duas vezes');
select test.assert_fails($$select public.settle_financial_entry((select v from ids where k='aluguel'), 70001, (select v from ids where k='banco'), 'pix', current_date, gen_random_uuid())$$,
  'baixa maior que o aberto é recusada', '22023');
select test.assert_fails($$select public.settle_financial_entry((select v from ids where k='aluguel'), 0, (select v from ids where k='banco'), 'pix', current_date, gen_random_uuid())$$,
  'baixa zero é recusada', '22023');
select test.assert_fails($$select public.settle_financial_entry((select v from ids where k='aluguel'), 10, (select v from ids where k='banco'), 'pix', current_date + 10, gen_random_uuid())$$,
  'baixa no futuro é recusada', '22023');
select from public.settle_financial_entry((select v from ids where k='aluguel'), 70000, (select v from ids where k='caixa'), 'cash', current_date, gen_random_uuid());
select test.assert((select status from public.financial_entry_overview where id = (select v from ids where k='aluguel')) = 'paid', 'quitado fica pago');

-- Estorno
select test.assert((public.reverse_financial_payment((select v from nums where k='p1'), 'Pix devolvido', gen_random_uuid())).amount_cents = -50000,
  'estorno grava baixa negativa');
select test.assert((select status || ':' || open_cents from public.financial_entry_overview where id = (select v from ids where k='aluguel')) = 'partial:50000', 'estorno reabre o valor');
select from public.reverse_financial_payment((select v from nums where k='p1'), 'De novo', gen_random_uuid());
select test.assert((select count(*) from public.financial_payments where reverses_payment_id = (select v from nums where k='p1')) = 1, 'estornar duas vezes não duplica');
select test.assert_fails($$select public.reverse_financial_payment((select id from public.financial_payments where reverses_payment_id is not null limit 1), 'xxx', gen_random_uuid())$$,
  'estorno não é estornado', '55000');
select test.assert_fails($$select public.cancel_financial_entry((select v from ids where k='aluguel'), 'Erro')$$,
  'título com baixa não é cancelado', '55000');

-- À vista e cancelamento
insert into ids select 'retirada', (public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'Retirada', 30000,
  (select v from ids where k='cat_retirada'), current_date, gen_random_uuid(), p_paid_account_id => (select v from ids where k='caixa'), p_paid_method => 'cash')).id;
select test.assert((select status from public.financial_entry_overview where id = (select v from ids where k='retirada')) = 'paid', 'lançamento à vista nasce pago');
select test.assert((select count(*) from public.financial_payments where entry_id = (select v from ids where k='retirada')) = 1, 'à vista gera uma baixa só');

insert into ids select 'velho', (public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'Cera', 8000,
  (select v from ids where k='cat_compra'), current_date - 3, gen_random_uuid())).id;
select test.assert((select status from public.financial_entry_overview where id = (select v from ids where k='velho')) = 'overdue', 'vencido é derivado da data');
select test.assert_fails($$select public.cancel_financial_entry((select v from ids where k='velho'), '')$$, 'cancelar exige motivo', '22023');
select test.assert((public.cancel_financial_entry((select v from ids where k='velho'), 'Lançado em dobro')).cancelled_at is not null, 'cancela título sem baixa');
select test.assert((select status || ':' || open_cents from public.financial_entry_overview where id = (select v from ids where k='velho')) = 'cancelled:0', 'cancelado não fica em aberto');
select test.assert_fails($$select public.settle_financial_entry((select v from ids where k='velho'), 10, (select v from ids where k='banco'), 'pix', current_date, gen_random_uuid())$$,
  'título cancelado não recebe baixa', '55000');

-- Validações
select test.assert_fails($$select public.create_financial_entry((select v from ids where k='org_a'), 'receivable', 'X venda', 100, (select v from ids where k='cat_aluguel'), current_date, gen_random_uuid())$$,
  'categoria de despesa não serve para receita', 'P0002');
select test.assert_fails($$select public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'Conta', -5, (select v from ids where k='cat_aluguel'), current_date, gen_random_uuid())$$,
  'valor negativo é recusado', '22023');
select test.assert_fails($$select public.create_financial_entry((select v from ids where k='org_a'), 'payable', 'Conta', 5, (select v from ids where k='cat_aluguel'), current_date, null)$$,
  'chave de idempotência é obrigatória', '22023');
select test.assert_fails($$insert into public.financial_entries (organization_id, direction, description, amount_cents, competence_date, due_date, category_id, created_by)
  values ((select v from ids where k='org_a'), 'payable', 'X', 1, current_date, current_date, (select v from ids where k='cat_aluguel'), auth.uid())$$,
  'insert direto em títulos é bloqueado', '42501');
select test.assert_fails($$update public.financial_entries set paid_cents = 0 where id = (select v from ids where k='aluguel')$$,
  'update direto em títulos é bloqueado', '42501');
select test.assert_fails($$delete from public.financial_payments$$, 'baixa não é apagada', '42501');

-- ================================================================ pedido → título → recebimento
insert into ids select 'o1', (public.create_order((select v from ids where k='org_a'),
  '[{"description":"Cesta","quantity":2,"unit_price_cents":5000}]', gen_random_uuid())).id;
select test.assert(not exists (select 1 from public.financial_entries where order_id = (select v from ids where k='o1')), 'criar pedido não lança receita sozinho');
select from public.receive_order_payment((select v from ids where k='o1'), 4000, (select v from ids where k='caixa'), 'pix', current_date, gen_random_uuid());
select from public.receive_order_payment((select v from ids where k='o1'), 3000, (select v from ids where k='caixa'), 'cash', current_date, gen_random_uuid());
select test.assert((select count(*) from public.financial_entries where order_id = (select v from ids where k='o1')) = 1, 'pedido tem um título só, mesmo com dois recebimentos');
select test.assert((select amount_cents || ':' || open_cents || ':' || status from public.financial_entry_overview where order_id = (select v from ids where k='o1')) = '10000:3000:partial',
  'recebimentos abatem o título do pedido');
select test.assert((select category_id from public.financial_entries where order_id = (select v from ids where k='o1')) = (select v from ids where k='cat_vendas'),
  'título do pedido usa a categoria de vendas');
select test.assert_fails($$select public.receive_order_payment((select v from ids where k='o1'), 3001, (select v from ids where k='caixa'), 'pix', current_date, gen_random_uuid())$$,
  'receber mais que o total do pedido é recusado', '22023');

select from public.update_order((select v from ids where k='o1'), '[{"description":"Cesta","quantity":3,"unit_price_cents":5000}]');
select test.assert((select amount_cents from public.financial_entries where order_id = (select v from ids where k='o1')) = 15000, 'editar o pedido atualiza o título');
select test.assert_fails($$select public.update_order((select v from ids where k='o1'), '[{"description":"Cesta","quantity":1,"unit_price_cents":5000}]')$$,
  'total do pedido não fica abaixo do já recebido', '55000');
select test.assert_fails($$select public.set_order_status((select v from ids where k='o1'), 'cancelled', 'Desistiu')$$,
  'pedido com recebimento não é cancelado sem estornar', '55000');
select test.assert_fails($$select public.cancel_financial_entry((select id from public.financial_entries where order_id = (select v from ids where k='o1')), 'Teste')$$,
  'título de pedido segue o pedido', '55000');

insert into ids select 'o2', (public.create_order((select v from ids where k='org_a'),
  '[{"description":"Vela","quantity":1,"unit_price_cents":3000}]', gen_random_uuid())).id;
insert into nums select 'p_o2', (public.receive_order_payment((select v from ids where k='o2'), 3000, (select v from ids where k='caixa'), 'pix', current_date, gen_random_uuid())).id;
select from public.reverse_financial_payment((select v from nums where k='p_o2'), 'Cliente desistiu', gen_random_uuid());
select from public.set_order_status((select v from ids where k='o2'), 'cancelled', 'Cliente desistiu');
select test.assert((select status from public.financial_entry_overview where order_id = (select v from ids where k='o2')) = 'cancelled', 'cancelar pedido cancela o título');
select test.assert_fails($$select public.receive_order_payment((select v from ids where k='o2'), 100, (select v from ids where k='caixa'), 'pix', current_date, gen_random_uuid())$$,
  'pedido cancelado não recebe', '55000');

-- ================================================================ transferências
insert into nums select 't1', (public.create_financial_transfer((select v from ids where k='org_a'), (select v from ids where k='banco'),
  (select v from ids where k='caixa'), 20000, current_date, gen_random_uuid(), 'Saque')).id;
select test.assert_fails($$select public.create_financial_transfer((select v from ids where k='org_a'), (select v from ids where k='caixa'), (select v from ids where k='caixa'), 1, current_date, gen_random_uuid())$$,
  'transferência para a mesma conta é recusada', '22023');
select test.assert((public.reverse_financial_transfer((select v from nums where k='t1'), 'Lançado errado')).from_account_id = (select v from ids where k='caixa'),
  'estorno de transferência inverte as contas');
select from public.reverse_financial_transfer((select v from nums where k='t1'), 'De novo');
select test.assert((select count(*) from public.financial_transfers where reverses_transfer_id = (select v from nums where k='t1')) = 1, 'estornar transferência duas vezes não duplica');
select from public.create_financial_transfer((select v from ids where k='org_a'), (select v from ids where k='banco'), (select v from ids where k='caixa'), 10000, current_date, gen_random_uuid());

-- Saldos: Banco 1000,00 − 500,00 (pix) + 500,00 (estorno) − 100,00 (transf.) = 900,00
-- Caixa: −700,00 (aluguel) −300,00 (retirada) +40,00 +30,00 (pedido) +30,00 −30,00 (o2 e estorno) +100,00 = −830,00
select test.assert((select balance_cents from public.financial_account_balances where id = (select v from ids where k='banco')) = 90000, 'saldo do banco = inicial + baixas + transferências');
select test.assert((select balance_cents from public.financial_account_balances where id = (select v from ids where k='caixa')) = -83000, 'saldo do caixa considera saídas, entradas e estornos');

-- ================================================================ resumo do período
select public.finance_summary((select v from ids where k='org_a'), current_date - 31, current_date + 31) as s \gset
select test.assert((:'s'::jsonb ->> 'received_cents')::bigint = 7000 + 3000 - 3000, 'recebido no período (estorno abate)');
select test.assert((:'s'::jsonb ->> 'paid_cents')::bigint = 50000 + 70000 - 50000 + 30000, 'pago no período (estorno abate)');
select test.assert((:'s'::jsonb ->> 'revenue_cents')::bigint = 15000, 'faturamento por competência ignora pedido cancelado');
select test.assert((:'s'::jsonb ->> 'operating_expense_cents')::bigint = 120000, 'despesa operacional não inclui retirada nem compra cancelada');
select test.assert((:'s'::jsonb ->> 'owner_withdrawal_cents')::bigint = 30000, 'retirada do dono fica separada');
select test.assert((:'s'::jsonb ->> 'transfers_cents')::bigint = 50000, 'transferências aparecem à parte');
select test.assert((:'s'::jsonb ->> 'open_receivable_cents')::bigint = 8000, 'a receber em aberto');
select test.assert((:'s'::jsonb ->> 'open_payable_cents')::bigint = 50000, 'a pagar em aberto');
select test.assert_fails($$select public.finance_summary((select v from ids where k='org_a'), current_date, current_date - 1)$$, 'período invertido é recusado', '22023');

-- Reconciliação: pago de cada título = soma das baixas
select test.assert(not exists (
  select 1 from public.financial_entries e
  where e.paid_cents <> coalesce((select sum(p.amount_cents) from public.financial_payments p where p.entry_id = e.id), 0)
), 'valor pago de cada título bate com as baixas');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(test.row_count('select * from public.financial_entries') = 0, 'outra empresa não vê títulos');
select test.assert(test.row_count('select * from public.financial_payments') = 0, 'outra empresa não vê baixas');
select test.assert(test.row_count($$select * from public.financial_accounts where organization_id = (select v from ids where k='org_a')$$) = 0, 'outra empresa não vê contas');
select test.assert(test.row_count('select * from public.financial_account_balances') = 1, 'cada empresa vê só os próprios saldos');
select test.assert(exists (select 1 from public.financial_categories where name = 'Serviços prestados'), 'serviços nasce com categoria própria');
select test.assert_fails($$select public.settle_financial_entry((select v from ids where k='aluguel'), 1, (select v from ids where k='banco'), 'pix', current_date, gen_random_uuid())$$,
  'outra empresa não baixa título', 'P0002');
select test.assert_fails($$select public.receive_order_payment((select v from ids where k='o1'), 1, (select v from ids where k='caixa'), 'pix', current_date, gen_random_uuid())$$,
  'outra empresa não recebe pedido', 'P0002');
select test.assert_fails($$select public.finance_summary((select v from ids where k='org_a'), current_date, current_date)$$,
  'outra empresa não lê o resumo', 'P0002');
select test.assert_fails($$insert into public.financial_accounts (organization_id, name) values ((select v from ids where k='org_a'), 'Invasão')$$,
  'outra empresa não cria conta', '42501');
-- Conta própria, título alheio: a baixa precisa usar conta da mesma empresa.
insert into ids select 'caixa_b', id from public.financial_accounts where organization_id = (select v from ids where k='org_b');
insert into ids select 'cat_b', id from public.financial_categories where organization_id = (select v from ids where k='org_b') and name = 'Aluguel';
insert into ids select 'tit_b', (public.create_financial_entry((select v from ids where k='org_b'), 'payable', 'Aluguel', 100, (select v from ids where k='cat_b'), current_date, gen_random_uuid())).id;
select test.assert_fails($$select public.settle_financial_entry((select v from ids where k='tit_b'), 100, (select v from ids where k='caixa'), 'pix', current_date, gen_random_uuid())$$,
  'baixa não usa conta de outra empresa', 'P0002');
select test.assert_fails($$select public.create_financial_entry((select v from ids where k='org_b'), 'payable', 'X conta', 100, (select v from ids where k='cat_aluguel'), current_date, gen_random_uuid())$$,
  'título não usa categoria de outra empresa', 'P0002');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.financial_entries', 'anon não lê títulos', '42501');
select test.assert_fails('select * from public.financial_account_balances', 'anon não lê saldos', '42501');
select test.logout();

rollback;
