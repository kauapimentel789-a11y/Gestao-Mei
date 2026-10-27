-- 0030 — Assistente de IA de Minhas finanças: limite de perguntas por dia.
--
-- A Edge Function `assistente` chama `assistant_take_turn` com o login de quem
-- pergunta antes de falar com a IA; passando de 30 perguntas no dia (horário
-- de Brasília), o banco recusa. Depois da resposta, `assistant_record_usage`
-- soma os tokens gastos, para acompanhar o custo. Só no espaço pessoal.
-- A IA só lê (com o login da pessoa, então o RLS vale) e sugere lançamentos;
-- quem salva é a pessoa, no app, com os RPCs de sempre.

create table public.assistant_usage (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  used_on date not null,
  questions integer not null default 0 check (questions >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, used_on)
);
create index assistant_usage_user_day_idx on public.assistant_usage (user_id, used_on);

alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;
grant select on public.assistant_usage to authenticated;
create policy assistant_usage_select on public.assistant_usage
  for select to authenticated using (user_id = auth.uid() and app.is_member(organization_id));

-- Conta uma pergunta e devolve quantas ainda restam hoje. O limite vale por
-- pessoa (somando todos os espaços), para não driblar trocando de espaço.
create function public.assistant_take_turn(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_limit constant integer := 30;
  v_used integer;
begin
  v_user := app.assert_member(p_organization_id);
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.kind = 'personal' and o.closed_at is null) then
    raise exception 'assistant_personal_only' using errcode = '55000';
  end if;
  -- Trava por pessoa e dia, para duas perguntas ao mesmo tempo não passarem do limite.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || v_today::text, 0));
  select coalesce(sum(u.questions), 0) into v_used from public.assistant_usage u where u.user_id = v_user and u.used_on = v_today;
  if v_used >= v_limit then
    raise exception 'assistant_daily_limit' using errcode = '54000';
  end if;
  insert into public.assistant_usage (organization_id, user_id, used_on, questions)
  values (p_organization_id, v_user, v_today, 1)
  on conflict (organization_id, user_id, used_on)
  do update set questions = public.assistant_usage.questions + 1, updated_at = now();
  return v_limit - v_used - 1;
end;
$$;

create function public.assistant_record_usage(p_organization_id uuid, p_input_tokens bigint, p_output_tokens bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  v_user := app.assert_member(p_organization_id);
  if p_input_tokens is null or p_output_tokens is null or p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  update public.assistant_usage u
  set input_tokens = u.input_tokens + p_input_tokens, output_tokens = u.output_tokens + p_output_tokens, updated_at = now()
  where u.organization_id = p_organization_id and u.user_id = v_user
    and u.used_on = (now() at time zone 'America/Sao_Paulo')::date;
end;
$$;

revoke all on function public.assistant_take_turn(uuid) from public, anon;
revoke all on function public.assistant_record_usage(uuid, bigint, bigint) from public, anon;
grant execute on function public.assistant_take_turn(uuid) to authenticated;
grant execute on function public.assistant_record_usage(uuid, bigint, bigint) to authenticated;
