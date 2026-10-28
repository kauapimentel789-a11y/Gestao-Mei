-- 0031 — Nota fiscal automática pelo Emissor Nacional (API da NFS-e nacional).
--
-- A API do governo não tem login e senha: ela só aceita o certificado digital
-- A1 do CNPJ (conexão com certificado + DPS assinada). O MEI envia o arquivo
-- do certificado uma vez; a Edge Function `nota-fiscal` abre o arquivo com a
-- senha, guarda só o certificado e a chave já criptografados (a senha não fica
-- guardada) e, daí em diante, emite e cancela as notas sozinha.
--
-- * nfse_settings: o que o app mostra (CNPJ, cidade, código do serviço,
--   validade do certificado) e o número da próxima DPS. Membros leem; só a
--   Edge Function grava.
-- * nfse_certificates: o certificado criptografado. Ninguém do app lê; só a
--   service role (a Edge Function).
-- * service_invoices ganha a chave de acesso e a origem (manual ou emissor).
--
-- As funções abaixo são só da service role e recebem o usuário (p_user) que a
-- Edge Function já conferiu pelo token do app; elas conferem o papel dele.

create table public.nfse_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  city_ibge text not null check (city_ibge ~ '^[0-9]{7}$'),
  city_name text not null check (char_length(city_name) between 2 and 80),
  service_code text not null check (service_code ~ '^[0-9]{6}$'),
  connected boolean not null default true,
  certificate_holder text check (certificate_holder is null or char_length(certificate_holder) <= 300),
  certificate_expires_at timestamptz,
  -- Número da próxima DPS (série própria do app). Nunca volta: o governo
  -- recusa um número de DPS repetido.
  next_dps_number bigint not null default 1 check (next_dps_number between 1 and 999999999999999),
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  check (not connected or (certificate_holder is not null and certificate_expires_at is not null))
);

alter table public.nfse_settings enable row level security;
revoke all on public.nfse_settings from anon, authenticated;
grant select on public.nfse_settings to authenticated;
grant all on public.nfse_settings to service_role;
create policy nfse_settings_select on public.nfse_settings
  for select to authenticated using (app.is_member(organization_id));

create table public.nfse_certificates (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- "versão:iv:conteúdo" em base64, cifrado com AES-GCM pela Edge Function.
  sealed text not null check (char_length(sealed) between 20 and 60000),
  created_at timestamptz not null default now()
);

alter table public.nfse_certificates enable row level security;
revoke all on public.nfse_certificates from anon, authenticated;
grant all on public.nfse_certificates to service_role;

-- Trava a emissão do pedido enquanto a Edge Function fala com o governo, para
-- um toque duplo não gerar duas notas. Vale por 2 minutos.
create table public.nfse_emission_locks (
  order_id uuid primary key references public.orders (id) on delete cascade,
  locked_at timestamptz not null default now()
);
alter table public.nfse_emission_locks enable row level security;
revoke all on public.nfse_emission_locks from anon, authenticated;
grant all on public.nfse_emission_locks to service_role;

alter table public.service_invoices
  add column access_key text check (access_key is null or access_key ~ '^[0-9]{50}$'),
  add column source text not null default 'manual' check (source in ('manual', 'emissor'));
create unique index service_invoices_access_key_uq on public.service_invoices (access_key) where access_key is not null;

-- Papel de p_user na empresa (null se não for membro).
create function app.member_role_of(p_user uuid, p_org uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.organization_members m
  where m.organization_id = p_org and m.user_id = p_user;
$$;
revoke all on function app.member_role_of(uuid, uuid) from public;

-- Liga (ou troca) o certificado. Só dono ou admin.
create function public.nfse_save_connection(
  p_user uuid,
  p_org uuid,
  p_cnpj text,
  p_city_ibge text,
  p_city_name text,
  p_service_code text,
  p_holder text,
  p_expires_at timestamptz,
  p_sealed text
)
returns public.nfse_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.nfse_settings;
begin
  if app.member_role_of(p_user, p_org) is distinct from 'owner'
     and app.member_role_of(p_user, p_org) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'certificate_expired' using errcode = '22023';
  end if;

  insert into public.nfse_certificates (organization_id, sealed)
  values (p_org, p_sealed)
  on conflict (organization_id) do update set sealed = excluded.sealed, created_at = now();

  insert into public.nfse_settings as s (organization_id, cnpj, city_ibge, city_name, service_code, connected,
    certificate_holder, certificate_expires_at, updated_by)
  values (p_org, p_cnpj, p_city_ibge, trim(p_city_name), p_service_code, true, left(p_holder, 300), p_expires_at, p_user)
  on conflict (organization_id) do update
    set cnpj = excluded.cnpj, city_ibge = excluded.city_ibge, city_name = excluded.city_name,
        service_code = excluded.service_code, connected = true, certificate_holder = excluded.certificate_holder,
        certificate_expires_at = excluded.certificate_expires_at, updated_by = p_user, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- Muda só a cidade e o código do serviço, sem enviar o certificado de novo.
create function public.nfse_update_settings(p_user uuid, p_org uuid, p_city_ibge text, p_city_name text, p_service_code text)
returns public.nfse_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.nfse_settings;
begin
  if app.member_role_of(p_user, p_org) is distinct from 'owner'
     and app.member_role_of(p_user, p_org) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.nfse_settings s
  set city_ibge = p_city_ibge, city_name = trim(p_city_name), service_code = p_service_code,
      updated_by = p_user, updated_at = now()
  where s.organization_id = p_org
  returning * into v_row;
  if not found then
    raise exception 'not_connected' using errcode = '55000';
  end if;
  return v_row;
end;
$$;

-- Desliga: apaga o certificado guardado (é um segredo, não um registro do
-- negócio) e mantém a numeração da DPS para não repetir número depois.
create function public.nfse_disconnect(p_user uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.member_role_of(p_user, p_org) is distinct from 'owner'
     and app.member_role_of(p_user, p_org) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.nfse_certificates c where c.organization_id = p_org;
  update public.nfse_settings s
  set connected = false, certificate_holder = null, certificate_expires_at = null, updated_by = p_user, updated_at = now()
  where s.organization_id = p_org;
end;
$$;

-- Prepara a emissão do pedido: confere tudo, reserva o número da DPS e
-- devolve os dados da nota e o certificado. Qualquer membro emite.
create function public.nfse_prepare_emission(p_user uuid, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_settings public.nfse_settings;
  v_sealed text;
  v_customer record;
  v_number bigint;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or app.member_role_of(p_user, v_order.organization_id) is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'order_closed' using errcode = '55000';
  end if;
  if v_order.total_cents <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if exists (select 1 from public.service_invoices i where i.order_id = v_order.id and i.cancelled_at is null) then
    raise exception 'invoice_exists' using errcode = '23505';
  end if;

  if exists (select 1 from public.nfse_emission_locks l where l.order_id = v_order.id and l.locked_at > now() - interval '2 minutes') then
    raise exception 'emission_in_progress' using errcode = '55P03';
  end if;

  select * into v_settings from public.nfse_settings s where s.organization_id = v_order.organization_id for update;
  select c.sealed into v_sealed from public.nfse_certificates c where c.organization_id = v_order.organization_id;
  if v_settings.organization_id is null or not v_settings.connected or v_sealed is null then
    raise exception 'not_connected' using errcode = '55000';
  end if;
  if v_settings.certificate_expires_at <= now() then
    raise exception 'certificate_expired' using errcode = '22023';
  end if;

  v_number := v_settings.next_dps_number;
  update public.nfse_settings s set next_dps_number = v_number + 1 where s.organization_id = v_settings.organization_id;
  insert into public.nfse_emission_locks (order_id) values (v_order.id)
  on conflict (order_id) do update set locked_at = now();

  select c.name, c.document into v_customer from public.customers c
  where c.organization_id = v_order.organization_id and c.id = v_order.customer_id;

  return jsonb_build_object(
    'organization_id', v_order.organization_id,
    'order_number', v_order.number,
    'amount_cents', v_order.total_cents,
    'customer_name', v_customer.name,
    'customer_document', v_customer.document,
    'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity) order by i.position)
                       from public.order_items i where i.order_id = v_order.id), '[]'::jsonb),
    'cnpj', v_settings.cnpj,
    'city_ibge', v_settings.city_ibge,
    'service_code', v_settings.service_code,
    'dps_number', v_number,
    'sealed', v_sealed
  );
end;
$$;

-- Guarda a nota que o governo autorizou.
create function public.nfse_record_emission(p_user uuid, p_order_id uuid, p_number text, p_access_key text, p_issued_on date)
returns public.service_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_row public.service_invoices;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or app.member_role_of(p_user, v_order.organization_id) is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  delete from public.nfse_emission_locks l where l.order_id = v_order.id;
  select * into v_row from public.service_invoices i where i.access_key = p_access_key;
  if found then
    return v_row;
  end if;
  insert into public.service_invoices (organization_id, order_id, number, issued_on, amount_cents, created_by, access_key, source)
  values (v_order.organization_id, v_order.id, p_number, p_issued_on, v_order.total_cents, p_user, p_access_key, 'emissor')
  returning * into v_row;
  return v_row;
end;
$$;

-- O governo recusou a nota: solta a trava para tentar de novo.
create function public.nfse_release_emission(p_user uuid, p_order_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.nfse_emission_locks l
  where l.order_id = p_order_id
    and exists (select 1 from public.orders o where o.id = p_order_id
                and app.member_role_of(p_user, o.organization_id) is not null);
$$;

-- Dados para cancelar (ou baixar o PDF de) uma nota emitida pelo app.
create function public.nfse_invoice_context(p_user uuid, p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.service_invoices;
  v_settings public.nfse_settings;
  v_sealed text;
begin
  select * into v_inv from public.service_invoices i where i.id = p_invoice_id;
  if not found or app.member_role_of(p_user, v_inv.organization_id) is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_inv.access_key is null then
    raise exception 'not_from_emissor' using errcode = '55000';
  end if;
  select * into v_settings from public.nfse_settings s where s.organization_id = v_inv.organization_id;
  select c.sealed into v_sealed from public.nfse_certificates c where c.organization_id = v_inv.organization_id;
  if v_settings.organization_id is null or not v_settings.connected or v_sealed is null then
    raise exception 'not_connected' using errcode = '55000';
  end if;
  return jsonb_build_object(
    'access_key', v_inv.access_key,
    'cancelled', v_inv.cancelled_at is not null,
    'cnpj', v_settings.cnpj,
    'sealed', v_sealed
  );
end;
$$;

-- O governo registrou o cancelamento: marca a nota (nada é apagado).
create function public.nfse_record_cancel(p_user uuid, p_invoice_id uuid, p_reason text)
returns public.service_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.service_invoices;
  v_reason text := nullif(trim(p_reason), '');
begin
  select * into v_row from public.service_invoices i where i.id = p_invoice_id for update;
  if not found or app.member_role_of(p_user, v_row.organization_id) is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_row.cancelled_at is not null then
    return v_row;
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'cancel_reason_required' using errcode = '22023';
  end if;
  update public.service_invoices i
  set cancelled_at = now(), cancel_reason = left(v_reason, 300)
  where i.id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.nfse_save_connection(uuid, uuid, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.nfse_update_settings(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.nfse_disconnect(uuid, uuid) from public, anon, authenticated;
revoke all on function public.nfse_prepare_emission(uuid, uuid) from public, anon, authenticated;
revoke all on function public.nfse_record_emission(uuid, uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.nfse_release_emission(uuid, uuid) from public, anon, authenticated;
revoke all on function public.nfse_invoice_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.nfse_record_cancel(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.nfse_save_connection(uuid, uuid, text, text, text, text, text, timestamptz, text) to service_role;
grant execute on function public.nfse_update_settings(uuid, uuid, text, text, text) to service_role;
grant execute on function public.nfse_disconnect(uuid, uuid) to service_role;
grant execute on function public.nfse_prepare_emission(uuid, uuid) to service_role;
grant execute on function public.nfse_record_emission(uuid, uuid, text, text, date) to service_role;
grant execute on function public.nfse_release_emission(uuid, uuid) to service_role;
grant execute on function public.nfse_invoice_context(uuid, uuid) to service_role;
grant execute on function public.nfse_record_cancel(uuid, uuid, text) to service_role;
grant execute on function app.member_role_of(uuid, uuid) to service_role;
grant usage on schema app to service_role;
