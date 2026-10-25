-- Testes da migração 0017: dados da página de agendamento.
\set ON_ERROR_STOP on
begin;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

insert into ids values
  ('dani', test.create_user('dani@example.com', 'Dani')),
  ('eva',  test.create_user('eva@example.com', 'Eva'));

select test.login_as((select v from ids where k='dani'));
insert into ids select 'org_d', (public.create_organization('Studio Dani', 'services', 'studio-dani', 0, 'beauty')).id;
insert into public.products (organization_id, item_type, name, price_cents, duration_minutes)
  values ((select v from ids where k='org_d'), 'service', 'Corte', 5000, 30);
select from public.set_business_hours((select v from ids where k='org_d'),
  '[{"weekday": 1, "opens_at": "09:00", "closes_at": "12:00"}, {"weekday": 1, "opens_at": "13:00", "closes_at": "18:30"}]');
select test.logout();
select from app.set_plan('studio-dani', 'pro_max');

select test.login_as((select v from ids where k='dani'));
update public.organizations set online_booking_enabled = true where id = (select v from ids where k='org_d');
select test.assert(test.affected($$update public.organizations set public_tagline = 'Seu estilo, nosso cuidado', public_about = 'Cortes com hora marcada.',
  public_whatsapp = '11999998888', public_address = 'Rua das Flores, 10 - Centro', public_instagram = 'studio.dani'
  where id = (select v from ids where k='org_d')$$) = 1, 'dono preenche a página');
select test.assert_fails($$update public.organizations set public_whatsapp = '(11) 99999-8888' where id = (select v from ids where k='org_d')$$,
  'WhatsApp só com dígitos', '23514');
select test.assert_fails($$update public.organizations set public_instagram = '@studio' where id = (select v from ids where k='org_d')$$,
  'Instagram sem @', '23514');
select test.assert_fails($$update public.organizations set public_tagline = repeat('x', 81) where id = (select v from ids where k='org_d')$$,
  'frase longa recusada', '23514');
select test.logout();

select test.login_as((select v from ids where k='eva'));
select test.assert(test.affected($$update public.organizations set public_tagline = 'Invadido' where id = (select v from ids where k='org_d')$$) = 0,
  'outra pessoa não muda a página');
select test.logout();

set role service_role;
select public.public_booking_page('studio-dani') as pg \gset
reset role;
select test.assert((:'pg'::jsonb ->> 'tagline') = 'Seu estilo, nosso cuidado' and (:'pg'::jsonb ->> 'whatsapp') = '11999998888'
  and (:'pg'::jsonb ->> 'instagram') = 'studio.dani' and (:'pg'::jsonb ->> 'practice_area') = 'beauty', 'página traz os dados do negócio');
select test.assert((:'pg'::jsonb -> 'hours') = '[{"weekday": 1, "opens_at": "09:00", "closes_at": "12:00"}, {"weekday": 1, "opens_at": "13:00", "closes_at": "18:30"}]'::jsonb,
  'página traz os turnos em HH:MM');
select test.assert(not (:'pg'::jsonb ? 'pix_key') and not (:'pg'::jsonb ? 'plan'), 'página não expõe Pix nem plano');

rollback;
