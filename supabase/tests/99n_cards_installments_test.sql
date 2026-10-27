-- Testes da migração 0027: cartões, compras parceladas e faturas.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create temp table nums (k text primary key, v bigint);
grant all on nums to authenticated, anon;

insert into ids values
  ('ana', test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

-- ================================================================ datas da fatura
-- Fecha dia 5, vence dia 12 (vencimento depois do fechamento: mesmo mês).
select test.assert(app.card_due_date(5, 12, '2026-10-04', 0) = '2026-10-12', 'compra antes do fechamento: fatura do mês');
select test.assert(app.card_due_date(5, 12, '2026-10-05', 0) = '2026-11-12', 'compra no dia do fechamento: fatura seguinte');
select test.assert(app.card_due_date(5, 12, '2026-10-20', 2) = '2027-01-12', 'terceira parcela duas faturas depois');
-- Fecha dia 25, vence dia 3 (vencimento antes do fechamento: mês seguinte).
select test.assert(app.card_due_date(25, 3, '2026-10-24', 0) = '2026-11-03', 'vence no mês seguinte ao fechamento');
select test.assert(app.card_due_date(25, 3, '2026-10-25', 0) = '2026-12-03', 'depois do fechamento vai uma fatura adiante');
-- Dia 31 em mês curto.
select test.assert(app.card_due_date(31, 10, '2027-02-27', 0) = '2027-03-10', 'fechamento 31 vira 28 em fevereiro');
select test.assert(app.card_due_date(31, 10, '2027-02-28', 0) = '2027-04-10', 'no último dia de fevereiro já fechou');
select test.assert(app.card_due_date(20, 31, '2027-01-10', 1) = '2027-02-28', 'vencimento 31 vira 28 em fevereiro');
select test.assert(app.card_closing_date(25, 3, '2026-11-01') = '2026-10-25', 'fechamento da fatura que vence no mês seguinte');
select test.assert(app.card_closing_date(5, 12, '2026-11-01') = '2026-11-05', 'fechamento no mesmo mês do vencimento');

-- ================================================================ cartão
select test.login_as((select v from ids where k='ana'));
insert into ids select 'pes', (public.create_personal_space()).id;
insert into ids select 'conta', id from public.financial_accounts where organization_id = (select v from ids where k='pes') and name = 'Conta do banco';
insert into ids select 'mercado', id from public.financial_categories where organization_id = (select v from ids where k='pes') and name = 'Mercado';
insert into ids select 'casa', id from public.financial_categories where organization_id = (select v from ids where k='pes') and name = 'Moradia';

with x as (insert into public.credit_cards (organization_id, name, closing_day, due_day, limit_cents)
  values ((select v from ids where k='pes'), 'Nubank', 5, 12, 500000) returning id)
insert into ids select 'card', id from x;
select test.assert_fails($$insert into public.credit_cards (organization_id, name, closing_day, due_day)
  values ((select v from ids where k='pes'), 'X', 40, 12)$$, 'dia de fechamento inválido', '23514');
select test.assert_fails($$insert into public.credit_cards (organization_id, name, closing_day, due_day)
  values ((select v from ids where k='pes'), ' nubank ', 1, 10)$$, 'nome de cartão repetido', '23505');

-- ================================================================ compra parcelada no cartão
insert into ids select 'tv', (public.create_installment_purchase((select v from ids where k='pes'), 'Televisão', 100000, 3,
  (select v from ids where k='casa'), current_date, 'aaaaaaaa-0000-0000-0000-000000000001', (select v from ids where k='card'))).id;
select test.assert((public.create_installment_purchase((select v from ids where k='pes'), 'Outra', 5, 1,
  (select v from ids where k='casa'), current_date, 'aaaaaaaa-0000-0000-0000-000000000001')).id = (select v from ids where k='tv'),
  'mesma chave devolve a mesma compra');
select test.assert((select count(*) from public.financial_entries where installment_plan_id = (select v from ids where k='tv')) = 3,
  'uma parcela por mês');
select test.assert((select string_agg(amount_cents::text, ',' order by installment_number) from public.financial_entries
  where installment_plan_id = (select v from ids where k='tv')) = '33334,33333,33333', 'centavos que sobram na primeira parcela');
select test.assert((select string_agg(description, ',' order by installment_number) from public.financial_entries
  where installment_plan_id = (select v from ids where k='tv')) = 'Televisão (1/3),Televisão (2/3),Televisão (3/3)', 'descrição com a parcela');
select test.assert((select bool_and(due_date = app.card_due_date(5, 12, current_date, installment_number - 1) and competence_date = due_date
  and card_id = (select v from ids where k='card') and paid_cents = 0)
  from public.financial_entries where installment_plan_id = (select v from ids where k='tv')), 'parcelas vencem nas faturas certas');
select test.assert((select count(*) from public.card_statements where card_id = (select v from ids where k='card')) = 3, 'três faturas');
select test.assert((select balance_cents from public.financial_account_balances where id = (select v from ids where k='conta')) = 0,
  'compra no cartão não tira dinheiro da conta');

-- Compra de uma vez, mesma fatura da primeira parcela.
select from public.create_installment_purchase((select v from ids where k='pes'), 'Mercado', 20000, 1,
  (select v from ids where k='mercado'), current_date, gen_random_uuid(), (select v from ids where k='card'));
select test.assert((select total_cents = 53334 and open_cents = 53334 and installments = 2
  from public.card_statements where card_id = (select v from ids where k='card')
    and statement_month = date_trunc('month', app.card_due_date(5, 12, current_date, 0))), 'fatura soma as parcelas do mês');

select test.assert_fails($$select public.create_installment_purchase((select v from ids where k='pes'), 'X', 2, 3,
  (select v from ids where k='casa'), current_date, gen_random_uuid())$$, 'menos de um centavo por parcela', '22023');
select test.assert_fails($$select public.create_installment_purchase((select v from ids where k='pes'), 'X', 1000, 49,
  (select v from ids where k='casa'), current_date, gen_random_uuid())$$, 'no máximo 48 parcelas', '22023');
select test.assert_fails($$select public.cancel_financial_entry((select id from public.financial_entries
  where installment_plan_id = (select v from ids where k='tv') and installment_number = 2), 'engano')$$,
  'parcela não se cancela sozinha', '55000');

-- ================================================================ carnê (sem cartão)
insert into ids select 'carne', (public.create_installment_purchase((select v from ids where k='pes'), 'Sofá no carnê', 120000, 12,
  (select v from ids where k='casa'), current_date, gen_random_uuid(), null, '2027-01-31')).id;
select test.assert((select string_agg(to_char(due_date, 'MM-DD'), ',' order by installment_number) from public.financial_entries
  where installment_plan_id = (select v from ids where k='carne') and installment_number <= 3) = '01-31,02-28,03-31',
  'carnê vence todo mês, respeitando o fim do mês');
select test.assert((select card_id is null and installment_count = 12 from public.financial_entry_overview
  where installment_plan_id = (select v from ids where k='carne') and installment_number = 1), 'visão mostra a parcela');

-- ================================================================ pagar fatura
select test.assert_fails($$select public.pay_card_statement((select v from ids where k='card'),
  date_trunc('month', app.card_due_date(5, 12, current_date, 0))::date, 60000, (select v from ids where k='conta'), 'pix', current_date, gen_random_uuid())$$,
  'não paga mais que a fatura', '22023');
insert into nums select 'cp1', (public.pay_card_statement((select v from ids where k='card'),
  date_trunc('month', app.card_due_date(5, 12, current_date, 0))::date, 40000, (select v from ids where k='conta'), 'pix', current_date,
  'bbbbbbbb-0000-0000-0000-000000000001')).id;
select test.assert((public.pay_card_statement((select v from ids where k='card'),
  date_trunc('month', app.card_due_date(5, 12, current_date, 0))::date, 40000, (select v from ids where k='conta'), 'pix', current_date,
  'bbbbbbbb-0000-0000-0000-000000000001')).id = (select v from nums where k='cp1'), 'mesma chave não paga duas vezes');
select test.assert((select paid_cents = 40000 and open_cents = 13334 and status in ('partial', 'open')
  from public.card_statements where card_id = (select v from ids where k='card')
    and statement_month = date_trunc('month', app.card_due_date(5, 12, current_date, 0))), 'pagamento parcial da fatura');
select test.assert((select sum(amount_cents) from public.financial_payments where card_payment_id = (select v from nums where k='cp1')) = 40000,
  'baixas somam o pago');
select test.assert((select balance_cents from public.financial_account_balances where id = (select v from ids where k='conta')) = -40000,
  'pagamento da fatura sai da conta');
select test.assert((select paid_cents from public.financial_entries where installment_plan_id = (select v from ids where k='tv')
  and installment_number = 1) = 33334, 'paga primeiro a parcela mais antiga');

select test.assert_fails($$select public.cancel_installment_purchase((select v from ids where k='tv'), 'desisti')$$,
  'compra com parcela paga não se cancela', '55000');

-- ================================================================ estorno
select test.assert_fails($$select public.reverse_card_payment((select v from nums where k='cp1'), 'x')$$, 'estorno pede motivo', '22023');
select from public.reverse_card_payment((select v from nums where k='cp1'), 'paguei errado');
select test.assert((select reversed_at is not null from public.card_payments where id = (select v from nums where k='cp1')), 'pagamento estornado');
select test.assert((select balance_cents from public.financial_account_balances where id = (select v from ids where k='conta')) = 0,
  'dinheiro volta para a conta');
select test.assert((select paid_cents = 0 from public.card_statements where card_id = (select v from ids where k='card')
  and statement_month = date_trunc('month', app.card_due_date(5, 12, current_date, 0))), 'fatura volta a ficar em aberto');
select test.assert((select count(*) from public.financial_payments where card_payment_id = (select v from nums where k='cp1')) = 4,
  'baixas e estornos ficam no histórico');
select from public.reverse_card_payment((select v from nums where k='cp1'), 'de novo');
select test.assert((select count(*) from public.financial_payments where card_payment_id = (select v from nums where k='cp1')) = 4,
  'estornar de novo não duplica');

-- ================================================================ cancelar compra
select from public.cancel_installment_purchase((select v from ids where k='tv'), 'devolvi a TV');
select test.assert((select bool_and(cancelled_at is not null) from public.financial_entries where installment_plan_id = (select v from ids where k='tv')),
  'parcelas canceladas');
select test.assert((select cancelled_at is not null from public.installment_plans where id = (select v from ids where k='tv')), 'compra cancelada');
select test.assert((select count(*) from public.card_statements where card_id = (select v from ids where k='card')) = 1,
  'faturas sem a compra cancelada');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(not exists (select 1 from public.credit_cards where id = (select v from ids where k='card')), 'outra pessoa não vê o cartão');
select test.assert(not exists (select 1 from public.card_statements where card_id = (select v from ids where k='card')), 'nem as faturas');
select test.assert(not exists (select 1 from public.installment_plans where organization_id = (select v from ids where k='pes')), 'nem as compras');
select test.assert_fails($$select public.create_installment_purchase((select v from ids where k='pes'), 'Invasão', 1000, 2,
  (select v from ids where k='casa'), current_date, gen_random_uuid(), (select v from ids where k='card'))$$, 'não compra no cartão de outro');
select test.assert_fails($$select public.pay_card_statement((select v from ids where k='card'), date_trunc('month', current_date)::date,
  100, (select v from ids where k='conta'), 'pix', current_date, gen_random_uuid())$$, 'não paga fatura de outro');
update public.credit_cards set limit_cents = 1 where id = (select v from ids where k='card');
insert into ids select 'pes_b', (public.create_personal_space()).id;
select test.assert_fails($$insert into public.credit_cards (organization_id, name, closing_day, due_day)
  values ((select v from ids where k='pes'), 'Meu', 1, 10)$$, 'não cria cartão no espaço de outro', '42501');
select test.logout();
select test.assert((select limit_cents from public.credit_cards where id = (select v from ids where k='card')) = 500000,
  'não muda cartão de outro');

rollback;
