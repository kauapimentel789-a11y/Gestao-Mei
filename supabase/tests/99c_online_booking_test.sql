-- Testes da migração 0016: planos e agendamento pelo site.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

-- Dia de teste: daqui a 7 dias (fuso de Brasília), sempre no futuro.
create temp table dia as select ((now() at time zone 'America/Sao_Paulo')::date + 7) as d;
grant all on dia to authenticated, anon, service_role;

insert into ids values
  ('dani', test.create_user('dani@example.com', 'Dani')),
  ('eva',  test.create_user('eva@example.com', 'Eva')),
  ('ana',  test.create_user('ana@example.com', 'Ana'));

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production', 'ana-atelie')).id;
select test.logout();

select test.login_as((select v from ids where k='dani'));
insert into ids select 'org_d', (public.create_organization('Clínica Dani', 'services', 'clinica-dani', 0, 'health')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents, duration_minutes)
  values ((select v from ids where k='org_d'), 'service', 'Consulta', 20000, 60) returning id)
insert into ids select 'consulta', id from x;
with x as (insert into public.products (organization_id, item_type, name, price_cents)
  values ((select v from ids where k='org_d'), 'service', 'Retorno', 0) returning id)
insert into ids select 'retorno', id from x;
with x as (insert into public.products (organization_id, item_type, name, price_cents)
  values ((select v from ids where k='org_d'), 'raw_material', 'Luva', 100) returning id)
insert into ids select 'luva', id from x;
with x as (insert into public.customers (organization_id, name, phone) values ((select v from ids where k='org_d'), 'Maria Souza', '(11) 98888-7777') returning id)
insert into ids select 'maria', id from x;

-- ================================================================ planos
select test.assert((select plan = 'free' and plan_until is null and not online_booking_enabled
  from public.organizations where id = (select v from ids where k='org_d')), 'empresa nasce no grátis');
select test.assert_fails($$update public.organizations set plan = 'pro_max' where id = (select v from ids where k='org_d')$$,
  'dono não muda o próprio plano', '42501');
select test.assert_fails($$select app.set_plan('clinica-dani', 'pro_max')$$, 'usuário não chama set_plan', '42501');
select test.assert_fails($$update public.organizations set online_booking_enabled = true where id = (select v from ids where k='org_d')$$,
  'sem Pro Max não liga o agendamento', '42501');
select test.logout();

select test.assert((app.set_plan(' Clinica-Dani ', 'pro_max', (now() at time zone 'America/Sao_Paulo')::date - 1)).plan = 'pro_max', 'administrador ativa o plano');
select test.assert(app.effective_plan('pro_max', (now() at time zone 'America/Sao_Paulo')::date - 1) = 'free', 'plano vencido vale como grátis');
select test.assert(app.effective_plan('pro_max', (now() at time zone 'America/Sao_Paulo')::date) = 'pro_max', 'vale até o último dia pago');
select test.assert(app.effective_plan('pro', null) = 'pro', 'sem vencimento continua valendo');
select test.assert_fails($$select app.set_plan('clinica-dani', 'ouro')$$, 'plano inválido recusado', '22023');
select test.assert_fails($$select app.set_plan('nao-existe', 'pro')$$, 'slug inexistente', 'P0002');

select test.login_as((select v from ids where k='dani'));
select test.assert_fails($$update public.organizations set online_booking_enabled = true where id = (select v from ids where k='org_d')$$,
  'Pro Max vencido não liga o agendamento', '42501');
select test.logout();
select from app.set_plan('clinica-dani', 'pro_max', (now() at time zone 'America/Sao_Paulo')::date + 30);

select test.login_as((select v from ids where k='ana'));
select test.assert(test.affected($$update public.organizations set online_booking_enabled = true where id = (select v from ids where k='org_d')$$) = 0,
  'outra empresa não liga o agendamento alheio');
select test.logout();
select from app.set_plan('ana-atelie', 'pro_max');
select test.login_as((select v from ids where k='ana'));
select test.assert_fails($$update public.organizations set online_booking_enabled = true where id = (select v from ids where k='org_a')$$,
  'agendamento só em serviços', '23514');
select test.logout();

-- ================================================================ horário de funcionamento
select test.login_as((select v from ids where k='dani'));
select test.assert(test.affected($$update public.organizations set online_booking_enabled = true where id = (select v from ids where k='org_d')$$) = 1,
  'dono no Pro Max liga o agendamento');

select test.assert((select count(*) from public.set_business_hours((select v from ids where k='org_d'),
  (select jsonb_agg(jsonb_build_object('weekday', w, 'opens_at', '08:00', 'closes_at', '12:00')) from generate_series(0, 6) w)
  || (select jsonb_agg(jsonb_build_object('weekday', w, 'opens_at', '13:00', 'closes_at', '14:00')) from generate_series(1, 5) w))) = 12,
  'semana salva com dois turnos');
select test.assert((select count(*) from public.set_business_hours((select v from ids where k='org_d'),
  (select jsonb_agg(jsonb_build_object('weekday', w, 'opens_at', '08:00', 'closes_at', '12:00')) from generate_series(0, 6) w))) = 7,
  'salvar de novo substitui a semana');
select test.assert_fails($$select public.set_business_hours((select v from ids where k='org_d'), '[{"weekday": 1, "opens_at": "08:00", "closes_at": "12:00"}, {"weekday": 1, "opens_at": "11:00", "closes_at": "13:00"}]')$$,
  'turnos que se cruzam recusados', '22023');
select test.assert_fails($$select public.set_business_hours((select v from ids where k='org_d'), '[{"weekday": 1, "opens_at": "12:00", "closes_at": "08:00"}]')$$,
  'fecha antes de abrir recusado', '22023');
select test.assert_fails($$select public.set_business_hours((select v from ids where k='org_d'), '[{"weekday": 7, "opens_at": "08:00", "closes_at": "12:00"}]')$$,
  'dia inválido recusado', '22023');
select test.assert_fails($$select public.set_business_hours((select v from ids where k='org_d'), '[{"weekday": 1, "opens_at": "8h", "closes_at": "12:00"}]')$$,
  'hora mal escrita recusada', '22023');
select test.assert((select count(*) from public.business_hours where organization_id = (select v from ids where k='org_d')) = 7,
  'erro não apaga o horário salvo');

-- Já existe um atendimento das 9h às 10h no dia de teste.
select from public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'),
  ((select d from dia) + time '09:00') at time zone 'America/Sao_Paulo', gen_random_uuid(), (select v from ids where k='consulta'));
-- Um cancelado às 11h não ocupa o horário.
insert into ids select 'cancelado', (public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'),
  ((select d from dia) + time '11:00') at time zone 'America/Sao_Paulo', gen_random_uuid(), (select v from ids where k='consulta'))).id;
select from public.set_order_status((select v from ids where k='cancelado'), 'cancelled', 'Desmarcou');
select test.logout();

select test.login_as((select v from ids where k='eva'));
select test.assert((select count(*) from public.business_hours where organization_id = (select v from ids where k='org_d')) = 0,
  'quem não é da empresa não vê o horário');
select test.assert_fails($$select public.set_business_hours((select v from ids where k='org_d'), '[]')$$, 'quem não é da empresa não salva', 'P0002');
select test.logout();

-- ================================================================ página pública
select test.login_anon();
select test.assert_fails($$select public.public_booking_page('clinica-dani')$$, 'anon não chama a página direto', '42501');
select test.logout();
select test.login_as((select v from ids where k='dani'));
select test.assert_fails($$select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'), now(), 'X', '11999998888', gen_random_uuid(), repeat('a', 32))$$,
  'usuário logado não chama o agendamento direto', '42501');
select test.logout();

set role service_role;
select public.public_booking_page('clinica-dani') as pg \gset
select test.assert((:'pg'::jsonb ->> 'name') = 'Clínica Dani' and jsonb_array_length(:'pg'::jsonb -> 'weekdays') = 7, 'página com nome e dias de atendimento');
select test.assert(jsonb_array_length(:'pg'::jsonb -> 'services') = 1 and (:'pg'::jsonb -> 'services' -> 0 ->> 'duration_minutes')::int = 60,
  'só serviços ativos com preço, com a duração');
select test.assert(not (:'pg'::jsonb ? 'id') and not (:'pg'::jsonb -> 'services' -> 0 ? 'cost_cents'), 'página não expõe id da empresa nem custo');

select public.public_booking_slots('clinica-dani', (select v from ids where k='consulta'), (select d from dia)) as sl \gset
select test.assert((select string_agg(x ->> 'label', ',') from jsonb_array_elements(:'sl'::jsonb -> 'slots') x) = '08:00,10:00,10:30,11:00',
  'horários livres de 30 em 30, sem encostar no atendimento marcado');
select test.assert(jsonb_array_length((public.public_booking_slots('clinica-dani', (select v from ids where k='consulta'),
  (now() at time zone 'America/Sao_Paulo')::date + 61)) -> 'slots') = 0, 'nada além de 60 dias');
select test.assert(jsonb_array_length((public.public_booking_slots('clinica-dani', (select v from ids where k='consulta'),
  (now() at time zone 'America/Sao_Paulo')::date - 1)) -> 'slots') = 0, 'nada no passado');
select test.assert_fails($$select public.public_booking_slots('clinica-dani', (select v from ids where k='retorno'), (select d from dia))$$,
  'serviço sem preço não se agenda', 'P0002');
select test.assert_fails($$select public.public_booking_slots('clinica-dani', (select v from ids where k='luva'), (select d from dia))$$,
  'material não se agenda', 'P0002');
select test.assert_fails($$select public.public_booking_page('ana-atelie')$$, 'empresa que não é de serviços não tem página', 'P0002');

-- Agendar
insert into ids values ('k1', gen_random_uuid());
select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + time '10:00') at time zone 'America/Sao_Paulo', ' Carla ', '+55 21 97777-6666',
  (select v from ids where k='k1'), repeat('a', 32), 'Primeira vez') as b1 \gset
reset role;
select test.assert((:'b1'::jsonb ->> 'total_cents')::bigint = 20000 and (:'b1'::jsonb ->> 'service') = 'Consulta'
  and (:'b1'::jsonb ->> 'label') = to_char((select d from dia), 'DD/MM') || ' às 10:00', 'resposta com serviço, valor e horário');
select test.assert((select kind = 'service_order' and status = 'received' and channel = 'link' and created_by is null
  and scheduled_minutes = 60 and notes = 'Primeira vez'
  and (scheduled_for at time zone 'America/Sao_Paulo') = (select d from dia) + time '10:00'
  from public.orders where idempotency_key = (select v from ids where k='k1')), 'vira OS agendada pelo link');
select test.assert((select count(*) from public.customers where organization_id = (select v from ids where k='org_d') and phone_digits = '5521977776666' and created_by is null) = 1,
  'telefone novo cria cliente');
select test.assert((select count(*) from public.order_schedule_changes c join public.orders o on o.id = c.order_id
  where o.idempotency_key = (select v from ids where k='k1') and c.changed_by is null and c.reason = 'Agendado pelo site') = 1,
  'agenda registra a marcação pelo site');

set role service_role;
select test.assert((public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + time '10:00') at time zone 'America/Sao_Paulo', 'Carla', '21977776666',
  (select v from ids where k='k1'), repeat('a', 32)) ->> 'number') = (:'b1'::jsonb ->> 'number'), 'reenvio devolve o mesmo agendamento');
select test.assert_fails($$select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + time '10:30') at time zone 'America/Sao_Paulo', 'Davi', '31955554444', gen_random_uuid(), repeat('b', 32))$$,
  'horário que encosta no agendado é recusado', '55000');
select test.assert_fails($$select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + time '10:15') at time zone 'America/Sao_Paulo', 'Davi', '31955554444', gen_random_uuid(), repeat('b', 32))$$,
  'horário fora da grade é recusado', '55000');
select test.assert_fails($$select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + time '12:00') at time zone 'America/Sao_Paulo', 'Davi', '31955554444', gen_random_uuid(), repeat('b', 32))$$,
  'fora do funcionamento é recusado', '55000');
select test.assert_fails($$select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  now() + interval '10 minutes', 'Davi', '31955554444', gen_random_uuid(), repeat('b', 32))$$,
  'sem a antecedência mínima é recusado', '55000');
select test.assert_fails($$select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + time '11:00') at time zone 'America/Sao_Paulo', 'D', '31955554444', gen_random_uuid(), repeat('b', 32))$$,
  'nome curto recusado', '22023');
select test.assert_fails($$select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + time '11:00') at time zone 'America/Sao_Paulo', 'Davi', '1234', gen_random_uuid(), repeat('b', 32))$$,
  'telefone curto recusado', '22023');
select test.assert((public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + time '11:00') at time zone 'America/Sao_Paulo', 'Maria', '11 98888-7777', gen_random_uuid(), repeat('b', 32))) ? 'number',
  'horário de um cancelado pode ser agendado');
reset role;
select test.assert((select count(*) from public.orders where organization_id = (select v from ids where k='org_d') and customer_id = (select v from ids where k='maria')) = 3,
  'cliente existente casado pelo telefone');

set role service_role;
select test.assert((select string_agg(x ->> 'label', ',') from jsonb_array_elements(
  public.public_booking_slots('clinica-dani', (select v from ids where k='consulta'), (select d from dia)) -> 'slots') x) = '08:00',
  'horários ocupados somem da lista');

-- Limite: 5 por visitante por hora (o visitante "a" já enviou 1).
select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + n + time '08:00') at time zone 'America/Sao_Paulo', 'Carla', '21977776666', gen_random_uuid(), repeat('a', 32))
from generate_series(1, 4) n;
select test.assert_fails($$select public.public_book_appointment('clinica-dani', (select v from ids where k='consulta'),
  ((select d from dia) + 6 + time '08:00') at time zone 'America/Sao_Paulo', 'Carla', '21977776666', gen_random_uuid(), repeat('a', 32))$$,
  'sexto envio na hora é barrado', '54000');
reset role;

-- Plano vencido ou agendamento desligado: a página some.
select from app.set_plan('clinica-dani', 'pro');
select test.assert((select not online_booking_enabled from public.organizations where id = (select v from ids where k='org_d')),
  'sair do Pro Max desliga o agendamento');
set role service_role;
select test.assert_fails($$select public.public_booking_page('clinica-dani')$$, 'fora do Pro Max a página some', 'P0002');
reset role;

-- A empresa vê os agendamentos do site na agenda.
select test.login_as((select v from ids where k='dani'));
select test.assert((select count(*) from public.order_summaries where organization_id = (select v from ids where k='org_d') and channel = 'link' and scheduled_for is not null) = 6,
  'agendamentos do site aparecem na agenda');
select test.logout();

rollback;
