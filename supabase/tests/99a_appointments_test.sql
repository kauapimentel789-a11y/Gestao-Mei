-- Testes da migração 0014: atendimentos com hora marcada.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('dani', test.create_user('dani@example.com', 'Dani')),
  ('ana',  test.create_user('ana@example.com', 'Ana'));

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
select test.assert_fails($$select public.create_organization('Ana Doces', 'production', null, 0, 'health')$$,
  'área de atendimento só em serviços', '22023');
select test.assert_fails($$update public.organizations set practice_area = 'health' where id = (select v from ids where k='org_a')$$,
  'produção não vira consultório', '23514');
select test.logout();

select test.login_as((select v from ids where k='dani'));
insert into ids select 'org_d', (public.create_organization('Clínica Dani', 'services', 'clinica-dani', 0, 'health')).id;
select test.assert((select practice_area from public.organizations where id = (select v from ids where k='org_d')) = 'health', 'empresa nasce com a área');
select test.assert((select count(*) from public.organization_members where organization_id = (select v from ids where k='org_d') and role = 'owner') = 1, 'dono continua sendo criado');
select test.assert(test.affected($$update public.organizations set practice_area = 'other' where id = (select v from ids where k='org_d')$$) = 1, 'dono muda a área');
select test.assert_fails($$update public.organizations set practice_area = 'x' where id = (select v from ids where k='org_d')$$, 'área inválida recusada', '23514');
update public.organizations set practice_area = 'health' where id = (select v from ids where k='org_d');

with x as (insert into public.products (organization_id, item_type, name, price_cents, duration_minutes)
  values ((select v from ids where k='org_d'), 'service', 'Limpeza', 15000, 40) returning id)
insert into ids select 'limpeza', id from x;
with x as (insert into public.products (organization_id, item_type, name, price_cents)
  values ((select v from ids where k='org_d'), 'service', 'Avaliação', 10000) returning id)
insert into ids select 'avaliacao', id from x;
select test.assert_fails($$insert into public.products (organization_id, item_type, name, duration_minutes) values ((select v from ids where k='org_d'), 'service', 'X', 2)$$,
  'duração muito curta recusada no cadastro', '23514');
with x as (insert into public.customers (organization_id, name, phone) values ((select v from ids where k='org_d'), 'Maria Souza', '(11) 98888-7777') returning id)
insert into ids select 'maria', id from x;

-- ================================================================ marcar
insert into ids select 'a1', (public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'),
  '2026-11-10 14:00-03', 'bbbbbbbb-0000-0000-0000-0000000000a1', (select v from ids where k='limpeza'))).id;
select test.assert((select kind = 'service_order' and status = 'received' and scheduled_minutes = 40 and total_cents = 15000
  from public.orders where id = (select v from ids where k='a1')), 'atendimento vira OS agendada com duração e preço do cadastro');
select test.assert((select count(*) from public.order_schedule_changes where order_id = (select v from ids where k='a1') and from_at is null) = 1,
  'marcação fica no histórico da agenda');
select test.assert((public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'),
  '2026-11-10 14:00-03', 'bbbbbbbb-0000-0000-0000-0000000000a1', (select v from ids where k='limpeza'))).id = (select v from ids where k='a1'),
  'mesma chave devolve o mesmo atendimento');
select test.assert((select count(*) from public.orders where organization_id = (select v from ids where k='org_d')) = 1, 'reenvio não duplica');

insert into ids select 'a2', (public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'),
  '2026-11-11 09:00-03', gen_random_uuid(), (select v from ids where k='avaliacao'), p_price_cents => 8000, p_minutes => 30)).id;
select test.assert((select scheduled_minutes = 30 and total_cents = 8000 from public.orders where id = (select v from ids where k='a2')),
  'duração e preço podem ser trocados');
insert into ids select 'a3', (public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'),
  '2026-11-12 09:00-03', gen_random_uuid(), p_description => 'Retorno', p_price_cents => 0)).id;
select test.assert((select scheduled_minutes = 60 and total_cents = 0 from public.orders where id = (select v from ids where k='a3')),
  'serviço avulso sem duração usa 1 h');

select test.assert_fails($$select public.book_appointment((select v from ids where k='org_d'), null, now(), gen_random_uuid(), (select v from ids where k='limpeza'))$$,
  'cliente obrigatório', '22023');
select test.assert_fails($$select public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'), null, gen_random_uuid(), (select v from ids where k='limpeza'))$$,
  'horário obrigatório', '22023');
select test.assert_fails($$select public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'), now(), gen_random_uuid())$$,
  'sem serviço nem descrição recusado', '22023');
select test.assert_fails($$select public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'), now(), gen_random_uuid(), (select v from ids where k='limpeza'), p_minutes => 2000)$$,
  'duração inválida recusada', '22023');

-- ================================================================ lembrete
select test.assert((public.mark_reminder_sent((select v from ids where k='a1'))).reminder_sent_at is not null, 'lembrete registrado');
select test.assert((select reminder_sent_at is not null from public.order_summaries where id = (select v from ids where k='a1')), 'resumo traz o lembrete');
select from public.schedule_order((select v from ids where k='a1'), '2026-11-10 15:00-03', 40, 'Pediu mais tarde');
select test.assert((select reminder_sent_at is null from public.orders where id = (select v from ids where k='a1')), 'reagendar pede novo lembrete');

-- ================================================================ anotações
select public.add_service_note((select v from ids where k='a1'), '  Sensibilidade no dente 36. Voltar em 6 meses.  ', 'cccccccc-0000-0000-0000-0000000000e1') as n1 \gset
select test.assert((:'n1'::public.service_notes).body = 'Sensibilidade no dente 36. Voltar em 6 meses.', 'anotação gravada sem espaços nas pontas');
select test.assert((:'n1'::public.service_notes).customer_id = (select v from ids where k='maria'), 'anotação ligada ao cliente');
select test.assert((public.add_service_note((select v from ids where k='a1'), 'outro texto', 'cccccccc-0000-0000-0000-0000000000e1')).id = (:'n1'::public.service_notes).id,
  'mesma chave não duplica a anotação');
select test.assert_fails($$select public.add_service_note((select v from ids where k='a1'), '   ', gen_random_uuid())$$, 'anotação vazia recusada', '22023');
select test.assert_fails($$update public.service_notes set body = 'x'$$, 'anotação não é editada', '42501');
select test.assert_fails($$delete from public.service_notes$$, 'anotação não é apagada', '42501');
select test.assert_fails($$insert into public.service_notes (organization_id, order_id, body, idempotency_key, created_by)
  values ((select v from ids where k='org_d'), (select v from ids where k='a1'), 'x', gen_random_uuid(), (select v from ids where k='dani'))$$,
  'anotação só pela RPC', '42501');

-- ================================================================ falta
insert into ids select 'a5', (public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'),
  now() + interval '1 day', gen_random_uuid(), (select v from ids where k='avaliacao'))).id;
select test.assert_fails($$select public.mark_no_show((select v from ids where k='a5'))$$, 'falta só depois do horário', '55000');
insert into ids select 'a4', (public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'),
  now() - interval '2 hours', gen_random_uuid(), (select v from ids where k='avaliacao'))).id;
select test.assert((public.mark_no_show((select v from ids where k='a4'))).no_show_at is not null, 'falta registrada');
select test.assert((select status = 'cancelled' and cancel_reason = 'Não compareceu' from public.orders where id = (select v from ids where k='a4')),
  'falta cancela com motivo');
select test.assert((select count(*) from public.order_status_history where order_id = (select v from ids where k='a4') and to_status = 'cancelled') = 1,
  'falta fica no histórico');
select test.assert((public.mark_no_show((select v from ids where k='a4'))).no_show_at is not null, 'marcar falta de novo não faz nada');
select test.assert_fails($$select public.mark_reminder_sent((select v from ids where k='a4'))$$, 'sem lembrete para atendimento encerrado', '55000');
select test.assert_fails($$select public.set_order_status((select v from ids where k='a4'), 'delivered')$$, 'falta é final', '55000');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='ana'));
select test.assert(test.row_count('select * from public.service_notes') = 0, 'outra empresa não lê anotações');
select test.assert_fails($$select public.add_service_note((select v from ids where k='a1'), 'x', gen_random_uuid())$$, 'não anota em atendimento alheio', 'P0002');
select test.assert_fails($$select public.mark_no_show((select v from ids where k='a1'))$$, 'não marca falta alheia', 'P0002');
select test.assert_fails($$select public.mark_reminder_sent((select v from ids where k='a1'))$$, 'não marca lembrete alheio', 'P0002');
select test.assert_fails($$select public.book_appointment((select v from ids where k='org_d'), (select v from ids where k='maria'), now(), gen_random_uuid(), (select v from ids where k='limpeza'))$$,
  'não marca na agenda alheia', 'P0002');
select test.assert(test.affected($$update public.organizations set practice_area = 'other' where id = (select v from ids where k='org_d')$$) = 0, 'não muda a área de outra empresa');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.service_notes', 'anon não lê anotações', '42501');
select test.assert_fails($$select public.book_appointment((select v from ids where k='org_d'), null, now(), gen_random_uuid())$$, 'anon não marca', '42501');
select test.logout();

rollback;
