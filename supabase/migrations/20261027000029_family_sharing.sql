-- 0029 — Família: dividir "Minhas finanças" com outras pessoas.
--
-- Parte (d) de Minhas finanças. Quem é do espaço pessoal convida pelo e-mail
-- (organization_invites). A pessoa convidada entra com uma conta desse e-mail,
-- vê o convite e aceita; vira membro do espaço e enxerga e lança tudo, como
-- num app de casal ou família. Por enquanto só no espaço pessoal: empresa tem
-- papéis e permissões próprios, que ficam para outra etapa.
-- * No máximo 6 pessoas por espaço.
-- * Quem entra pelo convite fica como admin (pode convidar e tirar outros,
--   menos o dono). Qualquer um pode sair, menos o dono.
-- * Convite vale 14 dias; dá para cancelar (quem convidou) ou recusar (quem
--   foi convidado). Nada disso apaga o histórico do convite.

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  declined_at timestamptz,
  revoked_at timestamptz
);
create unique index organization_invites_open_uq on public.organization_invites (organization_id, email)
  where accepted_at is null and declined_at is null and revoked_at is null;
create index organization_invites_email_idx on public.organization_invites (email)
  where accepted_at is null and declined_at is null and revoked_at is null;

alter table public.organization_invites enable row level security;
revoke all on public.organization_invites from anon, authenticated;
grant select on public.organization_invites to authenticated;
create policy organization_invites_select on public.organization_invites
  for select to authenticated using (app.is_member(organization_id));

-- E-mail de quem chama, em minúsculas.
create function app.current_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid();
$$;
revoke all on function app.current_email() from public;

-- ---------------------------------------------------------------------------
-- Convidar, cancelar, ver, aceitar e recusar
-- ---------------------------------------------------------------------------

create function public.invite_to_space(p_organization_id uuid, p_email text)
returns public.organization_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_inv public.organization_invites;
begin
  v_user := app.assert_member(p_organization_id);
  if not app.has_role(p_organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform 1 from public.organizations o where o.id = p_organization_id and o.kind = 'personal' and o.closed_at is null for update;
  if not found then
    raise exception 'invites_personal_only' using errcode = '55000';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_members m join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  select * into v_inv from public.organization_invites i
  where i.organization_id = p_organization_id and i.email = v_email
    and i.accepted_at is null and i.declined_at is null and i.revoked_at is null;
  if found then
    -- Convidar de novo renova o prazo.
    update public.organization_invites set expires_at = now() + interval '14 days' where id = v_inv.id
    returning * into v_inv;
    return v_inv;
  end if;

  if (select count(*) from public.organization_members m where m.organization_id = p_organization_id)
     + (select count(*) from public.organization_invites i where i.organization_id = p_organization_id
          and i.accepted_at is null and i.declined_at is null and i.revoked_at is null and i.expires_at > now()) >= 6 then
    raise exception 'members_limit' using errcode = '55000';
  end if;

  insert into public.organization_invites (organization_id, email, invited_by)
  values (p_organization_id, v_email, v_user)
  returning * into v_inv;
  return v_inv;
end;
$$;

create function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organization_invites;
begin
  select * into v_inv from public.organization_invites i where i.id = p_invite_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform app.assert_member(v_inv.organization_id);
  if not app.has_role(v_inv.organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.organization_invites set revoked_at = coalesce(revoked_at, now())
  where id = v_inv.id and accepted_at is null and declined_at is null;
end;
$$;

-- Convites em aberto para o e-mail de quem chama.
create function public.my_invites()
returns table (id uuid, organization_id uuid, invited_by_name text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.organization_id, coalesce(nullif(p.display_name, ''), 'Alguém'), i.created_at, i.expires_at
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id and o.closed_at is null
  left join public.profiles p on p.id = i.invited_by
  where auth.uid() is not null
    and i.email = app.current_email()
    and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
    and i.expires_at > now()
    and not exists (select 1 from public.organization_members m where m.organization_id = i.organization_id and m.user_id = auth.uid())
  order by i.created_at desc;
$$;

create function public.answer_invite(p_invite_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_inv public.organization_invites;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_inv from public.organization_invites i where i.id = p_invite_id for update;
  -- Convite de outro e-mail: mesma resposta que inexistente.
  if not found or v_inv.email is distinct from app.current_email() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null and v_inv.accepted_by = v_user then
    return v_inv.organization_id;
  end if;
  if v_inv.accepted_at is not null or v_inv.declined_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'invite_expired' using errcode = '55000';
  end if;

  if not p_accept then
    update public.organization_invites set declined_at = now() where id = v_inv.id;
    return null;
  end if;

  perform 1 from public.organizations o where o.id = v_inv.organization_id and o.closed_at is null for update;
  if not found then
    raise exception 'invite_expired' using errcode = '55000';
  end if;
  if (select count(*) from public.organization_members m where m.organization_id = v_inv.organization_id) >= 6 then
    raise exception 'members_limit' using errcode = '55000';
  end if;
  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_user, 'admin')
  on conflict (organization_id, user_id) do nothing;
  update public.organization_invites set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  return v_inv.organization_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quem está no espaço, tirar alguém e sair
-- ---------------------------------------------------------------------------

create function public.space_members(p_organization_id uuid)
returns table (user_id uuid, display_name text, email text, role public.member_role, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.assert_member(p_organization_id);
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.kind = 'personal') then
    raise exception 'invites_personal_only' using errcode = '55000';
  end if;
  return query
  select m.user_id, coalesce(p.display_name, ''), u.email::text, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_organization_id
  order by m.role = 'owner' desc, m.created_at;
end;
$$;

create function public.remove_space_member(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_role public.member_role;
begin
  v_user := app.assert_member(p_organization_id);
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.kind = 'personal') then
    raise exception 'invites_personal_only' using errcode = '55000';
  end if;
  select m.role into v_role from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = p_user_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_role = 'owner' then
    raise exception 'owner_cannot_leave' using errcode = '55000';
  end if;
  -- Sair: qualquer um. Tirar outra pessoa: dono ou admin.
  if p_user_id <> v_user and not app.has_role(p_organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.organization_members m where m.organization_id = p_organization_id and m.user_id = p_user_id;
end;
$$;

revoke all on function public.invite_to_space(uuid, text) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
revoke all on function public.my_invites() from public, anon;
revoke all on function public.answer_invite(uuid, boolean) from public, anon;
revoke all on function public.space_members(uuid) from public, anon;
revoke all on function public.remove_space_member(uuid, uuid) from public, anon;
grant execute on function public.invite_to_space(uuid, text) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.answer_invite(uuid, boolean) to authenticated;
grant execute on function public.space_members(uuid) to authenticated;
grant execute on function public.remove_space_member(uuid, uuid) to authenticated;
