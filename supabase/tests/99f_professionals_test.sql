-- Testes da migração 0019: profissionais.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

create temp table dia as select ((now() at time zone 'America/Sao_Paulo')::date + 7) as d;
grant all on dia to authenticated, anon, service_role;

insert into ids values
  ('bia', test.create_user('bia@example.com', 'Bia')),
  ('rui', test.create_user('rui@example.com', 'Rui')),
  ('eva', test.create_user('eva@example.com', 'Eva'));

select test.login_as((select v from ids where k='bia'));
insert into ids select 'org', (public.create_organization('Barbearia Bia', 'services', 'barbearia-bia', 0, 'beauty')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents, duration_minutes)
  values ((select v from ids where k='org'), 'service', 'Corte', 5000, 60) returning id)
insert into ids select 'corte', id from x;
with x as (insert into public.customers (organization_id, name, phone) values ((select v from ids where k='org'), 'Caio', '(11) 97777-1111') returning id)
insert into ids select 'caio', id from x;
select test.logout();
insert into public.organization_members (organization_id, user_id, role) values ((select v from ids where k='org'), (select v from ids where k='rui'), 'member');
select from app.set_plan('barbearia-bia', 'pro_max');
select test.login_as((select v from ids where k='bia'));
update public.organizations set online_booking_enabled = true where id = (select v from ids where k='org');
select from public.set_business_hours((select v from ids where k='org'),
  (select jsonb_agg(jsonb_build_object('weekday', w, 'opens_at', '08:00', 'closes_at', '11:00')) from generate_series(0, 6) w));

-- ================================================================ cadastro
insert into ids select 'ana', (public.save_professional((select v from ids where k='org'), null, '  Ana   Souza ')).id;
insert into ids select 'beto', (public.save_professional((select v from ids where k='org'), null, 'Beto')).id;
select test.assert((select name from public.professionals where id = (select v from ids where k='ana')) = 'Ana Souza', 'nome sem espaços sobrando');
select test.assert_fails($$select public.save_professional((select v from ids where k='org'), null, 'ana souza')$$, 'nome repetido recusado', '23505');
select test.assert_fails($$select public.save_professional((select v from ids where k='org'), null, 'A')$$, 'nome curto recusado', '22023');
select test.logout();

select test.login_as((select v from ids where k='rui'));
select test.assert((select count(*) from public.professionals where organization_id = (select v from ids where k='org')) = 2, 'membro vê os profissionais');
select test.assert_fails($$select public.save_professional((select v from ids where k='org'), null, 'Rui')$$, 'membro comum não cadastra', '42501');
select test.assert_fails($$insert into public.professionals (organization_id, name) values ((select v from ids where k='org'), 'X')$$, 'sem insert direto', '42501');
select test.logout();

select test.login_as((select v from ids where k='eva'));
select test.assert((select count(*) from public.professionals where organization_id = (select v from ids where k='org')) = 0, 'outra pessoa não vê');
select test.assert_fails($$select public.save_professional((select v from ids where k='org'), null, 'Eva')$$, 'outra pessoa não cadastra', 'P0002');
select test.logout();

-- ================================================================ agenda do dono
-- Atendimento das 8h com a Ana, marcado pelo dono.
select test.login_as((select v from ids where k='bia'));
insert into ids select 'o_ana', (public.book_appointment((select v from ids where k='org'), (select v from ids where k='caio'),
  ((select d from dia) + time '08:00') at time zone 'America/Sao_Paulo', gen_random_uuid(), (select v from ids where k='corte'))).id;
select test.assert((select professional_id is null from public.orders where id = (select v from ids where k='o_ana')), 'nasce sem profissional');
select from public.set_order_professional((select v from ids where k='o_ana'), (select v from ids where k='ana'));
select test.assert((select professional_name = 'Ana Souza' from public.order_summaries where id = (select v from ids where k='o_ana')),
  'agenda mostra o profissional');
select test.logout();

select test.login_as((select v from ids where k='eva'));
select test.assert_fails($$select public.set_order_professional((select v from ids where k='o_ana'), null)$$, 'outra pessoa não troca', 'P0002');
select test.logout();

-- ================================================================ página pública
set role service_role;
select test.assert((select string_agg(x ->> 'name', ',') from jsonb_array_elements(public.public_booking_page('barbearia-bia') -> 'professionals') x)
  = 'Ana Souza,Beto', 'página lista os profissionais ativos');

-- Ana ocupada às 8h; Beto livre.
select test.assert((select string_agg(x ->> 'label', ',') from jsonb_array_elements(public.public_booking_slots('barbearia-bia',
  (select v from ids where k='corte'), (select d from dia), (select v from ids where k='ana')) -> 'slots') x) = '09:00,09:30,10:00',
  'horários da Ana sem o das 8h');
select test.assert((select string_agg(x ->> 'label', ',') from jsonb_array_elements(public.public_booking_slots('barbearia-bia',
  (select v from ids where k='corte'), (select d from dia), (select v from ids where k='beto')) -> 'slots') x) = '08:00,08:30,09:00,09:30,10:00',
  'Beto livre às 8h');
select test.assert((select string_agg(x ->> 'label', ',') from jsonb_array_elements(public.public_booking_slots('barbearia-bia',
  (select v from ids where k='corte'), (select d from dia)) -> 'slots') x) = '08:00,08:30,09:00,09:30,10:00',
  'sem preferência: livre se alguém estiver livre');
select test.assert_fails($$select public.public_booking_slots('barbearia-bia', (select v from ids where k='corte'), (select d from dia), gen_random_uuid())$$,
  'profissional de fora recusado', 'P0002');

-- Sem preferência às 8h: fica com o Beto (Ana ocupada).
select public.public_book_appointment('barbearia-bia', (select v from ids where k='corte'),
  ((select d from dia) + time '08:00') at time zone 'America/Sao_Paulo', 'Duda', '11966665555', gen_random_uuid(), repeat('c', 32)) as b1 \gset
select test.assert((:'b1'::jsonb ->> 'professional') = 'Beto', 'sem preferência fica com quem está livre');
-- Agora ninguém às 8h.
select test.assert_fails(format('select public.public_book_appointment(%L, %L, %L, %L, %L, gen_random_uuid(), %L)', 'barbearia-bia',
  (select v from ids where k='corte'), ((select d from dia) + time '08:00') at time zone 'America/Sao_Paulo', 'Edu', '11955554444', repeat('d', 32)),
  'todos ocupados às 8h', '55000');
-- Escolhendo a Ana às 9h.
select public.public_book_appointment('barbearia-bia', (select v from ids where k='corte'),
  ((select d from dia) + time '09:00') at time zone 'America/Sao_Paulo', 'Edu', '11955554444', gen_random_uuid(), repeat('d', 32),
  null, (select v from ids where k='ana')) as b2 \gset
select test.assert((:'b2'::jsonb ->> 'professional') = 'Ana Souza', 'cliente escolhe a Ana');
select (:'b2'::jsonb ->> 'manage_token') as tok \gset
select test.assert((public.public_booking_manage(:'tok') ->> 'professional') = 'Ana Souza', 'link do cliente mostra o profissional');
-- Remarcar segue a agenda da Ana: 8h está ocupada para ela (mas não para o Beto, que também já tem 8h).
select test.assert((select string_agg(x ->> 'label', ',') from jsonb_array_elements(public.public_booking_manage_slots(:'tok', (select d from dia)) -> 'slots') x)
  = '09:30,10:00', 'remarcar mostra só os horários da Ana');
reset role;

-- ================================================================ atendimento sem profissional ocupa todos
select test.login_as((select v from ids where k='bia'));
select from public.book_appointment((select v from ids where k='org'), (select v from ids where k='caio'),
  ((select d from dia) + time '10:00') at time zone 'America/Sao_Paulo', gen_random_uuid(), (select v from ids where k='corte'));
select test.logout();
set role service_role;
select test.assert((select string_agg(x ->> 'label', ',') from jsonb_array_elements(public.public_booking_slots('barbearia-bia',
  (select v from ids where k='corte'), (select d from dia), (select v from ids where k='beto')) -> 'slots') x) = '09:00',
  'atendimento sem profissional bloqueia todos');
reset role;

-- ================================================================ desativar
select test.login_as((select v from ids where k='bia'));
select from public.save_professional((select v from ids where k='org'), (select v from ids where k='beto'), 'Beto', false);
select test.assert((select professional_name = 'Beto' from public.order_summaries o
  join public.orders x on x.id = o.id where x.professional_id = (select v from ids where k='beto') limit 1), 'desativado continua no atendimento');
select test.assert_fails($$select public.set_order_professional((select v from ids where k='o_ana'), (select v from ids where k='beto'))$$,
  'desativado não é escolhido', 'P0002');
insert into ids select 'beto2', (public.save_professional((select v from ids where k='org'), null, 'Beto')).id;
select test.assert((select count(*) from public.professionals where organization_id = (select v from ids where k='org')) = 3,
  'nome de desativado pode ser reusado; nada é apagado');
select test.logout();
set role service_role;
select test.assert(not ((public.public_booking_page('barbearia-bia') -> 'professionals')::text like '%' || (select v from ids where k='beto')::text || '%'),
  'desativado some da página');
reset role;

rollback;
