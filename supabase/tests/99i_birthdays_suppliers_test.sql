-- Testes da migração 0022: aniversário e endereço do cliente, fornecedor completo.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create temp table d (k text primary key, v date);
grant all on d to authenticated, anon;
insert into d values
  ('hoje', (now() at time zone 'America/Sao_Paulo')::date),
  ('em3', (now() at time zone 'America/Sao_Paulo')::date + 3),
  ('em40', (now() at time zone 'America/Sao_Paulo')::date + 40),
  ('ontem', (now() at time zone 'America/Sao_Paulo')::date - 1);

insert into ids values
  ('ana', test.create_user('ana@example.com', 'Ana')),
  ('eva', test.create_user('eva@example.com', 'Eva'));

select test.login_as((select v from ids where k='eva'));
insert into ids select 'org_e', (public.create_organization('Eva Doces', 'production')).id;
insert into public.customers (organization_id, name, birth_day, birth_month)
  select (select v from ids where k='org_e'), 'Cliente da Eva', extract(day from v), extract(month from v) from d where k='hoje';
select test.logout();

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org', (public.create_organization('Ana Bolos', 'production')).id;

-- ================================================================ aniversário
with x as (insert into public.customers (organization_id, name, phone, address, birth_day, birth_month, birth_year)
  select (select v from ids where k='org'), 'Bia', '11977771111', 'Rua das Flores, 10', extract(day from v), extract(month from v), 1990
  from d where k='hoje' returning id)
insert into ids select 'bia', id from x;
with x as (insert into public.customers (organization_id, name, birth_day, birth_month)
  select (select v from ids where k='org'), 'Caio', extract(day from v), extract(month from v) from d where k='em3' returning id)
insert into ids select 'caio', id from x;
insert into public.customers (organization_id, name, birth_day, birth_month)
  select (select v from ids where k='org'), 'Duda', extract(day from v), extract(month from v) from d where k='em40';
insert into public.customers (organization_id, name, birth_day, birth_month)
  select (select v from ids where k='org'), 'Ivo', extract(day from v), extract(month from v) from d where k='ontem';
insert into public.customers (organization_id, name) values ((select v from ids where k='org'), 'Sem data');

select test.assert((select address = 'Rua das Flores, 10' from public.customers where id = (select v from ids where k='bia')), 'endereço gravado');

select test.assert_fails($$insert into public.customers (organization_id, name, birth_day) values ((select v from ids where k='org'), 'X', 10)$$,
  'dia sem mês recusado', '23514');
select test.assert_fails($$insert into public.customers (organization_id, name, birth_day, birth_month) values ((select v from ids where k='org'), 'X', 31, 4)$$,
  '31/04 recusado', '23514');
select test.assert_fails($$insert into public.customers (organization_id, name, birth_day, birth_month, birth_year) values ((select v from ids where k='org'), 'X', 29, 2, 2001)$$,
  '29/02/2001 recusado', '23514');
select test.assert_fails($$insert into public.customers (organization_id, name, birth_year) values ((select v from ids where k='org'), 'X', 1990)$$,
  'ano sem dia e mês recusado', '23514');
select test.assert_fails($$update public.customers set address = ' ' where id = (select v from ids where k='bia')$$,
  'endereço vazio recusado', '23514');
select test.assert(test.affected($$insert into public.customers (organization_id, name, birth_day, birth_month, birth_year) values ((select v from ids where k='org'), 'Léo', 29, 2, 2000)$$) = 1,
  '29/02/2000 aceito');
select test.assert(test.affected($$update public.customers set birth_day = null, birth_month = null, birth_year = null where name = 'Léo'$$) = 1,
  'aniversário pode ser apagado do cadastro');

select test.assert(app.birthday_in(2027, 2, 29) = '2027-02-28', '29/02 vira 28/02 em ano não bissexto');
select test.assert(app.birthday_in(2028, 2, 29) = '2028-02-29', '29/02 fica em ano bissexto');

select test.assert((select array_agg(name order by days_until, name) from public.upcoming_birthdays((select v from ids where k='org'), 30)) = array['Bia', 'Caio'],
  'próximos 30 dias: hoje e daqui a 3, sem a outra empresa');
select test.assert((select days_until = 0 and turning = extract(year from (select v from d where k='hoje'))::integer - 1990
  from public.upcoming_birthdays((select v from ids where k='org')) where name = 'Bia'), 'hoje, com a idade que vai fazer');
select test.assert((select days_until = 3 and turning is null from public.upcoming_birthdays((select v from ids where k='org')) where name = 'Caio'),
  'sem ano, sem idade');
select test.assert((select count(*) from public.upcoming_birthdays((select v from ids where k='org'), 366) where name = 'Ivo') = 1,
  'aniversário de ontem fica para o ano que vem');
select test.assert((select days_until between 364 and 365 from public.upcoming_birthdays((select v from ids where k='org'), 366) where name = 'Ivo'),
  'ontem = daqui a quase um ano');
select test.assert((select count(*) from public.upcoming_birthdays((select v from ids where k='org_e'), 30)) = 0,
  'aniversários de outra empresa não aparecem');
select test.logout();

select test.login_anon();
select test.assert_fails($$select * from public.upcoming_birthdays((select v from ids where k='org'))$$, 'anônimo não lê aniversários', '42501');
select test.logout();

-- ================================================================ fornecedor
select test.login_as((select v from ids where k='ana'));
with x as (insert into public.suppliers (organization_id, name, contact_name, address, supplies)
  values ((select v from ids where k='org'), 'Casa do Confeiteiro', 'Seu Zé', 'Av. Brasil, 500', 'Farinha, açúcar, embalagens') returning id)
insert into ids select 'forn', id from x;
select test.assert((select contact_name = 'Seu Zé' and supplies like 'Farinha%' from public.suppliers where id = (select v from ids where k='forn')),
  'fornecedor com contato, endereço e o que vende');
select test.assert(test.affected($$update public.suppliers set address = 'Av. Brasil, 600' where id = (select v from ids where k='forn')$$) = 1,
  'endereço do fornecedor atualizado');
select test.assert_fails($$update public.suppliers set supplies = '' where id = (select v from ids where k='forn')$$,
  'o que vende não fica em branco', '23514');
select test.logout();

select test.login_as((select v from ids where k='eva'));
select test.assert((select count(*) from public.suppliers where id = (select v from ids where k='forn')) = 0, 'outra empresa não vê o fornecedor');
select test.logout();

rollback;
