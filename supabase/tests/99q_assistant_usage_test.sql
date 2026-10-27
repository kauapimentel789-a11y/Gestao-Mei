-- Testes da migração 0030: limite de perguntas do assistente.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into ids values
  ('ana', test.create_user('ana@example.com', 'Ana')),
  ('bruno', test.create_user('bruno@example.com', 'Bruno'));

select test.login_as((select v from ids where k='ana'));
insert into ids select 'pes', (public.create_personal_space()).id;
insert into ids select 'emp', (public.create_organization('Doces da Ana', 'production')).id;

select test.assert_fails($$select public.assistant_take_turn((select v from ids where k='emp'))$$, 'só no espaço pessoal', '55000');
select test.assert(public.assistant_take_turn((select v from ids where k='pes')) = 29, 'primeira pergunta: restam 29');
select public.assistant_record_usage((select v from ids where k='pes'), 1200, 300);
select public.assistant_record_usage((select v from ids where k='pes'), 800, 200);
select test.assert((select questions = 1 and input_tokens = 2000 and output_tokens = 500 from public.assistant_usage
  where organization_id = (select v from ids where k='pes')), 'conta perguntas e tokens');
select test.assert_fails($$select public.assistant_record_usage((select v from ids where k='pes'), -1, 0)$$, 'tokens negativos', '22023');
select test.assert_fails($$update public.assistant_usage set questions = 0$$, 'não zera o próprio contador', '42501');

select count(public.assistant_take_turn((select v from ids where k='pes'))) from generate_series(1, 29);
select test.assert_fails($$select public.assistant_take_turn((select v from ids where k='pes'))$$, 'no máximo 30 por dia', '54000');
select test.logout();

-- Outra pessoa não usa o espaço nem vê o uso da Ana.
select test.login_as((select v from ids where k='bruno'));
select test.assert_fails($$select public.assistant_take_turn((select v from ids where k='pes'))$$, 'quem não é do espaço não pergunta');
select test.assert(not exists (select 1 from public.assistant_usage), 'não vê o uso de outra pessoa');
insert into ids select 'pes_b', (public.create_personal_space()).id;
select test.assert(public.assistant_take_turn((select v from ids where k='pes_b')) = 29, 'o limite é de cada pessoa');
select test.logout();

select test.login_anon();
select test.assert_fails($$select public.assistant_take_turn((select v from ids where k='pes'))$$, 'anônimo não pergunta');
select test.logout();

rollback;
