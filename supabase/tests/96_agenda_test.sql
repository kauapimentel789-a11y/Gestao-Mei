-- Testes da migração 0010: agenda e materiais de ordens de serviço.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('bruno', test.create_user('bruno@example.com', 'Bruno')),
  ('ana',   test.create_user('ana@example.com', 'Ana'));

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
select test.logout();

select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_b', (public.create_organization('Bruno Reparos', 'services')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_b'), 'service', 'Visita técnica', 8000) returning id)
insert into ids select 'visita', id from x;
with x as (insert into public.products (organization_id, item_type, name, unit) values ((select v from ids where k='org_b'), 'component', 'Fita isolante', 'un') returning id)
insert into ids select 'fita', id from x;
with x as (insert into public.products (organization_id, item_type, name, unit, track_stock) values ((select v from ids where k='org_b'), 'consumable', 'Pano', 'un', false) returning id)
insert into ids select 'pano', id from x;
select from public.inventory_move((select v from ids where k='fita'), 'purchase', 3, gen_random_uuid());
insert into ids select 'os1', (public.create_order((select v from ids where k='org_b'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='visita'), 'quantity', 1)), gen_random_uuid(), 'service_order',
  p_scheduled_for => '2026-11-03 09:00-03', p_problem_description => 'Tomada sem energia')).id;

-- ================================================================ agendar
select test.assert((public.schedule_order((select v from ids where k='os1'), '2026-11-04 14:00-03', 90, 'Cliente pediu')).scheduled_minutes = 90, 'reagenda com duração');
select test.assert((select scheduled_for from public.orders where id = (select v from ids where k='os1')) = '2026-11-04 14:00-03', 'nova data gravada');
select test.assert((select from_at = '2026-11-03 09:00-03' and reason = 'Cliente pediu' from public.order_schedule_changes where order_id = (select v from ids where k='os1')),
  'mudança fica no histórico com a data anterior');
select from public.schedule_order((select v from ids where k='os1'), '2026-11-04 14:00-03', 90);
select test.assert((select count(*) from public.order_schedule_changes where order_id = (select v from ids where k='os1')) = 1, 'mesmo horário não duplica o histórico');
select test.assert((select items_summary from public.order_summaries where id = (select v from ids where k='os1')) = '1× Visita técnica', 'reagendar não mexe nos itens');
select test.assert((select scheduled_minutes || ':' || problem_description from public.order_summaries where id = (select v from ids where k='os1')) = '90:Tomada sem energia',
  'resumo traz duração e problema');
select test.assert_fails($$select public.schedule_order((select v from ids where k='os1'), now(), 2)$$, 'duração muito curta recusada', '22023');
select test.assert((public.schedule_order((select v from ids where k='os1'), null, 90)).scheduled_minutes is null, 'tirar da agenda limpa a duração');
select from public.schedule_order((select v from ids where k='os1'), '2026-11-04 14:00-03', 60);

-- ================================================================ materiais
select public.register_service_material((select v from ids where k='os1'), (select v from ids where k='fita'), 2, 'aaaaaaaa-0000-0000-0000-0000000000f1') as m1 \gset
select test.assert((:'m1'::public.inventory_movements).movement_type = 'service_consumption', 'material sai como consumo em serviço');
select test.assert((:'m1'::public.inventory_movements).order_id = (select v from ids where k='os1'), 'movimentação ligada à ordem');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='fita')) = 1, 'estoque baixado');
select test.assert((public.register_service_material((select v from ids where k='os1'), (select v from ids where k='fita'), 2, 'aaaaaaaa-0000-0000-0000-0000000000f1')).id
  = (:'m1'::public.inventory_movements).id, 'mesma chave não baixa de novo');
select test.assert((select stock_qty from public.products where id = (select v from ids where k='fita')) = 1, 'reenvio não muda o saldo');
select test.assert_fails($$select public.register_service_material((select v from ids where k='os1'), (select v from ids where k='fita'), 5, gen_random_uuid())$$,
  'sem saldo é bloqueado', '55000');
select from public.register_service_material((select v from ids where k='os1'), (select v from ids where k='fita'), 5, gen_random_uuid(), true);
select test.assert((select stock_qty from public.products where id = (select v from ids where k='fita')) = -4, 'autorizado deixa negativo');
select test.assert_fails($$select public.register_service_material((select v from ids where k='os1'), (select v from ids where k='pano'), 1, gen_random_uuid())$$,
  'item sem controle de estoque recusado', '55000');
select test.assert_fails($$select public.register_service_material((select v from ids where k='os1'), (select v from ids where k='visita'), 1, gen_random_uuid())$$,
  'serviço não é material', 'P0002');
select test.assert(not exists (select 1 from public.financial_entries where organization_id = (select v from ids where k='org_b')), 'material usado não gera despesa');
select test.assert((public.inventory_reverse((:'m1'::public.inventory_movements).id, 'Lançado errado', gen_random_uuid())).quantity = 2, 'material pode ser estornado');

select from public.set_order_status((select v from ids where k='os1'), 'cancelled', 'Cliente desistiu');
select test.assert_fails($$select public.schedule_order((select v from ids where k='os1'), now(), 60)$$, 'ordem cancelada não é reagendada', '55000');
select test.assert_fails($$select public.register_service_material((select v from ids where k='os1'), (select v from ids where k='fita'), 1, gen_random_uuid())$$,
  'ordem cancelada não recebe material', '55000');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='ana'));
select test.assert(test.row_count('select * from public.order_schedule_changes') = 0, 'outra empresa não vê o histórico de agenda');
select test.assert_fails($$select public.schedule_order((select v from ids where k='os1'), now(), 60)$$, 'não reagenda ordem alheia', 'P0002');
select test.assert_fails($$select public.register_service_material((select v from ids where k='os1'), (select v from ids where k='fita'), 1, gen_random_uuid())$$,
  'não usa material de empresa alheia', 'P0002');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.order_schedule_changes', 'anon não lê agenda', '42501');
select test.logout();

rollback;
