-- Testes da migração 0031: nota fiscal automática pelo Emissor Nacional.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
grant usage on schema test to service_role;

insert into ids values
  ('bia', test.create_user('bia@example.com', 'Bia')),
  ('rui', test.create_user('rui@example.com', 'Rui')),
  ('eva', test.create_user('eva@example.com', 'Eva'));

select test.login_as((select v from ids where k='bia'));
insert into ids select 'org', (public.create_organization('Studio Bia', 'services', 'studio-bia-nf', 0, 'beauty')).id;
with x as (insert into public.products (organization_id, item_type, name, price_cents, duration_minutes)
  values ((select v from ids where k='org'), 'service', 'Corte', 5000, 60) returning id)
insert into ids select 'corte', id from x;
with x as (insert into public.customers (organization_id, name, phone, document)
  values ((select v from ids where k='org'), 'Caio', '11977771111', '12345678901') returning id)
insert into ids select 'caio', id from x;
insert into ids select 'o1', (public.book_appointment((select v from ids where k='org'), (select v from ids where k='caio'),
  now() + interval '1 day', gen_random_uuid(), (select v from ids where k='corte'))).id;
select test.logout();

-- Rui entra como membro comum.
insert into public.organization_members (organization_id, user_id, role)
values ((select v from ids where k='org'), (select v from ids where k='rui'), 'member');

-- ================================================================ app não mexe direto
select test.login_as((select v from ids where k='bia'));
select test.assert_fails($$select public.nfse_save_connection((select v from ids where k='bia'), (select v from ids where k='org'),
  '12345678000199', '3550308', 'São Paulo', '060101', 'BIA', now() + interval '1 year', 'v1:abc:defghijklmnopqrstu')$$,
  'app não chama a função da service role', '42501');
select test.assert_fails($$insert into public.nfse_settings (organization_id, cnpj, city_ibge, city_name, service_code, updated_by)
  values ((select v from ids where k='org'), '12345678000199', '3550308', 'SP', '060101', (select v from ids where k='bia'))$$,
  'sem insert direto nas configurações', '42501');
select test.assert_fails($$select * from public.nfse_certificates$$, 'app não lê certificados', '42501');
select test.logout();

-- ================================================================ conectar (service role)
set role service_role;
select test.assert_fails($$select public.nfse_save_connection((select v from ids where k='rui'), (select v from ids where k='org'),
  '12345678000199', '3550308', 'São Paulo', '060101', 'BIA', now() + interval '1 year', 'v1:abc:defghijklmnopqrstu')$$,
  'membro comum não conecta', '42501');
select test.assert_fails($$select public.nfse_save_connection((select v from ids where k='bia'), (select v from ids where k='org'),
  '12345678000199', '3550308', 'São Paulo', '060101', 'BIA', now() - interval '1 day', 'v1:abc:defghijklmnopqrstu')$$,
  'certificado vencido recusado', '22023');
select from public.nfse_save_connection((select v from ids where k='bia'), (select v from ids where k='org'),
  '12345678000199', '3550308', 'São Paulo', '060101', 'BIA LTDA:12345678000199', now() + interval '1 year', 'v1:abc:defghijklmnopqrstu');
select test.assert((select connected and next_dps_number = 1 from public.nfse_settings where organization_id = (select v from ids where k='org')),
  'conexão salva');
select from public.nfse_update_settings((select v from ids where k='bia'), (select v from ids where k='org'), '3304557', 'Rio de Janeiro', '060201');
select test.assert((select city_ibge = '3304557' and service_code = '060201' from public.nfse_settings where organization_id = (select v from ids where k='org')),
  'cidade e código atualizados');

-- ================================================================ emitir
create temp table prep as select public.nfse_prepare_emission((select v from ids where k='rui'), (select v from ids where k='o1')) as j;
select test.assert((select (j->>'dps_number')::int = 1 and (j->>'amount_cents')::int = 5000 and j->>'customer_document' = '12345678901'
  and j->>'sealed' like 'v1:%' and jsonb_array_length(j->'items') = 1 from prep), 'membro prepara a emissão com os dados do pedido');
select test.assert((select next_dps_number = 2 from public.nfse_settings where organization_id = (select v from ids where k='org')),
  'número da DPS reservado');
select test.assert_fails($$select public.nfse_prepare_emission((select v from ids where k='bia'), (select v from ids where k='o1'))$$,
  'toque duplo fica travado', '55P03');
select from public.nfse_release_emission((select v from ids where k='bia'), (select v from ids where k='o1'));
select test.assert((select (public.nfse_prepare_emission((select v from ids where k='bia'), (select v from ids where k='o1'))->>'dps_number')::int = 2),
  'depois da recusa, tenta de novo com outro número');
select test.assert_fails($$select public.nfse_prepare_emission((select v from ids where k='eva'), (select v from ids where k='o1'))$$,
  'outra pessoa não emite', 'P0002');

insert into ids select 'n1', (public.nfse_record_emission((select v from ids where k='bia'), (select v from ids where k='o1'), '15',
  repeat('1', 50), (now() at time zone 'America/Sao_Paulo')::date)).id;
select test.assert((select source = 'emissor' and number = '15' and amount_cents = 5000 from public.service_invoices where id = (select v from ids where k='n1')),
  'nota do governo registrada');
select test.assert((public.nfse_record_emission((select v from ids where k='bia'), (select v from ids where k='o1'), '15',
  repeat('1', 50), (now() at time zone 'America/Sao_Paulo')::date)).id = (select v from ids where k='n1'), 'registrar de novo devolve a mesma');
select test.assert((select count(*) = 0 from public.nfse_emission_locks), 'trava solta depois da nota');
select test.assert_fails($$select public.nfse_prepare_emission((select v from ids where k='bia'), (select v from ids where k='o1'))$$,
  'pedido com nota não emite outra', '23505');

-- ================================================================ cancelar
select test.assert((select j->>'access_key' = repeat('1', 50) from (select public.nfse_invoice_context((select v from ids where k='rui'), (select v from ids where k='n1')) j) x),
  'contexto da nota para cancelar');
select test.assert_fails($$select public.nfse_invoice_context((select v from ids where k='eva'), (select v from ids where k='n1'))$$,
  'outra pessoa não cancela', 'P0002');
select test.assert_fails($$select public.nfse_record_cancel((select v from ids where k='bia'), (select v from ids where k='n1'), 'x')$$,
  'cancelar pede motivo', '22023');
select from public.nfse_record_cancel((select v from ids where k='bia'), (select v from ids where k='n1'), 'Erro na emissão');
select test.assert((select cancelled_at is not null from public.service_invoices where id = (select v from ids where k='n1')), 'nota cancelada');

-- ================================================================ desligar
select test.assert_fails($$select public.nfse_disconnect((select v from ids where k='rui'), (select v from ids where k='org'))$$,
  'membro comum não desliga', '42501');
select from public.nfse_disconnect((select v from ids where k='bia'), (select v from ids where k='org'));
select test.assert((select not connected and certificate_holder is null and next_dps_number = 3 from public.nfse_settings
  where organization_id = (select v from ids where k='org')), 'desligado, numeração mantida');
select test.assert((select count(*) = 0 from public.nfse_certificates), 'certificado apagado');
select test.assert_fails($$select public.nfse_prepare_emission((select v from ids where k='bia'), (select v from ids where k='o1'))$$,
  'sem conexão não emite', '55000');
reset role;

-- ================================================================ isolamento
select test.login_as((select v from ids where k='rui'));
select test.assert((select count(*) from public.nfse_settings) = 1, 'membro vê a configuração');
select test.logout();
select test.login_as((select v from ids where k='eva'));
select test.assert((select count(*) from public.nfse_settings) = 0, 'outra pessoa não vê a configuração');
select test.logout();

rollback;
