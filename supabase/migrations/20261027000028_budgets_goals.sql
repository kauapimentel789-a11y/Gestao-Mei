-- 0028 — Orçamento por categoria e metas.
--
-- Parte (c) de Minhas finanças, mas vale para qualquer espaço.
-- * Orçamento (budgets): limite mensal por categoria de gasto. O consumo é a
--   soma dos títulos a pagar não cancelados da categoria com competência no
--   mês, pagos ou não (compra no cartão conta no mês da fatura). O banco soma
--   (budget_overview); o app só compara com o limite.
-- * Metas (goals): guardar dinheiro para um objetivo não é receita nem
--   despesa, é separar o que já existe. Cada "guardei" ou "retirei" é um
--   registro em goal_contributions; o guardado é a soma (view goal_progress).
--   Não se retira mais do que foi guardado.
-- * Nada é apagado: orçamento se desliga (active = false), meta se conclui ou
--   arquiva, e movimento de meta se estorna com um registro inverso.

-- ---------------------------------------------------------------------------
-- Orçamento
-- ---------------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  alert_pct smallint not null default 80 check (alert_pct between 1 and 100),
  active boolean not null default true,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category_id),
  foreign key (organization_id, category_id) references public.financial_categories (organization_id, id)
);
create trigger budgets_updated_at before update on public.budgets
  for each row execute function app.set_updated_at();

-- Orçamento só em categoria de gasto.
create function app.budgets_check_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.financial_categories c
    where c.id = new.category_id and c.organization_id = new.organization_id and c.direction = 'payable'
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function app.budgets_check_category() from public;

create trigger budgets_check_category before insert or update of category_id on public.budgets
  for each row execute function app.budgets_check_category();

-- Gastos do mês por categoria, com o limite quando há. Uma linha por
-- categoria de gasto ativa ou com orçamento ativo.
create function public.budget_overview(p_organization_id uuid, p_month date)
returns table (
  category_id uuid,
  category_name text,
  budget_id uuid,
  amount_cents bigint,
  alert_pct smallint,
  spent_cents bigint,
  avg_prev_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month date;
begin
  perform app.assert_member(p_organization_id);
  if p_month is null then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  v_month := date_trunc('month', p_month)::date;

  return query
  with spent as (
    select e.category_id, date_trunc('month', e.competence_date)::date as m, sum(e.amount_cents)::bigint as total
    from public.financial_entries e
    where e.organization_id = p_organization_id and e.direction = 'payable' and e.cancelled_at is null
      and e.competence_date >= (v_month - interval '3 months')::date
      and e.competence_date < (v_month + interval '1 month')::date
    group by 1, 2
  )
  select
    c.id,
    c.name,
    b.id,
    b.amount_cents,
    b.alert_pct,
    coalesce((select s.total from spent s where s.category_id = c.id and s.m = v_month), 0)::bigint,
    (select (sum(s.total) / 3)::bigint from spent s where s.category_id = c.id and s.m < v_month)
  from public.financial_categories c
  left join public.budgets b on b.category_id = c.id and b.organization_id = c.organization_id and b.active
  where c.organization_id = p_organization_id and c.direction = 'payable' and (c.active or b.id is not null)
  order by b.id is null, c.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Metas
-- ---------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  target_cents bigint not null check (target_cents > 0 and target_cents <= 100000000000),
  target_date date,
  notes text check (notes is null or char_length(notes) <= 500),
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create trigger goals_updated_at before update on public.goals
  for each row execute function app.set_updated_at();

create table public.goal_contributions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  goal_id uuid not null,
  amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 100000000000),
  contributed_on date not null,
  note text check (note is null or char_length(note) <= 500),
  reverses_contribution_id bigint unique references public.goal_contributions (id),
  idempotency_key uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, goal_id) references public.goals (organization_id, id)
);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id, contributed_on);

create view public.goal_progress with (security_invoker = true) as
select
  g.id,
  g.organization_id,
  g.name,
  g.target_cents,
  g.target_date,
  g.notes,
  g.completed_at,
  g.archived_at,
  g.created_at,
  coalesce(sum(c.amount_cents), 0)::bigint as saved_cents,
  max(c.contributed_on) as last_contribution_on
from public.goals g
left join public.goal_contributions c on c.goal_id = g.id
group by g.id;

-- RPC: guardar (valor positivo) ou retirar (negativo).
create function public.add_goal_contribution(
  p_goal_id uuid,
  p_amount_cents bigint,
  p_contributed_on date,
  p_note text,
  p_idempotency_key uuid
)
returns public.goal_contributions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal public.goals;
  v_user uuid;
  v_row public.goal_contributions;
  v_saved bigint;
begin
  select * into v_goal from public.goals g where g.id = p_goal_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_goal.organization_id);

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_row from public.goal_contributions c
  where c.organization_id = v_goal.organization_id and c.idempotency_key = p_idempotency_key;
  if found then
    return v_row;
  end if;

  select * into v_goal from public.goals g where g.id = p_goal_id for update;
  if v_goal.archived_at is not null then
    raise exception 'goal_archived' using errcode = '55000';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 or abs(p_amount_cents) > 100000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_contributed_on is null or p_contributed_on > current_date then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  select coalesce(sum(c.amount_cents), 0) into v_saved from public.goal_contributions c where c.goal_id = v_goal.id;
  if v_saved + p_amount_cents < 0 then
    raise exception 'amount_exceeds_saved' using errcode = '22023';
  end if;

  insert into public.goal_contributions
    (organization_id, goal_id, amount_cents, contributed_on, note, idempotency_key, created_by)
  values
    (v_goal.organization_id, v_goal.id, p_amount_cents, p_contributed_on, nullif(left(trim(coalesce(p_note, '')), 500), ''),
     p_idempotency_key, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

-- RPC: estornar um movimento (registro inverso; o original fica).
create function public.reverse_goal_contribution(p_contribution_id bigint, p_reason text)
returns public.goal_contributions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.goal_contributions;
  v_user uuid;
  v_row public.goal_contributions;
  v_saved bigint;
begin
  select * into v_orig from public.goal_contributions c where c.id = p_contribution_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_orig.organization_id);
  perform 1 from public.goals g where g.id = v_orig.goal_id for update;

  select * into v_row from public.goal_contributions c where c.reverses_contribution_id = v_orig.id;
  if found then
    return v_row;
  end if;
  if v_orig.reverses_contribution_id is not null then
    raise exception 'already_reversal' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select coalesce(sum(c.amount_cents), 0) into v_saved from public.goal_contributions c where c.goal_id = v_orig.goal_id;
  if v_saved - v_orig.amount_cents < 0 then
    raise exception 'amount_exceeds_saved' using errcode = '22023';
  end if;

  insert into public.goal_contributions
    (organization_id, goal_id, amount_cents, contributed_on, note, reverses_contribution_id, created_by)
  values
    (v_orig.organization_id, v_orig.goal_id, -v_orig.amount_cents, current_date, left(trim(p_reason), 500), v_orig.id, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

revoke all on public.budgets, public.goals, public.goal_contributions, public.goal_progress from anon, authenticated;
grant select on public.budgets, public.goals, public.goal_contributions, public.goal_progress to authenticated;

grant insert (organization_id, category_id, amount_cents, alert_pct) on public.budgets to authenticated;
grant update (amount_cents, alert_pct, active) on public.budgets to authenticated;
grant insert (organization_id, name, target_cents, target_date, notes) on public.goals to authenticated;
grant update (name, target_cents, target_date, notes, completed_at, archived_at) on public.goals to authenticated;

create policy budgets_select on public.budgets
  for select to authenticated using (app.is_member(organization_id));
create policy budgets_insert on public.budgets
  for insert to authenticated with check (app.is_member(organization_id));
create policy budgets_update on public.budgets
  for update to authenticated using (app.is_member(organization_id)) with check (app.is_member(organization_id));
create policy goals_select on public.goals
  for select to authenticated using (app.is_member(organization_id));
create policy goals_insert on public.goals
  for insert to authenticated with check (app.is_member(organization_id));
create policy goals_update on public.goals
  for update to authenticated using (app.is_member(organization_id)) with check (app.is_member(organization_id));
create policy goal_contributions_select on public.goal_contributions
  for select to authenticated using (app.is_member(organization_id));

revoke all on function public.budget_overview(uuid, date) from public, anon;
revoke all on function public.add_goal_contribution(uuid, bigint, date, text, uuid) from public, anon;
revoke all on function public.reverse_goal_contribution(bigint, text) from public, anon;
grant execute on function public.budget_overview(uuid, date) to authenticated;
grant execute on function public.add_goal_contribution(uuid, bigint, date, text, uuid) to authenticated;
grant execute on function public.reverse_goal_contribution(bigint, text) to authenticated;

-- Exclusão de conta: metas pessoais sem nome nem observações.
create function app.anonymize_personal_goals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'personal' and new.closed_at is not null and old.closed_at is null then
    update public.goals set name = 'Meta removida', notes = null where organization_id = new.id;
    update public.goal_contributions set note = null where organization_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function app.anonymize_personal_goals() from public;

create trigger organizations_anonymize_personal_goals
  after update of closed_at on public.organizations
  for each row execute function app.anonymize_personal_goals();
