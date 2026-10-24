-- 0006 — Fornecedores e compras.
--
-- Regras (ADENDO, item D):
-- * A compra grava, na mesma transação: os itens, a entrada no estoque dos
--   itens que controlam estoque, o custo médio do item e o título a pagar
--   (um por compra, unique purchase_id). Pagamento à vista registra a baixa junto.
-- * idempotency_key impede compra duplicada por toque duplo ou reenvio.
-- * A compra não é editada. Erro se corrige cancelando (com motivo), o que
--   estorna as entradas de estoque e cancela o título. Compra com pagamento
--   só é cancelada depois de estornar o pagamento.
-- * O custo médio não é recalculado no cancelamento: fica como estava, e o
--   usuário pode ajustar o custo no cadastro do item.

-- ---------------------------------------------------------------------------
-- Fornecedores
-- ---------------------------------------------------------------------------

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  -- CPF ou CNPJ, só dígitos (opcional).
  document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  phone text check (phone is null or char_length(phone) <= 30),
  phone_digits text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  email text check (email is null or (char_length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+$')),
  notes text check (notes is null or char_length(notes) <= 1000),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index suppliers_org_name_idx on public.suppliers (organization_id, lower(name));
create unique index suppliers_org_document_uq on public.suppliers (organization_id, document) where document is not null;
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Compras
-- ---------------------------------------------------------------------------

create type public.purchase_status as enum ('received', 'cancelled');

create table public.purchase_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number integer not null default 0
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number integer not null check (number > 0),
  status public.purchase_status not null default 'received',
  supplier_id uuid,
  purchase_date date not null,
  invoice_ref text check (invoice_ref is null or char_length(invoice_ref) <= 60),
  notes text check (notes is null or char_length(notes) <= 1000),
  total_cents bigint not null default 0 check (total_cents >= 0),
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  idempotency_key uuid not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id),
  constraint purchases_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);
create index purchases_org_date_idx on public.purchases (organization_id, purchase_date desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  purchase_id uuid not null,
  position smallint not null check (position >= 0),
  product_id uuid not null,
  description text not null,
  unit text not null,
  quantity numeric(14, 3) not null check (quantity > 0 and quantity <= 1000000),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  unique (purchase_id, position),
  foreign key (organization_id, purchase_id) references public.purchases (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id)
);
create index purchase_items_product_idx on public.purchase_items (product_id);

-- Ligações com estoque e financeiro.
alter table public.inventory_movements add column purchase_id uuid;
alter table public.inventory_movements
  add foreign key (organization_id, purchase_id) references public.purchases (organization_id, id);
create index inventory_movements_purchase_idx on public.inventory_movements (purchase_id) where purchase_id is not null;

alter table public.financial_entries add column supplier_id uuid, add column purchase_id uuid unique;
alter table public.financial_entries
  add foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id),
  add foreign key (organization_id, purchase_id) references public.purchases (organization_id, id),
  add constraint financial_entries_purchase_payable check (purchase_id is null or direction = 'payable');

-- ---------------------------------------------------------------------------
-- RPC: registrar compra
-- ---------------------------------------------------------------------------

create function public.create_purchase(
  p_organization_id uuid,
  p_items jsonb,
  p_idempotency_key uuid,
  p_supplier_id uuid default null,
  p_purchase_date date default null,
  p_due_date date default null,
  p_invoice_ref text default null,
  p_notes text default null,
  p_category_id uuid default null,
  -- Pagamento à vista: com conta informada, a baixa total é registrada junto.
  p_paid_account_id uuid default null,
  p_paid_method public.payment_method default null
)
returns public.purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_purchase public.purchases;
  v_number integer;
  v_date date := coalesce(p_purchase_date, (now() at time zone 'America/Sao_Paulo')::date);
  v_item jsonb;
  v_pos integer := 0;
  v_product public.products;
  v_qty numeric;
  v_cost bigint;
  v_total bigint := 0;
  v_line record;
  v_base numeric;
  v_category uuid;
  v_entry public.financial_entries;
  v_supplier_name text;
  v_mov public.inventory_movements;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_purchase from public.purchases p
  where p.organization_id = p_organization_id and p.idempotency_key = p_idempotency_key;
  if found then
    return v_purchase;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;
  if v_date > (now() at time zone 'America/Sao_Paulo')::date + 1 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if p_supplier_id is not null then
    select s.name into v_supplier_name from public.suppliers s
    where s.id = p_supplier_id and s.organization_id = p_organization_id;
    if not found then
      raise exception 'supplier_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.purchase_counters as pc (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update set last_number = pc.last_number + 1
  returning last_number into v_number;

  insert into public.purchases
    (organization_id, number, supplier_id, purchase_date, invoice_ref, notes, idempotency_key, created_by)
  values
    (p_organization_id, v_number, p_supplier_id, v_date, nullif(trim(p_invoice_ref), ''), nullif(trim(p_notes), ''),
     p_idempotency_key, v_user)
  returning * into v_purchase;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_qty := (v_item ->> 'quantity')::numeric;
      v_cost := (v_item ->> 'unit_cost_cents')::bigint;
    exception when others then
      raise exception 'invalid_quantity' using errcode = '22023';
    end;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000 or scale(v_qty) > 3 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    if v_cost is null or v_cost < 0 or v_cost > 10000000000 then
      raise exception 'invalid_amount' using errcode = '22023';
    end if;

    select * into v_product from public.products p
    where p.id = (v_item ->> 'product_id')::uuid and p.organization_id = p_organization_id;
    if not found or v_product.item_type = 'service' then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;

    insert into public.purchase_items
      (organization_id, purchase_id, position, product_id, description, unit, quantity, unit_cost_cents, line_total_cents)
    values
      (p_organization_id, v_purchase.id, v_pos, v_product.id, v_product.name, v_product.unit, v_qty, v_cost,
       round(v_qty * v_cost)::bigint);
    v_total := v_total + round(v_qty * v_cost)::bigint;
    v_pos := v_pos + 1;
  end loop;

  -- Estoque e custo médio, por item (somando linhas repetidas), travando na
  -- ordem do id para não haver deadlock entre compras simultâneas.
  for v_line in
    select i.product_id, sum(i.quantity) as qty, sum(i.line_total_cents) as cost_total
    from public.purchase_items i
    where i.purchase_id = v_purchase.id
    group by i.product_id
    order by i.product_id
  loop
    select * into v_product from public.products p where p.id = v_line.product_id for update;
    -- Custo médio ponderado sobre o saldo positivo; sem custo anterior, vale o da compra.
    v_base := greatest(v_product.stock_qty, 0);
    if not v_product.track_stock or v_product.cost_cents is null or v_base = 0 then
      v_cost := round(v_line.cost_total / v_line.qty)::bigint;
    else
      v_cost := round((v_base * v_product.cost_cents + v_line.cost_total) / (v_base + v_line.qty))::bigint;
    end if;
    update public.products p set cost_cents = v_cost where p.id = v_product.id;

    if v_product.track_stock then
      v_mov := app.apply_inventory_movement(p_organization_id, v_product.id, 'purchase', v_line.qty,
        'Compra #' || v_number, null, null, false, null, v_user);
      update public.inventory_movements m set purchase_id = v_purchase.id where m.id = v_mov.id;
    end if;
  end loop;

  update public.purchases p set total_cents = v_total where p.id = v_purchase.id returning * into v_purchase;

  -- Título a pagar (compra de valor zero, como amostra grátis, não gera título).
  if v_total > 0 then
    if p_category_id is not null then
      select c.id into v_category from public.financial_categories c
      where c.id = p_category_id and c.organization_id = p_organization_id and c.direction = 'payable' and c.active;
    else
      select c.id into v_category from public.financial_categories c
      where c.organization_id = p_organization_id and c.nature = 'inventory_purchase' and c.active
      order by c.created_at, c.name limit 1;
    end if;
    if v_category is null then
      raise exception 'category_not_found' using errcode = 'P0002';
    end if;

    insert into public.financial_entries
      (organization_id, direction, description, amount_cents, competence_date, due_date, category_id,
       supplier_id, purchase_id, created_by)
    values
      (p_organization_id, 'payable', left('Compra #' || v_number || coalesce(' · ' || v_supplier_name, ''), 120), v_total,
       v_date, coalesce(p_due_date, v_date), v_category, p_supplier_id, v_purchase.id, v_user)
    returning * into v_entry;

    if p_paid_account_id is not null then
      perform app.apply_payment(v_entry, v_total, p_paid_account_id, p_paid_method, v_date, null, null, v_user);
    end if;
  elsif p_paid_account_id is not null then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  return v_purchase;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancelar compra
-- ---------------------------------------------------------------------------

create function public.cancel_purchase(p_purchase_id uuid, p_reason text)
returns public.purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_user uuid;
  v_entry public.financial_entries;
  v_mov public.inventory_movements;
  v_rev public.inventory_movements;
begin
  select * into v_purchase from public.purchases p where p.id = p_purchase_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_purchase.organization_id);

  if v_purchase.status = 'cancelled' then
    return v_purchase;
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_entry from public.financial_entries e where e.purchase_id = v_purchase.id for update;
  if found then
    if v_entry.paid_cents <> 0 then
      raise exception 'purchase_has_payments' using errcode = '55000';
    end if;
    update public.financial_entries e
    set cancelled_at = now(), cancel_reason = left('Compra cancelada: ' || trim(p_reason), 500)
    where e.id = v_entry.id;
  end if;

  -- Estorna as entradas de estoque (pode deixar saldo negativo se o material
  -- já foi usado; o estorno fica marcado como autorizado).
  for v_mov in
    select m.* from public.inventory_movements m
    where m.purchase_id = v_purchase.id and m.movement_type = 'purchase'
      and not exists (select 1 from public.inventory_movements r where r.reverses_movement_id = m.id)
    order by m.product_id
  loop
    v_rev := app.apply_inventory_movement(v_purchase.organization_id, v_mov.product_id, 'reversal', -v_mov.quantity,
      'Cancelamento da compra #' || v_purchase.number, null, v_mov.id, true, null, v_user);
    update public.inventory_movements m set purchase_id = v_purchase.id where m.id = v_rev.id;
  end loop;

  update public.purchases p
  set status = 'cancelled', cancelled_at = now(), cancel_reason = left(trim(p_reason), 500)
  where p.id = v_purchase.id
  returning * into v_purchase;
  return v_purchase;
end;
$$;

-- Movimentações de compra só são estornadas pelo cancelamento da compra
-- (assim estoque e conta a pagar não se desencontram).
create or replace function public.inventory_reverse(
  p_movement_id bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.inventory_movements;
  v_user uuid;
  v_existing public.inventory_movements;
begin
  select * into v_mov from public.inventory_movements m where m.id = p_movement_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_mov.organization_id);

  select * into v_existing from public.inventory_movements m where m.reverses_movement_id = p_movement_id;
  if found then
    -- Já estornada: devolve o estorno existente (reenvio) em vez de duplicar.
    return v_existing;
  end if;
  if v_mov.movement_type = 'reversal' then
    raise exception 'cannot_reverse_reversal' using errcode = '55000';
  end if;
  if v_mov.purchase_id is not null then
    raise exception 'movement_from_purchase' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Estorno pode deixar o saldo negativo (ex.: estornar uma entrada já
  -- consumida); nesse caso fica marcado como autorizado.
  return app.apply_inventory_movement(v_mov.organization_id, v_mov.product_id, 'reversal', -v_mov.quantity,
    p_reason, v_mov.order_id, v_mov.id, true, p_idempotency_key, v_user);
exception
  when unique_violation then
    select * into v_existing from public.inventory_movements m where m.reverses_movement_id = p_movement_id;
    if found then
      return v_existing;
    end if;
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- Financeiro: fornecedor no lançamento manual e regras de compra
-- ---------------------------------------------------------------------------

drop function public.create_financial_entry(uuid, public.financial_direction, text, bigint, uuid, date, uuid, date, uuid, text, uuid, public.payment_method, date);

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
  p_paid_on date default null,
  p_supplier_id uuid default null
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
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.organization_id = p_organization_id
  ) then
    raise exception 'supplier_not_found' using errcode = 'P0002';
  end if;
  if p_due_date is null then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  insert into public.financial_entries
    (organization_id, direction, description, amount_cents, competence_date, due_date, category_id, customer_id,
     supplier_id, notes, idempotency_key, created_by)
  values
    (p_organization_id, p_direction, trim(p_description), p_amount_cents, coalesce(p_competence_date, p_due_date),
     p_due_date, p_category_id, p_customer_id, p_supplier_id, nullif(trim(p_notes), ''), p_idempotency_key, v_user)
  returning * into v_entry;

  if p_paid_account_id is not null then
    perform app.apply_payment(v_entry, p_amount_cents, p_paid_account_id, p_paid_method,
      coalesce(p_paid_on, current_date), null, null, v_user);
    select * into v_entry from public.financial_entries e where e.id = v_entry.id;
  end if;

  return v_entry;
end;
$$;

create or replace function public.cancel_financial_entry(p_entry_id uuid, p_reason text)
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
  if v_entry.purchase_id is not null then
    raise exception 'entry_from_purchase' using errcode = '55000';
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

create or replace view public.financial_entry_overview
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
  e.created_at,
  e.supplier_id,
  s.name as supplier_name,
  e.purchase_id
from public.financial_entries e
join public.financial_categories c on c.id = e.category_id
left join public.customers cu on cu.id = e.customer_id
left join public.orders o on o.id = e.order_id
left join public.suppliers s on s.id = e.supplier_id;

-- Resumo para a lista de compras.
create view public.purchase_summaries
with (security_invoker = true)
as
select
  p.id,
  p.organization_id,
  p.number,
  p.status,
  p.supplier_id,
  s.name as supplier_name,
  p.purchase_date,
  p.invoice_ref,
  p.total_cents,
  e.id as entry_id,
  coalesce(e.paid_cents, 0) as paid_cents,
  case when e.cancelled_at is null then coalesce(e.amount_cents - e.paid_cents, 0) else 0 end as open_cents,
  e.due_date,
  (
    select string_agg(
      replace(trim(trailing '.' from trim(trailing '0' from i.quantity::text)), '.', ',') || ' ' || i.unit || ' ' || i.description,
      ', ' order by i.position)
    from public.purchase_items i
    where i.purchase_id = p.id
  ) as items_summary,
  p.created_at
from public.purchases p
left join public.suppliers s on s.id = p.supplier_id
left join public.financial_entries e on e.purchase_id = p.id;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.suppliers enable row level security;
alter table public.purchase_counters enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

revoke all on public.suppliers, public.purchase_counters, public.purchases, public.purchase_items
  from anon, authenticated;
revoke all on public.purchase_summaries from anon, authenticated;

grant select on public.suppliers to authenticated;
grant insert (organization_id, name, document, phone, email, notes) on public.suppliers to authenticated;
grant update (name, document, phone, email, notes, active) on public.suppliers to authenticated;
grant select on public.purchases, public.purchase_items, public.purchase_summaries to authenticated;

create policy suppliers_select on public.suppliers
  for select to authenticated using (app.is_member(organization_id));
create policy suppliers_insert on public.suppliers
  for insert to authenticated with check (app.is_member(organization_id));
create policy suppliers_update on public.suppliers
  for update to authenticated using (app.is_member(organization_id)) with check (app.is_member(organization_id));
create policy purchases_select on public.purchases
  for select to authenticated using (app.is_member(organization_id));
create policy purchase_items_select on public.purchase_items
  for select to authenticated using (app.is_member(organization_id));

revoke all on function public.create_financial_entry(uuid, public.financial_direction, text, bigint, uuid, date, uuid, date, uuid, text, uuid, public.payment_method, date, uuid) from public, anon;
grant execute on function public.create_financial_entry(uuid, public.financial_direction, text, bigint, uuid, date, uuid, date, uuid, text, uuid, public.payment_method, date, uuid) to authenticated;
revoke all on function public.create_purchase(uuid, jsonb, uuid, uuid, date, date, text, text, uuid, uuid, public.payment_method) from public, anon;
revoke all on function public.cancel_purchase(uuid, text) from public, anon;
grant execute on function public.create_purchase(uuid, jsonb, uuid, uuid, date, date, text, text, uuid, uuid, public.payment_method) to authenticated;
grant execute on function public.cancel_purchase(uuid, text) to authenticated;
