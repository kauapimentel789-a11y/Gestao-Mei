-- Testes da migração 0015: chave Pix da empresa.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('ana',  test.create_user('ana@example.com', 'Ana')),
  ('bia',  test.create_user('bia@example.com', 'Bia')),
  ('caio', test.create_user('caio@example.com', 'Caio'));

select test.login_as((select v from ids where k='ana'));
insert into ids select 'org_a', (public.create_organization('Ana Ateliê', 'production')).id;
select test.logout();
select test.login_as((select v from ids where k='bia'));
insert into ids select 'org_b', (public.create_organization('Bia Doces', 'production')).id;
select test.logout();
insert into public.organization_members values ((select v from ids where k='org_a'), (select v from ids where k='caio'), 'member');

select test.login_as((select v from ids where k='ana'));
select test.assert((select pix_key is null from public.organizations where id = (select v from ids where k='org_a')), 'empresa nasce sem chave');
select test.assert(test.affected($$update public.organizations set pix_key_type = 'phone', pix_key = '+5511988887777', pix_name = 'Ana Ateliê', pix_city = 'São Paulo'
  where id = (select v from ids where k='org_a')$$) = 1, 'dono cadastra a chave');
select test.assert(test.affected($$update public.organizations set pix_key_type = 'cpf', pix_key = '12345678909'
  where id = (select v from ids where k='org_a')$$) = 1, 'dono troca a chave');
select test.assert(test.affected($$update public.organizations set pix_key_type = 'random', pix_key = '123e4567-e89b-12d3-a456-426614174000'
  where id = (select v from ids where k='org_a')$$) = 1, 'chave aleatória aceita');
select test.assert(test.affected($$update public.organizations set pix_key_type = 'email', pix_key = 'ana@ateliê.com.br'
  where id = (select v from ids where k='org_a')$$) = 1, 'e-mail aceito');

select test.assert_fails($$update public.organizations set pix_key_type = 'cpf', pix_key = '123.456.789-09' where id = (select v from ids where k='org_a')$$,
  'CPF com pontuação recusado', '23514');
select test.assert_fails($$update public.organizations set pix_key_type = 'phone', pix_key = '11988887777' where id = (select v from ids where k='org_a')$$,
  'celular sem +55 recusado', '23514');
select test.assert_fails($$update public.organizations set pix_key_type = 'email', pix_key = 'Ana@Exemplo.com' where id = (select v from ids where k='org_a')$$,
  'e-mail com maiúsculas recusado', '23514');
select test.assert_fails($$update public.organizations set pix_key_type = null where id = (select v from ids where k='org_a')$$,
  'chave sem tipo recusada', '23514');
select test.assert_fails($$update public.organizations set pix_city = null where id = (select v from ids where k='org_a')$$,
  'chave sem cidade recusada', '23514');
select test.assert_fails($$update public.organizations set pix_name = 'Um nome comprido demais para o Pix' where id = (select v from ids where k='org_a')$$,
  'nome acima de 25 letras recusado', '23514');
select test.assert(test.affected($$update public.organizations set pix_key_type = null, pix_key = null, pix_name = null, pix_city = null
  where id = (select v from ids where k='org_a')$$) = 1, 'dono remove a chave');
update public.organizations set pix_key_type = 'cnpj', pix_key = '12345678000195', pix_name = 'Ana Ateliê', pix_city = 'Santos'
  where id = (select v from ids where k='org_a');
select test.logout();

-- ================================================================ permissões
select test.login_as((select v from ids where k='caio'));
select test.assert((select pix_key = '12345678000195' from public.organizations where id = (select v from ids where k='org_a')), 'membro lê a chave para cobrar');
select test.assert(test.affected($$update public.organizations set pix_key = '00000000000191' where id = (select v from ids where k='org_a')$$) = 0,
  'membro não muda a chave');
select test.logout();

select test.login_as((select v from ids where k='bia'));
select test.assert(test.row_count($$select * from public.organizations where id = (select v from ids where k='org_a')$$) = 0, 'outra empresa não lê a chave');
select test.assert(test.affected($$update public.organizations set pix_key = '00000000000191' where id = (select v from ids where k='org_a')$$) = 0,
  'outra empresa não muda a chave');
select test.logout();

select test.login_anon();
select test.assert_fails($$select pix_key from public.organizations$$, 'anon não lê a chave', '42501');
select test.logout();

rollback;
