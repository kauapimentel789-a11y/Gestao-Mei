-- Testes da migração 0029: dividir Minhas finanças com a família.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('ana', test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('Bruno@Example.com', 'Bruno')),
  ('carla', test.create_user('carla@example.com', 'Carla'));

-- Ana tem o espaço pessoal e uma empresa.
select test.login_as((select v from ids where k='ana'));
insert into ids select 'pes', (public.create_personal_space()).id;
insert into ids select 'emp', (public.create_organization('Doces da Ana', 'production')).id;
insert into ids select 'mercado', id from public.financial_categories where organization_id = (select v from ids where k='pes') and name = 'Mercado';

select test.assert_fails($$select public.invite_to_space((select v from ids where k='emp'), 'bruno@example.com')$$,
  'convite só no espaço pessoal', '55000');
select test.assert_fails($$select public.invite_to_space((select v from ids where k='pes'), 'nao-e-email')$$, 'e-mail inválido', '22023');
select test.assert_fails($$select public.invite_to_space((select v from ids where k='pes'), 'ANA@example.com')$$, 'já é do espaço', '23505');

insert into ids select 'conv_b', (public.invite_to_space((select v from ids where k='pes'), '  BRUNO@example.com ')).id;
select test.assert((public.invite_to_space((select v from ids where k='pes'), 'bruno@example.com')).id = (select v from ids where k='conv_b'),
  'convidar de novo não duplica');
select test.assert((select email from public.organization_invites where id = (select v from ids where k='conv_b')) = 'bruno@example.com',
  'e-mail guardado em minúsculas');
insert into ids select 'conv_c', (public.invite_to_space((select v from ids where k='pes'), 'carla@example.com')).id;
select test.logout();

-- ================================================================ quem foi convidado
select test.login_as((select v from ids where k='carla'));
select test.assert((select count(*) from public.my_invites()) = 1, 'Carla vê só o convite dela');
select test.assert_fails($$select public.answer_invite((select v from ids where k='conv_b'), true)$$, 'não aceita convite de outro e-mail', 'P0002');
select test.assert(not exists (select 1 from public.organization_invites), 'quem não é do espaço não lê os convites');
select test.assert(public.answer_invite((select v from ids where k='conv_c'), false) is null, 'recusar');
select test.assert((select count(*) from public.my_invites()) = 0, 'convite recusado some');
select test.assert_fails($$select public.answer_invite((select v from ids where k='conv_c'), true)$$, 'convite recusado não se aceita depois', '55000');
select test.assert(not app.is_member((select v from ids where k='pes')), 'Carla não entrou');
select test.logout();

select test.login_as((select v from ids where k='bruno'));
select test.assert((select invited_by_name from public.my_invites()) = 'Ana', 'convite mostra quem convidou');
select test.assert(not exists (select 1 from public.financial_entries where organization_id = (select v from ids where k='pes')),
  'antes de aceitar não vê nada');
select test.assert(public.answer_invite((select v from ids where k='conv_b'), true) = (select v from ids where k='pes'), 'aceitar');
select test.assert(public.answer_invite((select v from ids where k='conv_b'), true) = (select v from ids where k='pes'), 'aceitar de novo não falha');
select test.assert(app.has_role((select v from ids where k='pes'), array['admin']::public.member_role[]), 'entra como admin');
select test.assert(not app.is_member((select v from ids where k='emp')), 'não entra na empresa da Ana');

-- Bruno lança e vê o que a Ana lança.
select from public.create_financial_entry((select v from ids where k='pes'), 'payable', 'Feira', 12000,
  (select v from ids where k='mercado'), current_date, gen_random_uuid());
select test.assert((select count(*) from public.space_members((select v from ids where k='pes'))) = 2, 'lista as duas pessoas');
select test.assert((select role from public.space_members((select v from ids where k='pes')) limit 1) = 'owner', 'dono primeiro');
select test.assert_fails($$select public.remove_space_member((select v from ids where k='pes'), (select v from ids where k='ana'))$$,
  'ninguém tira o dono', '55000');
select test.logout();

select test.login_as((select v from ids where k='ana'));
select test.assert((select count(*) from public.financial_entries where organization_id = (select v from ids where k='pes')) = 1,
  'Ana vê o lançamento do Bruno');
select test.assert((select count(*) from public.organization_invites where organization_id = (select v from ids where k='pes')) = 2,
  'quem é do espaço vê o histórico de convites');
select test.assert_fails($$select public.remove_space_member((select v from ids where k='pes'), (select v from ids where k='ana'))$$,
  'dono não sai', '55000');

-- Limite de 6 pessoas, contando convites em aberto.
select count(public.invite_to_space((select v from ids where k='pes'), 'p' || n || '@example.com')) from generate_series(1, 4) n;
select test.assert_fails($$select public.invite_to_space((select v from ids where k='pes'), 'p5@example.com')$$, 'no máximo 6 pessoas', '55000');
select public.revoke_invite(id) from public.organization_invites where email = 'p4@example.com';
select from public.invite_to_space((select v from ids where k='pes'), 'p5@example.com');
select test.logout();

-- ================================================================ sair e ser tirado
select test.login_as((select v from ids where k='bruno'));
select public.remove_space_member((select v from ids where k='pes'), (select v from ids where k='bruno'));
select test.assert(not app.is_member((select v from ids where k='pes')), 'Bruno saiu');
select test.assert(not exists (select 1 from public.financial_entries where organization_id = (select v from ids where k='pes')),
  'depois de sair não vê mais nada');
select test.assert_fails($$select public.invite_to_space((select v from ids where k='pes'), 'x@example.com')$$, 'quem saiu não convida');
select test.assert_fails($$select * from public.space_members((select v from ids where k='pes'))$$, 'nem vê quem está');
select test.logout();

select test.assert((select count(*) from public.financial_entries where organization_id = (select v from ids where k='pes')) = 1,
  'lançamento do Bruno continua no espaço');

-- Admin tira outra pessoa; membro que não é admin não tira.
update public.organization_invites set accepted_at = null, accepted_by = null, expires_at = now() + interval '1 day'
  where id = (select v from ids where k='conv_b');
select test.login_as((select v from ids where k='bruno'));
select public.answer_invite((select v from ids where k='conv_b'), true);
select test.logout();
update public.organization_members set role = 'member'
  where organization_id = (select v from ids where k='pes') and user_id = (select v from ids where k='bruno');
select test.login_as((select v from ids where k='bruno'));
select test.assert_fails($$select public.invite_to_space((select v from ids where k='pes'), 'y@example.com')$$, 'membro comum não convida', '42501');
select test.logout();
select test.login_as((select v from ids where k='ana'));
select public.remove_space_member((select v from ids where k='pes'), (select v from ids where k='bruno'));
select test.assert((select count(*) from public.space_members((select v from ids where k='pes'))) = 1, 'dono tirou o Bruno');
select test.logout();

-- ================================================================ anônimo
select test.login_anon();
select test.assert_fails($$select * from public.my_invites()$$, 'anônimo não vê convites');
select test.logout();

rollback;
