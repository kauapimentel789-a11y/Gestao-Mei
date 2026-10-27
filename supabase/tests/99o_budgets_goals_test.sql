-- Testes da migração 0028: orçamento por categoria e metas.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create temp table nums (k text primary key, v bigint);
grant all on nums to authenticated, anon;

insert into ids values
  ('ana', test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='ana'));
insert into ids select 'pes', (public.create_personal_space()).id;
insert into ids select 'conta', id from public.financial_accounts where organization_id = (select v from ids where k='pes') and name = 'Conta do banco';
insert into ids select 'mercado', id from public.financial_categories where organization_id = (select v from ids where k='pes') and name = 'Mercado';
insert into ids select 'lazer', id from public.financial_categories where organization_id = (select v from ids where k='pes') and name = 'Lazer';
insert into ids select 'salario', id from public.financial_categories where organization_id = (select v from ids where k='pes') and direction = 'receivable' limit 1;

-- ================================================================ orçamento
with x as (insert into public.budgets (organization_id, category_id, amount_cents)
  values ((select v from ids where k='pes'), (select v from ids where k='mercado'), 80000) returning id)
insert into ids select 'b_mercado', id from x;
select test.assert_fails($$insert into public.budgets (organization_id, category_id, amount_cents)
  values ((select v from ids where k='pes'), (select v from ids where k='mercado'), 1000)$$, 'um orçamento por categoria', '23505');
select test.assert_fails($$insert into public.budgets (organization_id, category_id, amount_cents)
  values ((select v from ids where k='pes'), (select v from ids where k='salario'), 1000)$$, 'orçamento só em categoria de gasto', '22023');
select test.assert_fails($$insert into public.budgets (organization_id, category_id, amount_cents)
  values ((select v from ids where k='pes'), (select v from ids where k='lazer'), 0)$$, 'limite precisa ser positivo', '23514');

-- Gastos deste mês: um pago, um em aberto, um cancelado; e um do mês passado.
select from public.create_financial_entry((select v from ids where k='pes'), 'payable', 'Feira', 30000,
  (select v from ids where k='mercado'), current_date, gen_random_uuid());
insert into ids select 'e_cancel', (public.create_financial_entry((select v from ids where k='pes'), 'payable', 'Errado', 99900,
  (select v from ids where k='mercado'), current_date, gen_random_uuid())).id;
select from public.cancel_financial_entry((select v from ids where k='e_cancel'), 'lançado errado');
select from public.create_financial_entry((select v from ids where k='pes'), 'payable', 'Supermercado', 25000,
  (select v from ids where k='mercado'), current_date, gen_random_uuid());
select from public.create_financial_entry((select v from ids where k='pes'), 'payable', 'Mês passado', 60000,
  (select v from ids where k='mercado'), (current_date - interval '1 month')::date, gen_random_uuid());

select test.assert((select budget_id = (select v from ids where k='b_mercado') and amount_cents = 80000 and alert_pct = 80 and spent_cents = 55000
  and avg_prev_cents = 20000
  from public.budget_overview((select v from ids where k='pes'), current_date) where category_id = (select v from ids where k='mercado')),
  'gasto do mês soma pagos e em aberto, sem cancelados; média dos 3 meses anteriores');
select test.assert((select budget_id is null and spent_cents = 0
  from public.budget_overview((select v from ids where k='pes'), current_date) where category_id = (select v from ids where k='lazer')),
  'categoria sem orçamento aparece sem limite');
select test.assert(not exists (select 1 from public.budget_overview((select v from ids where k='pes'), current_date)
  where category_id = (select v from ids where k='salario')), 'só categorias de gasto');
select test.assert((select category_id from public.budget_overview((select v from ids where k='pes'), current_date) limit 1)
  = (select v from ids where k='mercado'), 'com orçamento vem primeiro');

update public.budgets set active = false where id = (select v from ids where k='b_mercado');
select test.assert((select budget_id is null from public.budget_overview((select v from ids where k='pes'), current_date)
  where category_id = (select v from ids where k='mercado')), 'orçamento desligado some do resumo');
update public.budgets set active = true, amount_cents = 50000 where id = (select v from ids where k='b_mercado');

-- ================================================================ metas
with x as (insert into public.goals (organization_id, name, target_cents, target_date)
  values ((select v from ids where k='pes'), 'Viagem', 300000, current_date + 365) returning id)
insert into ids select 'viagem', id from x;

insert into nums select 'c1', (public.add_goal_contribution((select v from ids where k='viagem'), 50000, current_date, 'primeira',
  'cccccccc-0000-0000-0000-000000000001')).id;
select test.assert((public.add_goal_contribution((select v from ids where k='viagem'), 50000, current_date, 'de novo',
  'cccccccc-0000-0000-0000-000000000001')).id = (select v from nums where k='c1'), 'mesma chave não guarda duas vezes');
select from public.add_goal_contribution((select v from ids where k='viagem'), -20000, current_date, 'precisei', gen_random_uuid());
select test.assert((select saved_cents from public.goal_progress where id = (select v from ids where k='viagem')) = 30000,
  'guardado = guardei - retirei');
select test.assert_fails($$select public.add_goal_contribution((select v from ids where k='viagem'), -30001, current_date, null, gen_random_uuid())$$,
  'não retira mais do que guardou', '22023');
select test.assert_fails($$select public.add_goal_contribution((select v from ids where k='viagem'), 100, current_date + 1, null, gen_random_uuid())$$,
  'data no futuro', '22023');
select test.assert_fails($$select public.add_goal_contribution((select v from ids where k='viagem'), 0, current_date, null, gen_random_uuid())$$,
  'valor zero', '22023');
select test.assert((select balance_cents from public.financial_account_balances where id = (select v from ids where k='conta')) = 0,
  'meta não mexe no saldo das contas');

-- Estorno: o depósito de 500 não pode sair, porque só há 300 guardados.
select test.assert_fails($$select public.reverse_goal_contribution((select v from nums where k='c1'), 'engano')$$,
  'estorno não deixa a meta negativa', '22023');
select from public.add_goal_contribution((select v from ids where k='viagem'), 20000, current_date, null, gen_random_uuid());
select test.assert_fails($$select public.reverse_goal_contribution((select v from nums where k='c1'), 'x')$$, 'estorno pede motivo', '22023');
insert into nums select 'r1', (public.reverse_goal_contribution((select v from nums where k='c1'), 'lancei errado')).id;
select test.assert((public.reverse_goal_contribution((select v from nums where k='c1'), 'de novo')).id = (select v from nums where k='r1'),
  'estornar de novo não duplica');
select test.assert_fails($$select public.reverse_goal_contribution((select v from nums where k='r1'), 'estorno do estorno')$$,
  'estorno não se estorna', '55000');
select test.assert((select saved_cents from public.goal_progress where id = (select v from ids where k='viagem')) = 0
  and (select count(*) from public.goal_contributions where goal_id = (select v from ids where k='viagem')) = 4,
  'estorno é registro novo, o original fica');
select test.assert_fails($$delete from public.goal_contributions where id = (select v from nums where k='c1')$$, 'movimento não se apaga', '42501');

update public.goals set archived_at = now() where id = (select v from ids where k='viagem');
select test.assert_fails($$select public.add_goal_contribution((select v from ids where k='viagem'), 100, current_date, null, gen_random_uuid())$$,
  'meta arquivada não recebe movimento', '55000');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(not exists (select 1 from public.budgets where organization_id = (select v from ids where k='pes')), 'outra pessoa não vê o orçamento');
select test.assert(not exists (select 1 from public.goal_progress where organization_id = (select v from ids where k='pes')), 'nem as metas');
select test.assert(not exists (select 1 from public.goal_contributions where organization_id = (select v from ids where k='pes')), 'nem os movimentos');
select test.assert_fails($$select * from public.budget_overview((select v from ids where k='pes'), current_date)$$, 'nem o resumo do orçamento');
select test.assert_fails($$select public.add_goal_contribution((select v from ids where k='viagem'), 100, current_date, null, gen_random_uuid())$$,
  'não guarda na meta de outro');
select test.assert_fails($$insert into public.goals (organization_id, name, target_cents)
  values ((select v from ids where k='pes'), 'Invasão', 100)$$, 'não cria meta no espaço de outro', '42501');
update public.budgets set amount_cents = 1 where organization_id = (select v from ids where k='pes');
select test.logout();
select test.assert((select amount_cents from public.budgets where id = (select v from ids where k='b_mercado')) = 50000, 'não muda orçamento de outro');

-- ================================================================ exclusão de conta
update public.organizations set closed_at = now() where id = (select v from ids where k='pes');
select test.assert((select name = 'Meta removida' and notes is null from public.goals where id = (select v from ids where k='viagem')),
  'meta pessoal anonimizada');
select test.assert(not exists (select 1 from public.goal_contributions where organization_id = (select v from ids where k='pes') and note is not null),
  'observações dos movimentos apagadas');

rollback;
