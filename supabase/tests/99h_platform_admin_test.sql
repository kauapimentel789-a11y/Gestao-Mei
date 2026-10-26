-- Testes da migração 0021: painel do dono da plataforma.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('dono', test.create_user('Dono@Example.com', 'Dono')),
  ('bia', test.create_user('bia@example.com', 'Bia')),
  ('novo', test.create_user('novo@example.com', 'Novo'));
select app.add_platform_admin(' dono@example.COM ');
update auth.users set last_sign_in_at = now() where id = (select v from ids where k='bia');

select test.login_as((select v from ids where k='bia'));
insert into ids select 'org', (public.create_organization('Studio Bia', 'services', 'studio-bia', 0, 'beauty')).id;
insert into public.customers (organization_id, name) values ((select v from ids where k='org'), 'Caio');

-- ================================================================ acesso
select test.assert(not public.is_platform_admin(), 'usuário comum não é administrador');
select test.assert_fails($$select public.admin_dashboard(30)$$, 'usuário comum não abre o painel', '42501');
select test.assert_fails($$select * from app.platform_admins$$, 'usuário comum não lê a lista', '42501');
select test.assert_fails($$insert into app.platform_admins values (repeat('a', 64))$$, 'usuário comum não se inclui', '42501');
select test.assert_fails($$select app.add_platform_admin('bia@example.com')$$, 'usuário comum não chama add_platform_admin', '42501');
select test.logout();

select test.login_anon();
select test.assert_fails($$select public.admin_dashboard(30)$$, 'visitante não abre o painel', '42501');
select test.logout();

update auth.users set email_confirmed_at = null where id = (select v from ids where k='dono');
select test.login_as((select v from ids where k='dono'));
select test.assert(not public.is_platform_admin(), 'e-mail não confirmado não vale');
select test.logout();
update auth.users set email_confirmed_at = now() where id = (select v from ids where k='dono');

-- ================================================================ painel
select test.login_as((select v from ids where k='dono'));
select test.assert(public.is_platform_admin(), 'dono é administrador (e-mail sem diferença de maiúsculas)');
select test.assert_fails($$select public.admin_dashboard(10)$$, 'período inválido', '22023');

create temp table d as select public.admin_dashboard(30) as j;
select test.assert((select (j #>> '{users,total}')::int >= 3 from d), 'conta os usuários');
select test.assert((select (j #>> '{users,new}')::int >= 3 from d), 'cadastros novos no período');
select test.assert((select (j #>> '{users,without_company}')::int >= 2 from d), 'quem não criou empresa');
select test.assert((select (j #>> '{users,signed_in_7d}')::int >= 1 from d), 'quem entrou nos últimos 7 dias');
select test.assert((select (j #>> '{by_type,appointments}')::int >= 1 from d), 'empresa por hora marcada');
select test.assert((select (j #>> '{organizations,active_7d}')::int >= 1 from d), 'empresa ativa');
select test.assert((select jsonb_array_length(j -> 'series') = 30 from d), 'série de 30 dias');
select test.assert((select (j -> 'series' -> -1 ->> 'users')::int >= 3 from d), 'cadastros de hoje na série');
select test.assert((select exists (select 1 from jsonb_array_elements(j -> 'recent_signups') e
  where e ->> 'email' = 'bia@example.com' and e ->> 'organization' = 'Studio Bia' and e ->> 'plan' = 'free') from d),
  'lista de cadastros com a empresa');
select test.assert((select jsonb_array_length(public.admin_dashboard(365) -> 'series') = 12), 'série de 12 meses');
select test.assert((select jsonb_array_length(public.admin_dashboard(7) -> 'series') = 7), 'série de 7 dias');
select test.logout();

rollback;
