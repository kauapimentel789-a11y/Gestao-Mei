-- 0001 — Perfis, empresas, membros e isolamento multiempresa.
--
-- Regras:
-- * Toda empresa é criada pela RPC create_organization (nunca por insert direto),
--   que cria a empresa e o membro "owner" na mesma transação.
-- * O acesso a dados de uma empresa depende de app.is_member(), que lê
--   organization_members com security definer para evitar recursão de RLS.
-- * anon não tem acesso a nenhuma tabela deste arquivo.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.business_type as enum ('production', 'resale', 'services');
create type public.member_role as enum ('owner', 'admin', 'member');

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------

create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Gera um slug a partir de um texto: minúsculas, sem acentos, só [a-z0-9-],
-- até 48 caracteres.
create function app.slugify(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from left(trim(both '-' from regexp_replace(
    translate(lower(coalesce(value, '')),
      'áàâãäåçéèêëíìîïñóòôõöúùûüýÿ',
      'aaaaaaceeeeiiiinooooouuuuyy'),
    '[^a-z0-9]+', '-', 'g')), 48));
$$;

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

-- Cria o perfil quando um usuário se cadastra no Supabase Auth.
create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Empresas e membros
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$'),
  business_type public.business_type not null,
  -- Preparado para mais de um modelo operacional no futuro. Na v1 contém só
  -- o business_type principal.
  enabled_modules public.business_type[] not null,
  hourly_rate_cents bigint not null default 0
    check (hourly_rate_cents between 0 and 100000000),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_main_type_enabled
    check (business_type = any (enabled_modules))
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function app.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------------
-- Funções de autorização (usadas pelas políticas de todas as tabelas)
-- ---------------------------------------------------------------------------

create function app.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
  );
$$;

create function app.has_role(org uuid, roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

revoke all on function app.is_member(uuid) from public;
revoke all on function app.has_role(uuid, public.member_role[]) from public;
grant execute on function app.is_member(uuid) to authenticated;
grant execute on function app.has_role(uuid, public.member_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- O Supabase concede tudo a anon/authenticated por padrão; aqui fechamos e
-- abrimos só o necessário.
revoke all on public.profiles, public.organizations, public.organization_members
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select on public.organizations to authenticated;
grant update (name, slug, hourly_rate_cents) on public.organizations to authenticated;

grant select on public.organization_members to authenticated;

-- Perfis: o próprio usuário, ou colegas de alguma empresa em comum.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = profiles.id
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy organizations_select on public.organizations
  for select to authenticated
  using (app.is_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (app.has_role(id, array['owner', 'admin']::public.member_role[]))
  with check (app.has_role(id, array['owner', 'admin']::public.member_role[]));

create policy organization_members_select on public.organization_members
  for select to authenticated
  using (app.is_member(organization_id));

-- Sem políticas de insert/delete: empresas nascem pela RPC abaixo e a gestão
-- de membros (convites) virá em uma migração própria.

-- ---------------------------------------------------------------------------
-- RPC: criar empresa
-- ---------------------------------------------------------------------------

create function public.create_organization(
  p_name text,
  p_business_type public.business_type,
  p_slug text default null,
  p_hourly_rate_cents bigint default 0
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_slug text;
  v_org public.organizations;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  -- Limite simples contra abuso: até 10 empresas criadas por usuário.
  if (select count(*) from public.organizations o where o.created_by = v_user) >= 10 then
    raise exception 'organization_limit_reached' using errcode = '54000';
  end if;

  v_slug := app.slugify(coalesce(nullif(trim(p_slug), ''), p_name));
  if v_slug !~ '^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  if exists (select 1 from public.organizations o where o.slug = v_slug) then
    raise exception 'slug_taken' using errcode = '23505';
  end if;

  insert into public.organizations (name, slug, business_type, enabled_modules, hourly_rate_cents, created_by)
  values (trim(p_name), v_slug, p_business_type, array[p_business_type], coalesce(p_hourly_rate_cents, 0), v_user)
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, v_user, 'owner');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, public.business_type, text, bigint) from public, anon;
grant execute on function public.create_organization(text, public.business_type, text, bigint) to authenticated;
