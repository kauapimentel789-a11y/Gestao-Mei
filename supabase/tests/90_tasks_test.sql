-- Testes da migração 0008: tarefas.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('ana',   test.create_user('ana@example.com', 'Ana')),
  ('carla', test.create_user('carla@example.com', 'Carla')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_b', (public.create_organization('Bruno Reparos', 'services')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_b'), 'service', 'Visita', 8000) returning id)
insert into ids select 'visita', id from x;
insert into ids select 'os_b', (public.create_order((select v from ids where k='org_b'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='visita'), 'quantity', 1)), gen_random_uuid(), 'service_order')).id;
select test.logout();

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents) values ((select v from ids where k='org_a'), 'finished', 'Bolo', 9000) returning id)
insert into ids select 'bolo', id from x;
insert into ids select 'o1', (public.create_order((select v from ids where k='org_a'),
  jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k='bolo'), 'quantity', 1)), gen_random_uuid(),
  p_due_at => '2026-11-10 15:00-03')).id;
select test.logout();
insert into public.organization_members (organization_id, user_id, role) values ((select v from ids where k='org_a'), (select v from ids where k='carla'), 'member');

-- ================================================================ criar e editar
select test.login_as((select v from ids where k='ana'));
select public.create_task((select v from ids where k='org_a'), '  Comprar embalagens  ', 'ffffffff-0000-0000-0000-000000000001',
  p_priority => 'high', p_due_date => '2026-11-01', p_assignee_id => (select v from ids where k='carla')) as t1 \gset
insert into ids select 't1', (:'t1'::public.tasks).id;
select test.assert((:'t1'::public.tasks).title = 'Comprar embalagens', 'título sem espaços nas pontas');
select test.assert((:'t1'::public.tasks).status = 'todo', 'tarefa nasce a fazer');
select test.assert((select assignee_name from public.task_overview where id = (select v from ids where k='t1')) = 'Carla', 'visão mostra o responsável');
select test.assert((select count(*) from public.task_history where task_id = (select v from ids where k='t1')) = 1, 'criação vai para o histórico');
select test.assert((public.create_task((select v from ids where k='org_a'), 'Outra coisa', 'ffffffff-0000-0000-0000-000000000001')).id = (select v from ids where k='t1'),
  'mesma chave devolve a mesma tarefa');
select test.assert((select count(*) from public.tasks where organization_id = (select v from ids where k='org_a')) = 1, 'reenvio não duplica');

select test.assert_fails($$select public.create_task((select v from ids where k='org_a'), 'x', gen_random_uuid())$$, 'título curto é recusado', '22023');
select test.assert_fails($$select public.create_task((select v from ids where k='org_a'), 'Tarefa', gen_random_uuid(), p_assignee_id => (select v from ids where k='bruno'))$$,
  'responsável precisa ser da empresa', 'P0002');
select test.assert_fails($$select public.create_task((select v from ids where k='org_a'), 'Tarefa', gen_random_uuid(), p_order_id => (select v from ids where k='os_b'))$$,
  'não vincula pedido de outra empresa', 'P0002');
select test.assert_fails($$insert into public.tasks (organization_id, title, created_by, updated_by) values ((select v from ids where k='org_a'), 'Direto', auth.uid(), auth.uid())$$,
  'insert direto em tarefas é bloqueado', '42501');
select test.assert_fails($$update public.tasks set status = 'done' where id = (select v from ids where k='t1')$$, 'update direto é bloqueado', '42501');
select test.assert_fails($$delete from public.tasks where id = (select v from ids where k='t1')$$, 'tarefa não é apagada', '42501');

select test.assert((public.update_task((select v from ids where k='t1'), 'Comprar caixas', null, 'normal', null, null)).title = 'Comprar caixas', 'edição muda o título');
select test.assert((select assignee_id is null and due_date is null from public.tasks where id = (select v from ids where k='t1')), 'edição limpa prazo e responsável');

-- ================================================================ status
select from public.set_task_status((select v from ids where k='t1'), 'in_progress');
select from public.set_task_status((select v from ids where k='t1'), 'in_progress');
select test.assert((select count(*) from public.task_history where task_id = (select v from ids where k='t1')) = 2, 'mesmo status duas vezes não duplica o histórico');
select from public.set_task_status((select v from ids where k='t1'), 'blocked', 'Esperando fornecedor');
select test.assert((select note from public.task_history where task_id = (select v from ids where k='t1') and to_status = 'blocked') = 'Esperando fornecedor', 'motivo do bloqueio no histórico');
select test.assert((public.set_task_status((select v from ids where k='t1'), 'done')).completed_at is not null, 'concluir grava a data');
select test.assert((select completed_by from public.tasks where id = (select v from ids where k='t1')) = (select v from ids where k='ana'), 'concluir grava quem concluiu');
select test.assert((public.set_task_status((select v from ids where k='t1'), 'todo', 'Faltou uma caixa')).completed_at is null, 'reabrir limpa a conclusão');
select test.assert_fails($$select public.set_task_status((select v from ids where k='t1'), 'cancelled')$$, 'cancelar exige motivo', '22023');
select from public.set_task_status((select v from ids where k='t1'), 'cancelled', 'Não precisa mais');
select test.assert_fails($$select public.set_task_status((select v from ids where k='t1'), 'todo')$$, 'cancelada não reabre', '55000');
select test.assert_fails($$select public.update_task((select v from ids where k='t1'), 'Mudar', null, 'normal', null, null)$$, 'cancelada não é editada', '55000');
select test.assert((select string_agg(coalesce(from_status::text, '-') || '>' || to_status, ',' order by id) from public.task_history where task_id = (select v from ids where k='t1'))
  = '->todo,todo>in_progress,in_progress>blocked,blocked>done,done>todo,todo>cancelled', 'histórico completo, em ordem');

-- ================================================================ etapas do pedido
select test.assert((select count(*) from public.generate_order_tasks((select v from ids where k='o1'))) = 4, 'gera 4 etapas para produção');
select test.assert((select string_agg(title, ' | ' order by position) from public.tasks where order_id = (select v from ids where k='o1'))
  = 'Separar materiais · #1 | Produzir · #1 | Embalar · #1 | Entregar · #1', 'etapas em ordem com o número do pedido');
select test.assert((select bool_and(due_date = '2026-11-10') from public.tasks where order_id = (select v from ids where k='o1')), 'etapas herdam a data de entrega (fuso de Brasília)');
select test.assert((select count(*) from public.generate_order_tasks((select v from ids where k='o1'))) = 0, 'gerar de novo não duplica');
select from public.set_task_status((select id from public.tasks where order_id = (select v from ids where k='o1') and step_key = 'produce'), 'done');
select test.assert((select count(*) from public.tasks where order_id = (select v from ids where k='o1') and status = 'done') = 1,
  'concluir uma etapa não conclui as outras');
select test.assert((select status from public.orders where id = (select v from ids where k='o1')) = 'received', 'concluir etapa não muda o pedido');
select from public.set_order_status((select v from ids where k='o1'), 'cancelled', 'Cliente desistiu');
select test.assert_fails($$select public.generate_order_tasks((select v from ids where k='o1'))$$, 'pedido cancelado não gera etapas', '55000');
select test.assert((select order_number || ':' || coalesce(customer_name, '-') from public.task_overview where step_key = 'pack') = '1:-', 'visão mostra o pedido');
select test.logout();

-- Membro comum também trabalha nas tarefas.
select test.login_as((select v from ids where k='carla'));
select test.assert(test.row_count('select * from public.task_overview') = 5, 'membro vê as tarefas da empresa');
select test.assert((public.set_task_status((select id from public.tasks where step_key = 'pack'), 'in_progress')).status = 'in_progress', 'membro muda status');
select test.logout();

-- ================================================================ isolamento
select test.login_as((select v from ids where k='bruno'));
select test.assert(test.row_count('select * from public.tasks') = 0, 'outra empresa não vê tarefas');
select test.assert(test.row_count('select * from public.task_history') = 0, 'outra empresa não vê histórico');
select test.assert(test.row_count('select * from public.task_overview') = 0, 'outra empresa não vê a visão');
select test.assert_fails($$select public.create_task((select v from ids where k='org_a'), 'Invasão', gen_random_uuid())$$, 'não cria tarefa em empresa alheia', 'P0002');
select test.assert_fails($$select public.set_task_status((select id from public.tasks where step_key = 'deliver'), 'done')$$, 'não muda tarefa alheia', 'P0002');
select test.assert_fails($$select public.update_task((select v from ids where k='t1'), 'Invasão', null, 'normal', null, null)$$, 'não edita tarefa alheia', 'P0002');
select test.assert_fails($$select public.generate_order_tasks((select v from ids where k='o1'))$$, 'não gera etapas em pedido alheio', 'P0002');
select test.assert((select count(*) from public.generate_order_tasks((select v from ids where k='os_b'))) = 3, 'serviços geram 3 etapas');
select test.logout();

select test.login_anon();
select test.assert_fails('select * from public.tasks', 'anon não lê tarefas', '42501');
select test.assert_fails($$select public.create_task((select v from ids where k='org_a'), 'Anon', gen_random_uuid())$$, 'anon não cria tarefa', '42501');
select test.logout();

rollback;
