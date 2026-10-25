-- 0020 — Nota fiscal de serviço guiada (NFS-e pelo Emissor Nacional).
--
-- O MEI emite a NFS-e de graça no Emissor Nacional do governo (gov.br). O app
-- não emite: junta os dados para copiar (cliente, CPF/CNPJ, descrição, valor e
-- data) e depois guarda o número da nota emitida, para saber o que já tem nota.
--
-- * customers.document: CPF (11 dígitos) ou CNPJ (14), opcional.
-- * service_invoices: uma nota registrada por atendimento/pedido. Nada é
--   apagado: nota cancelada no Emissor fica com data e motivo, e o pedido pode
--   receber outra.

alter table public.customers
  add column document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$');
grant insert (document) on public.customers to authenticated;
grant update (document) on public.customers to authenticated;

create table public.service_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  number text not null check (number ~ '^[0-9A-Za-z./-]{1,30}$'),
  issued_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) between 3 and 300),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.orders (organization_id, id),
  check ((cancelled_at is null) = (cancel_reason is null))
);
-- Uma nota válida por pedido; o mesmo número não se repete na empresa.
create unique index service_invoices_order_active_uq on public.service_invoices (order_id) where cancelled_at is null;
create unique index service_invoices_org_number_uq on public.service_invoices (organization_id, number) where cancelled_at is null;
create index service_invoices_org_idx on public.service_invoices (organization_id, issued_on desc);

alter table public.service_invoices enable row level security;
revoke all on public.service_invoices from anon, authenticated;
grant select on public.service_invoices to authenticated;
create policy service_invoices_select on public.service_invoices
  for select to authenticated using (app.is_member(organization_id));

-- Registra a nota emitida no Emissor Nacional para o pedido.
create function public.register_service_invoice(p_order_id uuid, p_number text, p_issued_on date)
returns public.service_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_user uuid;
  v_number text := upper(trim(coalesce(p_number, '')));
  v_row public.service_invoices;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_order.organization_id);
  if v_order.status = 'cancelled' then
    raise exception 'order_closed' using errcode = '55000';
  end if;
  if v_order.total_cents <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if v_number !~ '^[0-9A-Z./-]{1,30}$' then
    raise exception 'invalid_invoice_number' using errcode = '22023';
  end if;
  if p_issued_on is null or p_issued_on > v_today or p_issued_on < v_today - 366 then
    raise exception 'invalid_issue_date' using errcode = '22023';
  end if;

  -- Mesmo número de novo para o mesmo pedido (toque duplo): devolve a nota.
  select * into v_row from public.service_invoices i
  where i.order_id = v_order.id and i.cancelled_at is null;
  if found then
    if v_row.number = v_number then
      return v_row;
    end if;
    raise exception 'invoice_exists' using errcode = '23505';
  end if;
  if exists (select 1 from public.service_invoices i
             where i.organization_id = v_order.organization_id and i.number = v_number and i.cancelled_at is null) then
    raise exception 'invoice_number_taken' using errcode = '23505';
  end if;

  insert into public.service_invoices (organization_id, order_id, number, issued_on, amount_cents, created_by)
  values (v_order.organization_id, v_order.id, v_number, p_issued_on, v_order.total_cents, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

-- A nota foi cancelada no Emissor Nacional: registra aqui com o motivo.
create function public.cancel_service_invoice(p_invoice_id uuid, p_reason text)
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
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform app.assert_member(v_row.organization_id);
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

revoke all on function public.register_service_invoice(uuid, text, date) from public, anon;
revoke all on function public.cancel_service_invoice(uuid, text) from public, anon;
grant execute on function public.register_service_invoice(uuid, text, date) to authenticated;
grant execute on function public.cancel_service_invoice(uuid, text) to authenticated;
