-- Testes da migração 0018: o cliente remarca ou cancela pelo próprio link.
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
  ('eva', test.create_user('eva@example.com', 'Eva'));

select test.login_as((select v from ids where k='bia'));
insert into ids select 'org', (public.create_organization('Studio Bia', 'services', 'studio-bia', 0, 'beauty')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents, duration_minutes)
  values ((select v from ids where k='org'), 'service', 'Corte', 5000, 60) returning id)
insert into ids select 'corte', id from x;
with x as (insert into public.customers (organization_id, name, phone) values ((select v from ids where k='org'), 'Jose Lima', '(11) 98888-7777') returning id)
insert into ids select 'jose', id from x;
select test.logout();
select from app.set_plan('studio-bia', 'pro_max');
select test.login_as((select v from ids where k='bia'));
update public.organizations set online_booking_enabled = true where id = (select v from ids where k='org');
select from public.set_business_hours((select v from ids where k='org'),
  (select jsonb_agg(jsonb_build_object('weekday', w, 'opens_at', '08:00', 'closes_at', '12:00')) from generate_series(0, 6) w));
select test.logout();

-- ================================================================ agendar devolve o código
set role service_role;
insert into ids values ('k1', gen_random_uuid());
select public.public_book_appointment('studio-bia', (select v from ids where k='corte'),
  ((select d from dia) + time '09:00') at time zone 'America/Sao_Paulo', 'Maria', '11988887777',
  (select v from ids where k='k1'), repeat('b', 32), 'Cabelo curto') as b1 \gset
select (:'b1'::jsonb ->> 'manage_token') as tok \gset
reset role;
select test.assert(:'tok' ~ '^[0-9a-f]{64}$', 'agendamento devolve um código de 64 caracteres');
insert into ids select 'o1', id from public.orders where idempotency_key = (select v from ids where k='k1');
select test.assert((select customer_id = (select v from ids where k='jose') and notes = E'Agendado como Maria\nCabelo curto'
  from public.orders where id = (select v from ids where k='o1')), 'mesmo telefone com outro nome fica anotado');
select test.assert((select token_hash = app.booking_token_hash(:'tok') from public.booking_access where order_id = (select v from ids where k='o1')),
  'banco guarda só o hash do código');
select test.assert((select count(*) from public.booking_access where token_hash = :'tok') = 0, 'o código em si não é gravado');

-- Mesmo nome (sem diferença de maiúsculas) não anota nada.
set role service_role;
insert into ids values ('k2', gen_random_uuid());
select public.public_book_appointment('studio-bia', (select v from ids where k='corte'),
  ((select d from dia) + time '11:00') at time zone 'America/Sao_Paulo', 'jose lima', '11988887777',
  (select v from ids where k='k2'), repeat('b', 32)) as b2 \gset
reset role;
select test.assert((select notes is null from public.orders where idempotency_key = (select v from ids where k='k2')), 'mesmo nome não anota');

-- Reenvio troca o código: o anterior deixa de valer.
set role service_role;
select public.public_book_appointment('studio-bia', (select v from ids where k='corte'),
  ((select d from dia) + time '11:00') at time zone 'America/Sao_Paulo', 'jose lima', '11988887777',
  (select v from ids where k='k2'), repeat('b', 32)) as b2b \gset
select test.assert((:'b2b'::jsonb ->> 'manage_token') <> (:'b2'::jsonb ->> 'manage_token'), 'reenvio devolve código novo');
select test.assert_fails(format('select public.public_booking_manage(%L)', :'b2'::jsonb ->> 'manage_token'), 'código antigo não vale mais', 'P0002');
select (:'b2b'::jsonb ->> 'manage_token') as tok2 \gset
reset role;

-- ================================================================ acesso
select test.login_as((select v from ids where k='bia'));
select test.assert_fails('select * from public.booking_access', 'dono não lê os códigos', '42501');
select test.assert_fails(format('select public.public_booking_manage(%L)', :'tok'), 'usuário logado não chama direto', '42501');
select test.logout();
select test.login_anon();
select test.assert_fails(format('select public.public_booking_cancel(%L)', :'tok'), 'anon não chama direto', '42501');
select test.logout();

-- ================================================================ ver
set role service_role;
select public.public_booking_manage(:'tok') as m \gset
select test.assert((:'m'::jsonb ->> 'status') = 'active' and (:'m'::jsonb ->> 'can_change')::boolean
  and (:'m'::jsonb ->> 'service') = 'Corte' and (:'m'::jsonb -> 'business' ->> 'name') = 'Studio Bia'
  and (:'m'::jsonb ->> 'label') = to_char((select d from dia), 'DD/MM') || ' às 09:00', 'página mostra o horário marcado');
select test.assert(not (:'m'::jsonb ? 'customer') and not ((:'m'::jsonb)::text like '%98888%') and not (:'m'::jsonb -> 'business' ? 'id'),
  'página não mostra telefone, cliente nem id da empresa');
select test.assert_fails($$select public.public_booking_manage('abc')$$, 'código mal formado', 'P0002');
select test.assert_fails(format('select public.public_booking_manage(%L)', repeat('0', 64)), 'código inexistente', 'P0002');

-- ================================================================ remarcar
select public.public_booking_manage_slots(:'tok', (select d from dia)) as sl \gset
select test.assert((select string_agg(x ->> 'label', ',') from jsonb_array_elements(:'sl'::jsonb -> 'slots') x) = '08:00,08:30,09:30,10:00',
  'livres contam o próprio horário como vago, sem repetir o atual');
select test.assert_fails(format('select public.public_booking_reschedule(%L, %L)', :'tok',
  ((select d from dia) + time '10:30') at time zone 'America/Sao_Paulo'), 'não remarca em cima de outro atendimento', '55000');
select public.public_booking_reschedule(:'tok', ((select d from dia) + time '08:30') at time zone 'America/Sao_Paulo') as r \gset
select test.assert((:'r'::jsonb ->> 'label') = to_char((select d from dia), 'DD/MM') || ' às 08:30', 'remarca para horário livre');
reset role;
select test.assert((select count(*) from public.order_schedule_changes where order_id = (select v from ids where k='o1')
  and changed_by is null and reason = 'Remarcado pelo cliente pelo site'
  and (from_at at time zone 'America/Sao_Paulo') = (select d from dia) + time '09:00') = 1, 'agenda registra a remarcação');

-- Limite de 5 remarcações por dia.
set role service_role;
select from public.public_booking_reschedule(:'tok', ((select d from dia) + time '08:00') at time zone 'America/Sao_Paulo');
select from public.public_booking_reschedule(:'tok', ((select d from dia) + time '09:00') at time zone 'America/Sao_Paulo');
select from public.public_booking_reschedule(:'tok', ((select d from dia) + time '08:00') at time zone 'America/Sao_Paulo');
select from public.public_booking_reschedule(:'tok', ((select d from dia) + time '09:00') at time zone 'America/Sao_Paulo');
select test.assert_fails(format('select public.public_booking_reschedule(%L, %L)', :'tok',
  ((select d from dia) + time '08:00') at time zone 'America/Sao_Paulo'), 'sexta remarcação no dia recusada', '54000');
reset role;

-- ================================================================ cancelar
-- Com pagamento registrado não cancela pelo link.
select test.login_as((select v from ids where k='bia'));
select from public.receive_order_payment((select id from public.orders where idempotency_key = (select v from ids where k='k2')),
  1000, (select id from public.financial_accounts where organization_id = (select v from ids where k='org') limit 1),
  'pix', (now() at time zone 'America/Sao_Paulo')::date, gen_random_uuid());
select test.logout();
set role service_role;
select test.assert_fails(format('select public.public_booking_cancel(%L)', :'tok2'), 'com pagamento não cancela pelo link', '55000');

select public.public_booking_cancel(:'tok') as c \gset
select test.assert((:'c'::jsonb ->> 'status') = 'cancelled' and not (:'c'::jsonb ->> 'can_change')::boolean, 'cliente cancela');
select test.assert((public.public_booking_cancel(:'tok') ->> 'status') = 'cancelled', 'cancelar de novo não dá erro');
select test.assert_fails(format('select public.public_booking_manage_slots(%L, %L)', :'tok', (select d from dia)),
  'cancelado não remarca', '55000');
reset role;
select test.assert((select status = 'cancelled' and cancel_reason = 'Cancelado pelo cliente pelo site' and updated_by is null
  from public.orders where id = (select v from ids where k='o1')), 'atendimento fica cancelado com motivo');
select test.assert((select count(*) from public.order_status_history where order_id = (select v from ids where k='o1')
  and to_status = 'cancelled' and changed_by is null) = 1, 'histórico registra o cancelamento');
select test.assert((select count(*) from public.orders where id = (select v from ids where k='o1')) = 1, 'nada é apagado');

-- ================================================================ prazo e plano
-- A menos de 2 horas do horário, o link só mostra.
update public.orders set scheduled_for = now() + interval '90 minutes'
where idempotency_key = (select v from ids where k='k2');
set role service_role;
select test.assert(not (public.public_booking_manage(:'tok2') ->> 'can_change')::boolean, 'perto do horário não muda mais');
select test.assert_fails(format('select public.public_booking_reschedule(%L, %L)', :'tok2',
  ((select d from dia) + time '10:00') at time zone 'America/Sao_Paulo'), 'perto do horário não remarca', '55000');
reset role;

-- Agendamento desligado: o link para.
select test.login_as((select v from ids where k='bia'));
update public.organizations set online_booking_enabled = false where id = (select v from ids where k='org');
select test.logout();
set role service_role;
select test.assert_fails(format('select public.public_booking_manage(%L)', :'tok2'), 'agendamento desligado fecha o link', 'P0002');
reset role;

rollback;
