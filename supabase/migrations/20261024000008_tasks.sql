-- 0008 — Tarefas (PROMPT 6): trabalho do dia, com prioridade, prazo,
-- responsável e vínculo opcional com pedido.
--
-- Regras:
-- * Status: a fazer, em andamento, bloqueada, concluída, cancelada.
--   Concluída pode ser reaberta; cancelada é final. Toda mudança fica no
--   histórico (task_history); nada é apagado.
-- * Concluir uma tarefa não conclui as outras do pedido nem mexe no estoque.
-- * Etapas geradas a partir do pedido têm step_key único por pedido: gerar de
--   novo não duplica.
-- * Responsável precisa ser membro da empresa.

create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  due_date date,
  assignee_id uuid references auth.users (id),
  order_id uuid,
  step_key text check (step_key is null or step_key ~ '^[a-z_]{2,40}$'),
  position smallint not null default 0,
  completed_at timestamptz,
  completed_by uuid references auth.users (id),
  idempotency_key uuid,
  created_by uuid not null references auth.users (id),
  updated_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  unique (order_id, step_key),
  foreign key (organization_id, order_id) references public.orders (organization_id, id),
  constraint tasks_step_needs_order check (step_key is null or order_id is not null),
  constraint tasks_done check ((status = 'done') = (completed_at is not null))
);
create index tasks_org_open_idx on public.tasks (organization_id, due_date) where status not in ('done', 'cancelled');
create index tasks_order_idx on public.tasks (order_id) where order_id is not null;

create table public.task_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  task_id uuid not null,
  from_status public.task_status,
  to_status public.task_status not null,
  note text check (note is null or char_length(note) <= 500),
  changed_by uuid not null references auth.users (id),
  changed_at timestamptz not null default now(),
  foreign key (organization_id, task_id) references public.tasks (organization_id, id)
);
create index task_history_task_idx on public.task_history (task_id, changed_at);

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

create function app.assert_assignee(p_org uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is not null and not exists (
    select 1 from public.organization_members m where m.organization_id = p_org and m.user_id = p_user
  ) then
    raise exception 'assignee_not_member' using errcode = 'P0002';
  end if;
end;
$$;

create function app.clean_task_title(p_title text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := trim(coalesce(p_title, ''));
begin
  if char_length(v) not between 2 and 120 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.create_task(
  p_organization_id uuid,
  p_title text,
  p_idempotency_key uuid,
  p_description text default null,
  p_priority public.task_priority default 'normal',
  p_due_date date default null,
  p_assignee_id uuid default null,
  p_order_id uuid default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_task public.tasks;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_task from public.tasks t
  where t.organization_id = p_organization_id and t.idempotency_key = p_idempotency_key;
  if found then
    return v_task;
  end if;

  perform app.assert_assignee(p_organization_id, p_assignee_id);
  if p_order_id is not null and not exists (
    select 1 from public.orders o where o.id = p_order_id and o.organization_id = p_organization_id
  ) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  insert into public.tasks
    (organization_id, title, description, priority, due_date, assignee_id, order_id, idempotency_key, created_by, updated_by)
  values
    (p_organization_id, app.clean_task_title(p_title), nullif(trim(p_description), ''), coalesce(p_priority, 'normal'),
     p_due_date, p_assignee_id, p_order_id, p_idempotency_key, v_user, v_user)
  returning * into v_task;

  insert into public.task_history (organization_id, task_id, from_status, to_status, changed_by)
  values (v_task.organization_id, v_task.id, null, v_task.status, v_user);
  return v_task;
end;
$$;

-- Edita os dados da tarefa (status muda só por set_task_status).
create function public.update_task(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_priority public.task_priority,
  p_due_date date,
  p_assignee_id uuid
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_user uuid;
begin
  select * into v_task from public.tasks t where t.id = p_task_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_task.organization_id);
  if v_task.status = 'cancelled' then
    raise exception 'task_cancelled' using errcode = '55000';
  end if;
  perform app.assert_assignee(v_task.organization_id, p_assignee_id);

  update public.tasks t
  set title = app.clean_task_title(p_title),
      description = nullif(trim(p_description), ''),
      priority = coalesce(p_priority, 'normal'),
      due_date = p_due_date,
      assignee_id = p_assignee_id,
      updated_by = v_user,
      updated_at = now()
  where t.id = v_task.id
  returning * into v_task;
  return v_task;
end;
$$;

create function public.set_task_status(
  p_task_id uuid,
  p_status public.task_status,
  p_note text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_user uuid;
  v_from public.task_status;
  v_note text := left(nullif(trim(p_note), ''), 500);
begin
  select * into v_task from public.tasks t where t.id = p_task_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_task.organization_id);
  v_from := v_task.status;

  if p_status is null then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if v_from = p_status then
    return v_task; -- toque duplo: nada muda, nada vai para o histórico
  end if;
  if v_from = 'cancelled' then
    raise exception 'task_cancelled' using errcode = '55000';
  end if;
  if p_status = 'cancelled' and (v_note is null or char_length(v_note) < 3) then
    raise exception 'cancel_reason_required' using errcode = '22023';
  end if;

  update public.tasks t
  set status = p_status,
      completed_at = case when p_status = 'done' then now() end,
      completed_by = case when p_status = 'done' then v_user end,
      updated_by = v_user,
      updated_at = now()
  where t.id = v_task.id
  returning * into v_task;

  insert into public.task_history (organization_id, task_id, from_status, to_status, note, changed_by)
  values (v_task.organization_id, v_task.id, v_from, p_status, v_note, v_user);
  return v_task;
end;
$$;

-- Gera as etapas padrão do pedido conforme o tipo de negócio. Etapas que já
-- existem (mesmo canceladas) não são recriadas.
create function public.generate_order_tasks(p_order_id uuid)
returns setof public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_user uuid;
  v_type public.business_type;
  v_steps text[][];
  v_due date;
  v_task public.tasks;
  i integer;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_order.organization_id);
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'order_closed' using errcode = '55000';
  end if;

  select o.business_type into v_type from public.organizations o where o.id = v_order.organization_id;
  v_steps := case v_type
    when 'production' then array[['prepare', 'Separar materiais'], ['produce', 'Produzir'], ['pack', 'Embalar'], ['deliver', 'Entregar']]
    when 'resale' then array[['pick', 'Separar produtos'], ['check', 'Conferir pedido'], ['ship', 'Preparar retirada ou entrega']]
    else array[['schedule', 'Agendar execução'], ['execute', 'Executar serviço'], ['finish', 'Registrar conclusão']]
  end;
  v_due := (v_order.due_at at time zone 'America/Sao_Paulo')::date;

  for i in 1 .. array_length(v_steps, 1)
  loop
    insert into public.tasks (organization_id, title, order_id, step_key, position, due_date, created_by, updated_by)
    values (v_order.organization_id, v_steps[i][2] || ' · #' || v_order.number, v_order.id, v_steps[i][1], i, v_due, v_user, v_user)
    on conflict (order_id, step_key) do nothing
    returning * into v_task;
    if found then
      insert into public.task_history (organization_id, task_id, from_status, to_status, changed_by)
      values (v_task.organization_id, v_task.id, null, v_task.status, v_user);
      return next v_task;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visão para as listas
-- ---------------------------------------------------------------------------

create view public.task_overview
with (security_invoker = true)
as
select
  t.id,
  t.organization_id,
  t.title,
  t.description,
  t.status,
  t.priority,
  t.due_date,
  t.assignee_id,
  pa.display_name as assignee_name,
  t.order_id,
  o.number as order_number,
  c.name as customer_name,
  t.step_key,
  t.position,
  t.completed_at,
  t.created_at,
  t.updated_at
from public.tasks t
left join public.profiles pa on pa.id = t.assignee_id
left join public.orders o on o.id = t.order_id
left join public.customers c on c.id = o.customer_id;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

revoke all on public.tasks, public.task_history, public.task_overview from anon, authenticated;
grant select on public.tasks, public.task_history, public.task_overview to authenticated;

create policy tasks_select on public.tasks
  for select to authenticated using (app.is_member(organization_id));
create policy task_history_select on public.task_history
  for select to authenticated using (app.is_member(organization_id));

revoke all on function app.assert_assignee(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_task(uuid, text, uuid, text, public.task_priority, date, uuid, uuid) from public, anon;
revoke all on function public.update_task(uuid, text, text, public.task_priority, date, uuid) from public, anon;
revoke all on function public.set_task_status(uuid, public.task_status, text) from public, anon;
revoke all on function public.generate_order_tasks(uuid) from public, anon;
grant execute on function public.create_task(uuid, text, uuid, text, public.task_priority, date, uuid, uuid) to authenticated;
grant execute on function public.update_task(uuid, text, text, public.task_priority, date, uuid) to authenticated;
grant execute on function public.set_task_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.generate_order_tasks(uuid) to authenticated;
