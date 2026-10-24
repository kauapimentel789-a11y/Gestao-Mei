-- 0005 — Financeiro essencial: contas, categorias, títulos, baixas e
-- transferências.
--
-- Regras (ADENDO, item C):
-- * Título (financial_entries) é o compromisso: a receber ou a pagar. Contas a
--   receber e a pagar são visões desta tabela.
-- * Baixa (financial_payments) é o dinheiro que efetivamente entrou ou saiu.
--   O caixa é calculado só pelas baixas, transferências e saldos iniciais.
-- * Valor em aberto = valor do título − baixas (estornos entram negativos).
--   Status (pendente, parcial, pago, vencido, cancelado) é derivado, nunca
--   gravado.
-- * Nada é apagado: baixa errada se corrige com estorno, título com
--   cancelamento (só sem baixas), transferência com transferência inversa.
-- * Pedido gera no máximo um título (unique order_id); receber de novo só
--   abate o mesmo título.
-- * Transferência entre contas nunca entra em receita nem despesa.

create type public.financial_account_kind as enum ('cash', 'bank', 'digital_wallet', 'other');
create type public.financial_direction as enum ('receivable', 'payable');
create type public.category_nature as enum (
  'operating_revenue',  -- vendas e serviços
  'other_revenue',      -- outras receitas
  'operating_expense',  -- despesas do dia a dia (entram no resultado)
  'inventory_purchase', -- compra de mercadoria ou matéria-prima
  'investment',         -- equipamentos e ferramentas
  'owner_withdrawal',   -- retirada do dono
  'tax'                 -- impostos e taxas (DAS)
);
create type public.payment_method as enum ('pix', 'cash', 'debit_card', 'credit_card', 'bank_transfer', 'boleto', 'other');

-- ---------------------------------------------------------------------------
-- Contas financeiras
-- ---------------------------------------------------------------------------

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  kind public.financial_account_kind not null default 'cash',
  -- Saldo informado pelo usuário na data de referência. Não muda depois.
  opening_balance_cents bigint not null default 0 check (opening_balance_cents between -100000000000 and 100000000000),
  opening_date date not null default current_date,
  active boolean not null default true,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index financial_accounts_name_uq on public.financial_accounts (organization_id, lower(trim(name)));
create trigger financial_accounts_updated_at before update on public.financial_accounts
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  direction public.financial_direction not null,
  nature public.category_nature not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint financial_categories_nature_direction check (
    (direction = 'receivable') = (nature in ('operating_revenue', 'other_revenue'))
  )
);
create unique index financial_categories_name_uq on public.financial_categories (organization_id, direction, lower(trim(name)));

-- ---------------------------------------------------------------------------
-- Títulos
-- ---------------------------------------------------------------------------

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  direction public.financial_direction not null,
  description text not null check (char_length(trim(description)) between 2 and 120),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  -- Soma das baixas (estornos negativos). Mantida pelas RPCs com a linha travada.
  paid_cents bigint not null default 0,
  competence_date date not null,
  due_date date not null,
  category_id uuid not null,
  customer_id uuid,
  order_id uuid unique,
  notes text check (notes is null or char_length(notes) <= 1000),
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  idempotency_key uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, category_id) references public.financial_categories (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  foreign key (organization_id, order_id) references public.orders (organization_id, id),
  constraint financial_entries_paid_range check (paid_cents between 0 and amount_cents),
  constraint financial_entries_cancel_unpaid check (cancelled_at is null or paid_cents = 0),
  constraint financial_entries_order_receivable check (order_id is null or direction = 'receivable')
);
create index financial_entries_open_idx on public.financial_entries (organization_id, direction, due_date)
  where cancelled_at is null;
create trigger financial_entries_updated_at before update on public.financial_entries
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Baixas
-- ---------------------------------------------------------------------------

create table public.financial_payments (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  entry_id uuid not null,
  account_id uuid not null,
  -- Positivo; estorno é negativo e aponta para a baixa original.
  amount_cents bigint not null check (amount_cents <> 0),
  paid_on date not null,
  method public.payment_method not null,
  notes text check (notes is null or char_length(notes) <= 500),
  reverses_payment_id bigint unique references public.financial_payments (id),
  idempotency_key uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, entry_id) references public.financial_entries (organization_id, id),
  foreign key (organization_id, account_id) references public.financial_accounts (organization_id, id),
  constraint financial_payments_reversal check ((reverses_payment_id is not null) = (amount_cents < 0))
);
create index financial_payments_entry_idx on public.financial_payments (entry_id);
create index financial_payments_period_idx on public.financial_payments (organization_id, paid_on);

-- ---------------------------------------------------------------------------
-- Transferências
-- ---------------------------------------------------------------------------

create table public.financial_transfers (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  transfer_date date not null,
  description text check (description is null or char_length(description) <= 200),
  reverses_transfer_id bigint unique references public.financial_transfers (id),
  idempotency_key uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, from_account_id) references public.financial_accounts (organization_id, id),
  foreign key (organization_id, to_account_id) references public.financial_accounts (organization_id, id),
  constraint financial_transfers_distinct check (from_account_id <> to_account_id)
);
create index financial_transfers_period_idx on public.financial_transfers (organization_id, transfer_date);

-- ---------------------------------------------------------------------------
-- Dados padrão de cada empresa: conta "Caixa" e categorias por tipo
-- ---------------------------------------------------------------------------

create function app.seed_finance(p_org uuid, p_type public.business_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.financial_accounts (organization_id, name, kind, created_by)
  select p_org, 'Caixa', 'cash', null
  where not exists (select 1 from public.financial_accounts a where a.organization_id = p_org);

  insert into public.financial_categories (organization_id, name, direction, nature)
  select p_org, c.name, c.direction::public.financial_direction, c.nature::public.category_nature
  from (values
    (case p_type when 'services' then 'Serviços prestados' else 'Vendas' end, 'receivable', 'operating_revenue'),
    ('Outras receitas', 'receivable', 'other_revenue'),
    (case p_type when 'production' then 'Matéria-prima e embalagens' when 'resale' then 'Compra de mercadorias' else 'Materiais' end,
      'payable', 'inventory_purchase'),
    ('Aluguel', 'payable', 'operating_expense'),
    ('Energia e água', 'payable', 'operating_expense'),
    ('Internet e telefone', 'payable', 'operating_expense'),
    ('Transporte e entregas', 'payable', 'operating_expense'),
    ('Marketing', 'payable', 'operating_expense'),
    ('Taxas de pagamento', 'payable', 'operating_expense'),
    ('Serviços contratados', 'payable', 'operating_expense'),
    ('Outras despesas', 'payable', 'operating_expense'),
    ('Ferramentas e equipamentos', 'payable', 'investment'),
    ('Impostos (DAS)', 'payable', 'tax'),
    ('Retirada do dono', 'payable', 'owner_withdrawal')
  ) as c (name, direction, nature)
  on conflict do nothing;
end;
$$;
revoke all on function app.seed_finance(uuid, public.business_type) from public;

create function app.organizations_seed_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.seed_finance(new.id, new.business_type);
  return new;
end;
$$;

create trigger organizations_seed_finance
  after insert on public.organizations
  for each row execute function app.organizations_seed_finance();

-- Empresas que já existem antes desta migração.
select app.seed_finance(o.id, o.business_type) from public.organizations o;

-- ---------------------------------------------------------------------------
-- Núcleo das baixas
-- ---------------------------------------------------------------------------

-- Registra uma baixa num título já travado (FOR UPDATE) pelo chamador.
create function app.apply_payment(
  p_entry public.financial_entries,
  p_amount_cents bigint,
  p_account_id uuid,
  p_method public.payment_method,
  p_paid_on date,
  p_notes text,
  p_idempotency_key uuid,
  p_user uuid
)
returns public.financial_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.financial_payments;
begin
  if p_entry.cancelled_at is not null then
    raise exception 'entry_cancelled' using errcode = '55000';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_amount_cents > p_entry.amount_cents - p_entry.paid_cents then
    raise exception 'amount_exceeds_open' using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > current_date + 1 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.financial_accounts a
    where a.id = p_account_id and a.organization_id = p_entry.organization_id and a.active
  ) then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  insert into public.financial_payments
    (organization_id, entry_id, account_id, amount_cents, paid_on, method, notes, idempotency_key, created_by)
  values
    (p_entry.organization_id, p_entry.id, p_account_id, p_amount_cents, p_paid_on, coalesce(p_method, 'other'),
     nullif(trim(p_notes), ''), p_idempotency_key, p_user)
  returning * into v_pay;

  update public.financial_entries e set paid_cents = e.paid_cents + p_amount_cents where e.id = p_entry.id;
  return v_pay;
end;
$$;
revoke all on function app.apply_payment(public.financial_entries, bigint, uuid, public.payment_method, date, text, uuid, uuid) from public;

-- Valida e normaliza os campos de um título novo.
create function app.check_entry_fields(
  p_org uuid,
  p_direction public.financial_direction,
  p_description text,
  p_amount_cents bigint,
  p_category_id uuid,
  p_customer_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_description is null or char_length(trim(p_description)) not between 2 and 120 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.financial_categories c
    where c.id = p_category_id and c.organization_id = p_org and c.direction = p_direction and c.active
  ) then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_org
  ) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function app.check_entry_fields(uuid, public.financial_direction, text, bigint, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- RPC: lançar título (a receber ou a pagar), opcionalmente já baixado
-- ---------------------------------------------------------------------------

create function public.create_financial_entry(
  p_organization_id uuid,
  p_direction public.financial_direction,
  p_description text,
  p_amount_cents bigint,
  p_category_id uuid,
  p_due_date date,
  p_idempotency_key uuid,
  p_competence_date date default null,
  p_customer_id uuid default null,
  p_notes text default null,
  -- "À vista": com conta informada, a baixa do valor total é registrada junto.
  p_paid_account_id uuid default null,
  p_paid_method public.payment_method default null,
  p_paid_on date default null
)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_entry public.financial_entries;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_entry from public.financial_entries e
  where e.organization_id = p_organization_id and e.idempotency_key = p_idempotency_key;
  if found then
    return v_entry;
  end if;

  perform app.check_entry_fields(p_organization_id, p_direction, p_description, p_amount_cents, p_category_id, p_customer_id);
  if p_due_date is null then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  insert into public.financial_entries
    (organization_id, direction, description, amount_cents, competence_date, due_date, category_id, customer_id,
     notes, idempotency_key, created_by)
  values
    (p_organization_id, p_direction, trim(p_description), p_amount_cents, coalesce(p_competence_date, p_due_date),
     p_due_date, p_category_id, p_customer_id, nullif(trim(p_notes), ''), p_idempotency_key, v_user)
  returning * into v_entry;

  if p_paid_account_id is not null then
    perform app.apply_payment(v_entry, p_amount_cents, p_paid_account_id, p_paid_method,
      coalesce(p_paid_on, current_date), null, null, v_user);
    select * into v_entry from public.financial_entries e where e.id = v_entry.id;
  end if;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: registrar recebimento ou pagamento (total ou parcial)
-- ---------------------------------------------------------------------------

create function public.settle_financial_entry(
  p_entry_id uuid,
  p_amount_cents bigint,
  p_account_id uuid,
  p_method public.payment_method,
  p_paid_on date,
  p_idempotency_key uuid,
  p_notes text default null
)
returns public.financial_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
  v_user uuid;
  v_pay public.financial_payments;
begin
  select * into v_entry from public.financial_entries e where e.id = p_entry_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_entry.organization_id);

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_pay from public.financial_payments p
  where p.organization_id = v_entry.organization_id and p.idempotency_key = p_idempotency_key;
  if found then
    return v_pay;
  end if;

  return app.apply_payment(v_entry, p_amount_cents, p_account_id, p_method, p_paid_on, p_notes, p_idempotency_key, v_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: estornar uma baixa
-- ---------------------------------------------------------------------------

create function public.reverse_financial_payment(
  p_payment_id bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns public.financial_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.financial_payments;
  v_entry public.financial_entries;
  v_user uuid;
  v_rev public.financial_payments;
begin
  select * into v_pay from public.financial_payments p where p.id = p_payment_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_pay.organization_id);

  -- Trava o título antes de olhar estornos: dois estornos simultâneos da
  -- mesma baixa ficam em fila e o segundo encontra o primeiro.
  select * into v_entry from public.financial_entries e where e.id = v_pay.entry_id for update;

  select * into v_rev from public.financial_payments p where p.reverses_payment_id = v_pay.id;
  if found then
    return v_rev;
  end if;
  if v_pay.amount_cents < 0 then
    raise exception 'cannot_reverse_reversal' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  insert into public.financial_payments
    (organization_id, entry_id, account_id, amount_cents, paid_on, method, notes, reverses_payment_id,
     idempotency_key, created_by)
  values
    (v_pay.organization_id, v_pay.entry_id, v_pay.account_id, -v_pay.amount_cents, current_date, v_pay.method,
     left(trim(p_reason), 500), v_pay.id, p_idempotency_key, v_user)
  returning * into v_rev;

  update public.financial_entries e set paid_cents = e.paid_cents - v_pay.amount_cents where e.id = v_entry.id;
  return v_rev;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancelar título (sem baixas; os de pedido seguem o pedido)
-- ---------------------------------------------------------------------------

create function public.cancel_financial_entry(p_entry_id uuid, p_reason text)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
begin
  select * into v_entry from public.financial_entries e where e.id = p_entry_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform app.assert_member(v_entry.organization_id);

  if v_entry.cancelled_at is not null then
    return v_entry;
  end if;
  if v_entry.order_id is not null then
    raise exception 'entry_from_order' using errcode = '55000';
  end if;
  if v_entry.paid_cents <> 0 then
    raise exception 'entry_has_payments' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.financial_entries e
  set cancelled_at = now(), cancel_reason = left(trim(p_reason), 500)
  where e.id = v_entry.id
  returning * into v_entry;
  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pedido → título a receber → recebimento
-- ---------------------------------------------------------------------------

-- Título do pedido: criado na primeira vez, devolvido nas seguintes.
create function app.order_entry(p_order public.orders, p_user uuid)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
  v_category uuid;
begin
  select * into v_entry from public.financial_entries e where e.order_id = p_order.id for update;
  if found then
    return v_entry;
  end if;

  select c.id into v_category from public.financial_categories c
  where c.organization_id = p_order.organization_id and c.direction = 'receivable'
    and c.nature = 'operating_revenue' and c.active
  order by c.created_at, c.name
  limit 1;
  if v_category is null then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  insert into public.financial_entries
    (organization_id, direction, description, amount_cents, competence_date, due_date, category_id, customer_id,
     order_id, created_by)
  values
    (p_order.organization_id, 'receivable',
     case p_order.kind when 'sale' then 'Venda' when 'service_order' then 'Serviço' else 'Pedido' end || ' #' || p_order.number,
     p_order.total_cents,
     (p_order.created_at at time zone 'America/Sao_Paulo')::date,
     coalesce((p_order.due_at at time zone 'America/Sao_Paulo')::date, current_date),
     v_category, p_order.customer_id, p_order.id, p_user)
  on conflict (order_id) do nothing
  returning * into v_entry;

  if v_entry.id is null then
    -- Outra transação criou ao mesmo tempo.
    select * into v_entry from public.financial_entries e where e.order_id = p_order.id for update;
  end if;
  return v_entry;
end;
$$;
revoke all on function app.order_entry(public.orders, uuid) from public;

create function public.receive_order_payment(
  p_order_id uuid,
  p_amount_cents bigint,
  p_account_id uuid,
  p_method public.payment_method,
  p_paid_on date,
  p_idempotency_key uuid
)
returns public.financial_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_user uuid;
  v_entry public.financial_entries;
  v_pay public.financial_payments;
begin
  select * into v_order from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_order.organization_id);

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_pay from public.financial_payments p
  where p.organization_id = v_order.organization_id and p.idempotency_key = p_idempotency_key;
  if found then
    return v_pay;
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'order_cancelled' using errcode = '55000';
  end if;
  if v_order.total_cents = 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  v_entry := app.order_entry(v_order, v_user);
  return app.apply_payment(v_entry, p_amount_cents, p_account_id, p_method, p_paid_on, null, p_idempotency_key, v_user);
end;
$$;

-- O título acompanha o pedido: novo total, novo cliente e cancelamento.
create function app.sync_order_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
begin
  select * into v_entry from public.financial_entries e where e.order_id = new.id for update;
  if not found then
    return new;
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if v_entry.paid_cents <> 0 then
      raise exception 'order_has_payments' using errcode = '55000';
    end if;
    update public.financial_entries e
    set cancelled_at = now(), cancel_reason = 'Pedido cancelado: ' || coalesce(new.cancel_reason, '')
    where e.id = v_entry.id;
    return new;
  end if;

  if new.total_cents <> old.total_cents or new.customer_id is distinct from old.customer_id then
    if new.total_cents < v_entry.paid_cents or new.total_cents = 0 then
      raise exception 'amount_below_paid' using errcode = '55000';
    end if;
    update public.financial_entries e
    set amount_cents = new.total_cents, customer_id = new.customer_id
    where e.id = v_entry.id;
  end if;
  return new;
end;
$$;

create trigger orders_sync_entry
  after update of status, total_cents, customer_id on public.orders
  for each row execute function app.sync_order_entry();

-- ---------------------------------------------------------------------------
-- RPC: transferência entre contas e estorno
-- ---------------------------------------------------------------------------

create function public.create_financial_transfer(
  p_organization_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_cents bigint,
  p_transfer_date date,
  p_idempotency_key uuid,
  p_description text default null
)
returns public.financial_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_tr public.financial_transfers;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_tr from public.financial_transfers t
  where t.organization_id = p_organization_id and t.idempotency_key = p_idempotency_key;
  if found then
    return v_tr;
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'same_account' using errcode = '22023';
  end if;
  if p_transfer_date is null or p_transfer_date > current_date + 1 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if (select count(*) from public.financial_accounts a
      where a.organization_id = p_organization_id and a.active
        and a.id in (p_from_account_id, p_to_account_id)) <> 2 then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  insert into public.financial_transfers
    (organization_id, from_account_id, to_account_id, amount_cents, transfer_date, description, idempotency_key, created_by)
  values
    (p_organization_id, p_from_account_id, p_to_account_id, p_amount_cents, p_transfer_date,
     nullif(trim(p_description), ''), p_idempotency_key, v_user)
  returning * into v_tr;
  return v_tr;
end;
$$;

create function public.reverse_financial_transfer(p_transfer_id bigint, p_reason text)
returns public.financial_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tr public.financial_transfers;
  v_user uuid;
  v_rev public.financial_transfers;
begin
  select * into v_tr from public.financial_transfers t where t.id = p_transfer_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_tr.organization_id);

  select * into v_rev from public.financial_transfers t where t.reverses_transfer_id = v_tr.id;
  if found then
    return v_rev;
  end if;
  if v_tr.reverses_transfer_id is not null then
    raise exception 'cannot_reverse_reversal' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  insert into public.financial_transfers
    (organization_id, from_account_id, to_account_id, amount_cents, transfer_date, description,
     reverses_transfer_id, created_by)
  values
    (v_tr.organization_id, v_tr.to_account_id, v_tr.from_account_id, v_tr.amount_cents, current_date,
     'Estorno: ' || left(trim(p_reason), 190), v_tr.id, v_user)
  returning * into v_rev;
  return v_rev;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visões
-- ---------------------------------------------------------------------------

-- Contas a receber e a pagar, com valor em aberto e status derivado.
create view public.financial_entry_overview
with (security_invoker = true)
as
select
  e.id,
  e.organization_id,
  e.direction,
  e.description,
  e.amount_cents,
  e.paid_cents,
  case when e.cancelled_at is null then e.amount_cents - e.paid_cents else 0 end as open_cents,
  case
    when e.cancelled_at is not null then 'cancelled'
    when e.paid_cents >= e.amount_cents then 'paid'
    when e.due_date < (now() at time zone 'America/Sao_Paulo')::date then 'overdue'
    when e.paid_cents > 0 then 'partial'
    else 'pending'
  end as status,
  e.competence_date,
  e.due_date,
  e.category_id,
  c.name as category_name,
  c.nature as category_nature,
  e.customer_id,
  cu.name as customer_name,
  e.order_id,
  o.number as order_number,
  e.notes,
  e.cancelled_at,
  e.cancel_reason,
  e.created_at
from public.financial_entries e
join public.financial_categories c on c.id = e.category_id
left join public.customers cu on cu.id = e.customer_id
left join public.orders o on o.id = e.order_id;

-- Saldo controlado de cada conta: inicial + baixas + transferências.
create view public.financial_account_balances
with (security_invoker = true)
as
select
  a.id,
  a.organization_id,
  a.name,
  a.kind,
  a.active,
  a.opening_balance_cents,
  a.opening_date,
  a.opening_balance_cents
    + coalesce((
        select sum(case e.direction when 'receivable' then p.amount_cents else -p.amount_cents end)
        from public.financial_payments p
        join public.financial_entries e on e.id = p.entry_id
        where p.account_id = a.id), 0)
    + coalesce((select sum(t.amount_cents) from public.financial_transfers t where t.to_account_id = a.id), 0)
    - coalesce((select sum(t.amount_cents) from public.financial_transfers t where t.from_account_id = a.id), 0)
    as balance_cents
from public.financial_accounts a;

-- Baixas com sinal de caixa (entrada positiva, saída negativa) para extratos.
create view public.financial_cash_movements
with (security_invoker = true)
as
select
  p.id,
  p.organization_id,
  p.entry_id,
  e.direction,
  e.description,
  p.account_id,
  case e.direction when 'receivable' then p.amount_cents else -p.amount_cents end as cash_cents,
  p.amount_cents,
  p.paid_on,
  p.method,
  p.notes,
  p.reverses_payment_id,
  p.created_at
from public.financial_payments p
join public.financial_entries e on e.id = p.entry_id;

-- ---------------------------------------------------------------------------
-- RPC: resumo do período (caixa ≠ resultado ≠ a receber/pagar)
-- ---------------------------------------------------------------------------

create function public.finance_summary(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_result jsonb;
begin
  perform app.assert_member(p_organization_id);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;

  with pay as (
    select e.direction, p.amount_cents, p.account_id
    from public.financial_payments p
    join public.financial_entries e on e.id = p.entry_id
    where p.organization_id = p_organization_id and p.paid_on between p_from and p_to
  ),
  comp as (
    select c.nature, e.amount_cents
    from public.financial_entries e
    join public.financial_categories c on c.id = e.category_id
    where e.organization_id = p_organization_id and e.cancelled_at is null
      and e.competence_date between p_from and p_to
  ),
  open_e as (
    select e.direction, e.amount_cents - e.paid_cents as open_cents, e.due_date
    from public.financial_entries e
    where e.organization_id = p_organization_id and e.cancelled_at is null and e.paid_cents < e.amount_cents
  )
  select jsonb_build_object(
    'received_cents', coalesce((select sum(amount_cents) from pay where direction = 'receivable'), 0),
    'paid_cents', coalesce((select sum(amount_cents) from pay where direction = 'payable'), 0),
    'transfers_cents', coalesce((select sum(t.amount_cents) from public.financial_transfers t
      where t.organization_id = p_organization_id and t.transfer_date between p_from and p_to), 0),
    'revenue_cents', coalesce((select sum(amount_cents) from comp where nature = 'operating_revenue'), 0),
    'other_revenue_cents', coalesce((select sum(amount_cents) from comp where nature = 'other_revenue'), 0),
    'operating_expense_cents', coalesce((select sum(amount_cents) from comp where nature in ('operating_expense', 'tax')), 0),
    'inventory_purchase_cents', coalesce((select sum(amount_cents) from comp where nature = 'inventory_purchase'), 0),
    'investment_cents', coalesce((select sum(amount_cents) from comp where nature = 'investment'), 0),
    'owner_withdrawal_cents', coalesce((select sum(amount_cents) from comp where nature = 'owner_withdrawal'), 0),
    'open_receivable_cents', coalesce((select sum(open_cents) from open_e where direction = 'receivable'), 0),
    'open_payable_cents', coalesce((select sum(open_cents) from open_e where direction = 'payable'), 0),
    'overdue_receivable_cents', coalesce((select sum(open_cents) from open_e where direction = 'receivable' and due_date < v_today), 0),
    'overdue_payable_cents', coalesce((select sum(open_cents) from open_e where direction = 'payable' and due_date < v_today), 0),
    'overdue_count', (select count(*) from open_e where due_date < v_today),
    -- Previsto: em aberto com vencimento até o fim do período (vencidos incluídos).
    'expected_in_cents', coalesce((select sum(open_cents) from open_e where direction = 'receivable' and due_date <= p_to), 0),
    'expected_out_cents', coalesce((select sum(open_cents) from open_e where direction = 'payable' and due_date <= p_to), 0)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.financial_accounts enable row level security;
alter table public.financial_categories enable row level security;
alter table public.financial_entries enable row level security;
alter table public.financial_payments enable row level security;
alter table public.financial_transfers enable row level security;

revoke all on public.financial_accounts, public.financial_categories, public.financial_entries,
  public.financial_payments, public.financial_transfers from anon, authenticated;
revoke all on public.financial_entry_overview, public.financial_account_balances, public.financial_cash_movements
  from anon, authenticated;

grant select on public.financial_accounts, public.financial_categories, public.financial_entries,
  public.financial_payments, public.financial_transfers to authenticated;
grant select on public.financial_entry_overview, public.financial_account_balances, public.financial_cash_movements
  to authenticated;

-- Cadastros simples podem ser escritos direto (com RLS). Saldo inicial só na criação.
grant insert (organization_id, name, kind, opening_balance_cents, opening_date) on public.financial_accounts to authenticated;
grant update (name, kind, active) on public.financial_accounts to authenticated;
grant insert (organization_id, name, direction, nature) on public.financial_categories to authenticated;
grant update (name, active) on public.financial_categories to authenticated;

create policy financial_accounts_select on public.financial_accounts
  for select to authenticated using (app.is_member(organization_id));
create policy financial_accounts_insert on public.financial_accounts
  for insert to authenticated with check (app.is_member(organization_id));
create policy financial_accounts_update on public.financial_accounts
  for update to authenticated using (app.is_member(organization_id)) with check (app.is_member(organization_id));

create policy financial_categories_select on public.financial_categories
  for select to authenticated using (app.is_member(organization_id));
create policy financial_categories_insert on public.financial_categories
  for insert to authenticated with check (app.is_member(organization_id));
create policy financial_categories_update on public.financial_categories
  for update to authenticated using (app.is_member(organization_id)) with check (app.is_member(organization_id));

create policy financial_entries_select on public.financial_entries
  for select to authenticated using (app.is_member(organization_id));
create policy financial_payments_select on public.financial_payments
  for select to authenticated using (app.is_member(organization_id));
create policy financial_transfers_select on public.financial_transfers
  for select to authenticated using (app.is_member(organization_id));

revoke all on function public.create_financial_entry(uuid, public.financial_direction, text, bigint, uuid, date, uuid, date, uuid, text, uuid, public.payment_method, date) from public, anon;
revoke all on function public.settle_financial_entry(uuid, bigint, uuid, public.payment_method, date, uuid, text) from public, anon;
revoke all on function public.reverse_financial_payment(bigint, text, uuid) from public, anon;
revoke all on function public.cancel_financial_entry(uuid, text) from public, anon;
revoke all on function public.receive_order_payment(uuid, bigint, uuid, public.payment_method, date, uuid) from public, anon;
revoke all on function public.create_financial_transfer(uuid, uuid, uuid, bigint, date, uuid, text) from public, anon;
revoke all on function public.reverse_financial_transfer(bigint, text) from public, anon;
revoke all on function public.finance_summary(uuid, date, date) from public, anon;
grant execute on function public.create_financial_entry(uuid, public.financial_direction, text, bigint, uuid, date, uuid, date, uuid, text, uuid, public.payment_method, date) to authenticated;
grant execute on function public.settle_financial_entry(uuid, bigint, uuid, public.payment_method, date, uuid, text) to authenticated;
grant execute on function public.reverse_financial_payment(bigint, text, uuid) to authenticated;
grant execute on function public.cancel_financial_entry(uuid, text) to authenticated;
grant execute on function public.receive_order_payment(uuid, bigint, uuid, public.payment_method, date, uuid) to authenticated;
grant execute on function public.create_financial_transfer(uuid, uuid, uuid, bigint, date, uuid, text) to authenticated;
grant execute on function public.reverse_financial_transfer(bigint, text) to authenticated;
grant execute on function public.finance_summary(uuid, date, date) to authenticated;
