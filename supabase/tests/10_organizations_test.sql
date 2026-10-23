-- Testes da migração 0001: empresas, membros, perfis e isolamento.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('ana',   test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno')),
  ('carla', test.create_user('carla@example.com', 'Carla'));

select test.assert((select count(*) from public.profiles) = 3, 'perfil criado automaticamente no cadastro');
select test.assert((select display_name from public.profiles where id = (select v from ids where k='ana')) = 'Ana', 'nome do perfil vem do metadata');

-- ---------------------------------------------------------------- criação
select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_ana', (public.create_organization('Ana Ateliê', 'production', null, 2500)).id;
select test.assert((select slug from public.organizations where id = (select v from ids where k='org_ana')) = 'ana-atelie', 'slug gerado sem acento');
select test.assert((select role from public.organization_members where organization_id = (select v from ids where k='org_ana')) = 'owner', 'criador vira owner');
select test.assert((select enabled_modules from public.organizations where id = (select v from ids where k='org_ana')) = array['production']::public.business_type[], 'enabled_modules começa com o tipo principal');

select test.assert_fails($$select public.create_organization('Outra', 'resale', 'ana-atelie')$$, 'slug repetido é recusado', '23505');
select test.assert_fails($$select public.create_organization('x', 'resale')$$, 'nome curto é recusado', '22023');
select test.assert_fails($$select public.create_organization('!!!', 'resale')$$, 'nome sem letras gera slug inválido', '22023');
select test.assert(length((public.create_organization(repeat('Loja Muito Grande ', 4), 'resale')).slug) <= 48, 'slug longo é truncado em 48');

select test.assert_fails(
  $$insert into public.organizations (name, slug, business_type, enabled_modules, created_by)
    values ('Direto', 'direto', 'resale', array['resale']::public.business_type[], auth.uid())$$,
  'insert direto em organizations é bloqueado', '42501');
select test.assert_fails(
  $$insert into public.organization_members (organization_id, user_id, role)
    values ((select v from ids where k='org_ana'), auth.uid(), 'owner')$$,
  'insert direto em organization_members é bloqueado', '42501');

select test.logout();
select test.login_as((select v from ids where k='bruno'));
insert into ids select 'org_bruno', (public.create_organization('Bruno Reparos', 'services')).id;

-- ---------------------------------------------------------------- isolamento
select test.assert(test.row_count('select * from public.organizations') = 1, 'Bruno vê só a própria empresa');
select test.assert(test.row_count($$select * from public.organizations where id = (select v from ids where k='org_ana')$$) = 0, 'Bruno não lê a empresa da Ana');
select test.assert(test.row_count($$select * from public.organization_members where organization_id = (select v from ids where k='org_ana')$$) = 0, 'Bruno não lê os membros da Ana');
select test.assert(test.affected($$update public.organizations set name = 'Invadida' where id = (select v from ids where k='org_ana')$$) = 0, 'Bruno não altera a empresa da Ana');
select test.assert_fails($$delete from public.organizations where id = (select v from ids where k='org_ana')$$, 'delete de empresa não é permitido', '42501');
select test.assert_fails($$update public.organizations set business_type = 'resale' where id = (select v from ids where k='org_bruno')$$, 'tipo de negócio não muda por update direto', '42501');
select test.assert_fails($$update public.organizations set created_by = auth.uid() where id = (select v from ids where k='org_bruno')$$, 'created_by não pode ser alterado', '42501');
select test.assert(test.row_count('select * from public.profiles') = 1, 'Bruno só vê o próprio perfil (sem empresa em comum)');
select test.assert(test.affected($$update public.profiles set display_name = 'X' where id = (select v from ids where k='ana')$$) = 0, 'Bruno não altera o perfil da Ana');
select test.assert(test.affected($$update public.profiles set display_name = 'Bruno S.' where id = auth.uid()$$) = 1, 'Bruno altera o próprio perfil');
select test.assert(test.affected($$update public.organizations set hourly_rate_cents = 4000 where id = (select v from ids where k='org_bruno')$$) = 1, 'owner altera valor da hora da própria empresa');
select test.assert_fails($$update public.organizations set hourly_rate_cents = -1 where id = (select v from ids where k='org_bruno')$$, 'valor da hora negativo é recusado', '23514');

-- ---------------------------------------------------------------- membro comum
select test.logout();
insert into public.organization_members values ((select v from ids where k='org_ana'), (select v from ids where k='carla'), 'member');
select test.login_as((select v from ids where k='carla'));
select test.assert(test.row_count('select * from public.organizations') = 1, 'membro vê a empresa em que participa');
select test.assert(test.row_count('select * from public.profiles') = 2, 'membro vê o perfil dos colegas');
select test.assert(test.affected($$update public.organizations set name = 'Mudou' where id = (select v from ids where k='org_ana')$$) = 0, 'membro comum não altera dados da empresa');
select test.assert(app.is_member((select v from ids where k='org_ana')), 'is_member verdadeiro para a própria empresa');
select test.assert(not app.is_member((select v from ids where k='org_bruno')), 'is_member falso para empresa alheia');

-- ---------------------------------------------------------------- anônimo
select test.logout();
select test.login_anon();
select test.assert_fails('select * from public.organizations', 'anon não lê organizations', '42501');
select test.assert_fails('select * from public.organization_members', 'anon não lê organization_members', '42501');
select test.assert_fails('select * from public.profiles', 'anon não lê profiles', '42501');
select test.assert_fails($$select public.create_organization('Anon', 'resale')$$, 'anon não cria empresa', '42501');

select test.logout();
rollback;
