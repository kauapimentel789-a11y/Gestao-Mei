-- 0017 — Dados da página de agendamento (plano Pro Max).
--
-- O dono ou admin preenche o que aparece para o cliente na página
-- /agendar/<slug>: uma frase de apresentação, um texto curto, WhatsApp,
-- endereço e Instagram. Tudo opcional; o que estiver vazio não aparece.
-- A página também passa a mostrar o horário de funcionamento completo.
-- Nada disso é sigiloso: é o que o próprio negócio divulga.

alter table public.organizations
  add column public_tagline text check (public_tagline is null or char_length(public_tagline) between 2 and 80),
  add column public_about text check (public_about is null or char_length(public_about) between 2 and 300),
  -- Só dígitos, com DDD e opcionalmente o 55.
  add column public_whatsapp text check (public_whatsapp is null or public_whatsapp ~ '^\d{10,13}$'),
  add column public_address text check (public_address is null or char_length(public_address) between 5 and 160),
  -- Sem o @.
  add column public_instagram text check (public_instagram is null or public_instagram ~ '^[A-Za-z0-9._]{1,30}$');

grant update (public_tagline, public_about, public_whatsapp, public_address, public_instagram)
  on public.organizations to authenticated;

create or replace function public.public_booking_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations := app.booking_org(p_slug);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  return jsonb_build_object(
    'name', v_org.name,
    'slug', v_org.slug,
    'practice_area', v_org.practice_area,
    'tagline', v_org.public_tagline,
    'about', v_org.public_about,
    'whatsapp', v_org.public_whatsapp,
    'address', v_org.public_address,
    'instagram', v_org.public_instagram,
    'today', v_today,
    'last_day', v_today + 60,
    'weekdays', coalesce((
      select jsonb_agg(distinct h.weekday) from public.business_hours h where h.organization_id = v_org.id), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', h.weekday, 'opens_at', to_char(h.opens_at, 'HH24:MI'), 'closes_at', to_char(h.closes_at, 'HH24:MI')
      ) order by h.weekday, h.opens_at)
      from public.business_hours h where h.organization_id = v_org.id), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description,
        'price_cents', p.price_cents, 'duration_minutes', coalesce(p.duration_minutes, 60)
      ) order by lower(p.name))
      from public.products p
      where p.organization_id = v_org.id and p.active and p.item_type = 'service' and p.price_cents > 0), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.public_booking_page(text) from public, anon, authenticated;
grant execute on function public.public_booking_page(text) to service_role;
