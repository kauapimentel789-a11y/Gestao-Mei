-- Testes da migração 0026: espaço pessoal (Minhas finanças).
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

insert into ids values
  ('ana', test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno')),
  ('dono', test.create_user('dono@example.com', 'Dono'));
select app.add_platform_admin('dono@example.com');

-- ================================================================ criação
select test.login_anon();
select test.assert_fails($$select public.create_personal_space()$$, 'visitante não cria espaço pessoal', '42501');
select test.logout();

select test.login_as((select v from ids where k='ana'));
insert into ids select 'emp', (public.create_organization('Ana Ateliê', 'production', 'ana-atelie')).id;
insert into ids select 'pes', (public.create_personal_space()).id;
select test.assert((public.create_personal_space()).id = (select v from ids where k='pes'), 'chamar de novo devolve o mesmo espaço');
select test.assert((select count(*) from public.organizations where created_by = (select v from ids where k='ana') and kind = 'personal') = 1,
  'um espaço pessoal por pessoa');
select test.assert((select kind = 'personal' and business_type is null and name = 'Minhas finanças' and enabled_modules = '{}'
  from public.organizations where id = (select v from ids where k='pes')), 'espaço pessoal sem tipo de negócio');
select test.assert((select role = 'owner' from public.organization_members
  where organization_id = (select v from ids where k='pes') and user_id = (select v from ids where k='ana')), 'quem cria é dona');
select test.assert((select kind = 'business' from public.organizations where id = (select v from ids where k='emp')), 'empresa continua empresa');

-- ================================================================ dados padrão
select test.assert((select count(*) from public.financial_accounts where organization_id = (select v from ids where k='pes')) = 2,
  'nasce com Carteira e Conta do banco');
select test.assert((select count(*) from public.financial_categories where organization_id = (select v from ids where k='pes')) = 19,
  'nasce com categorias de pessoa física');
select test.assert(not exists (select 1 from public.financial_categories where organization_id = (select v from ids where k='pes') and name = 'Vendas'),
  'sem categorias da empresa');
select test.assert((select count(*) from public.financial_categories where organization_id = (select v from ids where k='emp')) = 14,
  'empresa segue com as categorias dela');

-- ================================================================ regras do espaço pessoal
select test.assert_fails($$update public.organizations set public_orders_enabled = true where id = (select v from ids where k='pes')$$,
  'espaço pessoal não tem link de encomenda', '23514');
select test.assert_fails($$update public.organizations set practice_area = 'health' where id = (select v from ids where k='pes')$$,
  'espaço pessoal não tem área de atendimento', '23514');
select test.assert_fails($$update public.organizations set online_booking_enabled = true where id = (select v from ids where k='pes')$$,
  'espaço pessoal não tem agendamento online');
update public.organizations set name = 'Finanças da Ana' where id = (select v from ids where k='pes');
select test.assert((select name from public.organizations where id = (select v from ids where k='pes')) = 'Finanças da Ana', 'nome pode mudar');

-- ================================================================ lançamentos
insert into ids select 'carteira', id from public.financial_accounts where organization_id = (select v from ids where k='pes') and name = 'Carteira';
insert into ids select 'mercado', id from public.financial_categories where organization_id = (select v from ids where k='pes') and name = 'Mercado';
insert into ids select 'salario', id from public.financial_categories where organization_id = (select v from ids where k='pes') and name = 'Salário';
insert into ids select 'g1', (public.create_financial_entry((select v from ids where k='pes'), 'payable', 'Feira do mês', 35000,
  (select v from ids where k='mercado'), current_date, gen_random_uuid(), p_notes => 'banana e café',
  p_paid_account_id => (select v from ids where k='carteira'), p_paid_method => 'cash')).id;
select from public.create_financial_entry((select v from ids where k='pes'), 'receivable', 'Salário de outubro', 300000,
  (select v from ids where k='salario'), current_date, gen_random_uuid(),
  p_paid_account_id => (select v from ids where k='carteira'), p_paid_method => 'pix');
select test.assert((select balance_cents from public.financial_account_balances where id = (select v from ids where k='carteira')) = 265000,
  'saldo da carteira: salário menos mercado');
select test.assert((select (s ->> 'received_cents')::bigint = 300000 and (s ->> 'paid_cents')::bigint = 35000
  from (select public.finance_summary((select v from ids where k='pes'), current_date - 1, current_date + 1) as s) x), 'resumo do mês');
select test.assert_fails($$select public.create_financial_entry((select v from ids where k='pes'), 'payable', 'Errado', 100,
  (select id from public.financial_categories where organization_id = (select v from ids where k='emp') limit 1), current_date, gen_random_uuid())$$,
  'categoria da empresa não vale no pessoal', 'P0002');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(not exists (select 1 from public.organizations where id = (select v from ids where k='pes')), 'outra pessoa não vê o espaço');
select test.assert(not exists (select 1 from public.financial_entries where organization_id = (select v from ids where k='pes')), 'nem os lançamentos');
select test.assert(not exists (select 1 from public.financial_accounts where organization_id = (select v from ids where k='pes')), 'nem as contas');
select test.assert_fails($$select public.create_financial_entry((select v from ids where k='pes'), 'payable', 'Invasão', 100,
  (select v from ids where k='mercado'), current_date, gen_random_uuid())$$, 'não lança no espaço de outra pessoa');
insert into ids select 'pes_b', (public.create_personal_space()).id;
select test.assert((select v from ids where k='pes_b') <> (select v from ids where k='pes'), 'cada pessoa tem o seu');
select test.logout();

-- ================================================================ painel do dono
select test.login_as((select v from ids where k='dono'));
create temp table d as select public.admin_dashboard(30) as j;
select test.assert((select (j #>> '{organizations,total}')::int = 1 from d), 'painel conta só empresas');
select test.assert((select (j #>> '{users,with_personal}')::int = 2 from d), 'painel mostra espaços pessoais à parte');
select test.assert((select (j #>> '{users,without_company}')::int = 2 from d), 'quem só tem o pessoal conta como sem empresa');
select test.logout();

-- ================================================================ exclusão de conta
set role service_role;
select test.assert((public.close_user_account((select v from ids where k='ana')) ->> 'closed_organizations')::int = 2,
  'empresa e espaço pessoal encerrados');
reset role;
select test.assert((select description = 'Lançamento removido' and notes is null from public.financial_entries where id = (select v from ids where k='g1')),
  'lançamento pessoal sem descrição');
select test.assert((select amount_cents = 35000 from public.financial_entries where id = (select v from ids where k='g1')), 'valor continua');

rollback;
