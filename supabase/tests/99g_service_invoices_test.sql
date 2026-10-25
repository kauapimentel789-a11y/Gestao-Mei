-- Testes da migração 0020: nota fiscal de serviço guiada.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('bia', test.create_user('bia@example.com', 'Bia')),
  ('eva', test.create_user('eva@example.com', 'Eva'));

select test.login_as((select v from ids where k='bia'));
insert into ids select 'org', (public.create_organization('Studio Bia', 'services', 'studio-bia', 0, 'beauty')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents, duration_minutes)
  values ((select v from ids where k='org'), 'service', 'Corte', 5000, 60) returning id)
insert into ids select 'corte', id from x;

-- ================================================================ CPF/CNPJ do cliente
with x as (insert into public.customers (organization_id, name, phone, document)
  values ((select v from ids where k='org'), 'Caio', '11977771111', '12345678901') returning id)
insert into ids select 'caio', id from x;
select test.assert(test.affected($$update public.customers set document = '12345678000199' where id = (select v from ids where k='caio')$$) = 1,
  'dono grava o CNPJ');
select test.assert_fails($$update public.customers set document = '123.456.789-01' where id = (select v from ids where k='caio')$$,
  'documento só com dígitos', '23514');
select test.assert_fails($$update public.customers set document = '1234' where id = (select v from ids where k='caio')$$,
  'documento com 11 ou 14 dígitos', '23514');

insert into ids select 'o1', (public.book_appointment((select v from ids where k='org'), (select v from ids where k='caio'),
  now() + interval '1 day', gen_random_uuid(), (select v from ids where k='corte'))).id;

-- ================================================================ registrar
insert into ids select 'n1', (public.register_service_invoice((select v from ids where k='o1'), ' 123 ', (now() at time zone 'America/Sao_Paulo')::date)).id;
select test.assert((select number = '123' and amount_cents = 5000 and cancelled_at is null from public.service_invoices where id = (select v from ids where k='n1')),
  'nota registrada com o valor do pedido');
select test.assert((public.register_service_invoice((select v from ids where k='o1'), '123', (now() at time zone 'America/Sao_Paulo')::date)).id
  = (select v from ids where k='n1'), 'repetir o mesmo número devolve a mesma nota');
select test.assert_fails($$select public.register_service_invoice((select v from ids where k='o1'), '124', (now() at time zone 'America/Sao_Paulo')::date)$$,
  'pedido com nota não recebe outra', '23505');
select test.assert_fails($$select public.register_service_invoice((select v from ids where k='o1'), '125', (now() at time zone 'America/Sao_Paulo')::date + 1)$$,
  'data no futuro recusada', '22023');
select test.assert_fails($$select public.register_service_invoice((select v from ids where k='o1'), 'nota 1', (now() at time zone 'America/Sao_Paulo')::date)$$,
  'número com espaço recusado', '22023');

insert into ids select 'o2', (public.book_appointment((select v from ids where k='org'), (select v from ids where k='caio'),
  now() + interval '2 days', gen_random_uuid(), (select v from ids where k='corte'))).id;
select test.assert_fails($$select public.register_service_invoice((select v from ids where k='o2'), '123', (now() at time zone 'America/Sao_Paulo')::date)$$,
  'número já usado em outro pedido', '23505');
select test.assert_fails($$insert into public.service_invoices (organization_id, order_id, number, issued_on, amount_cents, created_by)
  values ((select v from ids where k='org'), (select v from ids where k='o2'), '9', current_date, 1, (select v from ids where k='bia'))$$,
  'sem insert direto', '42501');

-- ================================================================ cancelar
select test.assert_fails($$select public.cancel_service_invoice((select v from ids where k='n1'), 'x')$$, 'cancelar pede motivo', '22023');
select from public.cancel_service_invoice((select v from ids where k='n1'), 'Valor errado');
select test.assert((select cancelled_at is not null and cancel_reason = 'Valor errado' from public.service_invoices where id = (select v from ids where k='n1')),
  'nota cancelada com motivo');
select test.assert((public.register_service_invoice((select v from ids where k='o1'), '126', (now() at time zone 'America/Sao_Paulo')::date)).number = '126',
  'depois de cancelar, o pedido recebe nota nova');
select test.assert((select count(*) from public.service_invoices where order_id = (select v from ids where k='o1')) = 2, 'nada é apagado');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='eva'));
select test.assert((select count(*) from public.service_invoices) = 0, 'outra pessoa não vê as notas');
select test.assert((select count(*) from public.customers where document is not null) = 0, 'outra pessoa não vê o documento');
select test.assert_fails($$select public.register_service_invoice((select v from ids where k='o2'), '200', current_date)$$,
  'outra pessoa não registra', 'P0002');
select test.assert_fails($$select public.cancel_service_invoice((select v from ids where k='n1'), 'Teste')$$,
  'outra pessoa não cancela', 'P0002');
select test.logout();

rollback;
