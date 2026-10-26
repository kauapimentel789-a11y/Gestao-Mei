-- Testes da migração 0025: exclusão de conta anonimiza, não apaga.
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
with x as (insert into public.customers (organization_id, name, phone) values ((select v from ids where k='org_e'), 'Rita', '11977776666') returning id)
insert into ids select 'rita', id from x;
select test.logout();

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org', (public.create_organization('Studio Ana', 'services', 'studio-ana', 0, 'health')).id;
update public.organizations set public_whatsapp = '11999990000', public_about = 'Atendimento com hora marcada'
  where id = (select v from ids where k='org');
with x as (insert into public.customers (organization_id, name, phone, document, address, birth_day, birth_month, notes)
  values ((select v from ids where k='org'), 'José Lima', '(11) 98888-7777', '12345678901', 'Rua A, 10', 12, 3, 'Alergia a dipirona') returning id)
insert into ids select 'jose', id from x;
with x as (insert into public.suppliers (organization_id, name, phone, email, contact_name)
  values ((select v from ids where k='org'), 'Dental Sul', '1133334444', 'vendas@dentalsul.com', 'Marcos') returning id)
insert into ids select 'forn', id from x;
with x as (insert into public.products (organization_id, item_type, name, price_cents, duration_minutes)
  values ((select v from ids where k='org'), 'service', 'Consulta', 20000, 60) returning id)
insert into ids select 'consulta', id from x;
insert into ids select 'os', (public.create_order((select v from ids where k='org'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='consulta'), 'quantity', 1)),
  gen_random_uuid(), 'service_order', (select v from ids where k='jose'), p_notes => 'Paciente José, retorno')).id;
select from public.add_service_note((select v from ids where k='os'), 'Dor no dente 36', gen_random_uuid());
select test.logout();

-- Ninguém do app chama a função, nem para si mesmo.
select test.login_as((select v from ids where k='ana'));
select test.assert_fails($$select public.close_user_account((select v from ids where k='ana'))$$,
  'usuário logado não executa close_user_account', '42501');
select test.logout();
select test.login_anon();
select test.assert_fails($$select public.close_user_account((select v from ids where k='ana'))$$,
  'anon não executa close_user_account', '42501');
select test.logout();

set role service_role;
select test.assert((public.close_user_account((select v from ids where k='ana')) ->> 'closed_organizations')::int = 1,
  'uma empresa encerrada');
reset role;

select test.assert((select name = 'Empresa excluída' and slug like 'excluida-%' and closed_at is not null
    and public_whatsapp is null and public_about is null and not public_orders_enabled and not online_booking_enabled
  from public.organizations where id = (select v from ids where k='org')), 'empresa anonimizada e páginas desligadas');
select test.assert((select name = 'Cliente removido' and phone is null and document is null and address is null
    and notes is null and birth_day is null
  from public.customers where id = (select v from ids where k='jose')), 'cliente anonimizado');
select test.assert((select name = 'Fornecedor removido' and phone is null and email is null and contact_name is null
  from public.suppliers where id = (select v from ids where k='forn')), 'fornecedor anonimizado');
select test.assert((select notes is null and total_cents = 20000 from public.orders where id = (select v from ids where k='os')),
  'pedido continua, sem observações');
select test.assert((select body = '[removido]' from public.service_notes where order_id = (select v from ids where k='os')),
  'anotação do atendimento removida');
select test.assert((select display_name = 'Conta excluída' from public.profiles where id = (select v from ids where k='ana')),
  'perfil anonimizado');
select test.assert((select raw_user_meta_data = '{}'::jsonb from auth.users where id = (select v from ids where k='ana')),
  'nome some do cadastro de login');

-- A outra empresa não muda.
select test.assert((select name = 'Rita' and phone = '11977776666' from public.customers where id = (select v from ids where k='rita')),
  'cliente de outra empresa intacto');
select test.assert((select name = 'Eva Doces' and closed_at is null from public.organizations where id = (select v from ids where k='org_e')),
  'outra empresa intacta');

-- Usuário que não existe.
set role service_role;
select test.assert_fails($$select public.close_user_account(gen_random_uuid())$$, 'usuário inexistente recusado', 'P0002');
reset role;

rollback;
