-- 0027 — Cartões de crédito, compras parceladas e faturas.
--
-- Parte (b) de Minhas finanças, mas vale para qualquer espaço (a empresa
-- também pode usar cartão). Segue o modelo de títulos e baixas:
-- * Compra parcelada (installment_plans) gera um título a pagar por parcela,
--   na categoria da compra. No cartão, cada parcela vence no dia da fatura em
--   que cai; sem cartão (carnê, boleto), uma por mês a partir do 1º vencimento.
--   A competência é o vencimento: o gasto aparece no mês em que é pago.
-- * Fatura não é tabela: é a soma das parcelas do cartão que vencem no mesmo
--   mês (view card_statements). Compra no dia do fechamento ou depois cai na
--   fatura seguinte; se o vencimento é antes do fechamento (ou no mesmo dia),
--   a fatura vence no mês seguinte ao fechamento.
-- * Pagar a fatura (pay_card_statement) registra card_payments e dá baixa nas
--   parcelas, das mais antigas para as mais novas; pagamento parcial abate só
--   parte. O dinheiro sai da conta nesse dia, não no dia da compra.
-- * Centavos que sobram da divisão vão para a primeira parcela.
-- * Nada é apagado: compra se cancela (só sem parcela paga) e pagamento de
--   fatura se estorna (baixas inversas).
-- * O app nunca guarda número, código ou senha do cartão: só nome, dias e limite.

-- ---------------------------------------------------------------------------
-- Cartões
-- ---------------------------------------------------------------------------

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 40),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  limit_cents bigint check (limit_cents is null or limit_cents between 0 and 100000000000),
  active boolean not null default true,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index credit_cards_name_uq on public.credit_cards (organization_id, lower(trim(name)));
create trigger credit_cards_updated_at before update on public.credit_cards
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Compras parceladas
-- ---------------------------------------------------------------------------

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  card_id uuid,
  description text not null check (char_length(trim(description)) between 2 and 100),
  category_id uuid not null,
  total_cents bigint not null check (total_cents > 0 and total_cents <= 100000000000),
  installments smallint not null check (installments between 1 and 48),
  purchase_date date not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  idempotency_key uuid not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, card_id) references public.credit_cards (organization_id, id),
  foreign key (organization_id, category_id) references public.financial_categories (organization_id, id),
  constraint installment_plans_min_cents check (total_cents >= installments)
);

alter table public.financial_entries
  add column installment_plan_id uuid,
  add column installment_number smallint,
  add column card_id uuid,
  add constraint financial_entries_plan_fk foreign key (organization_id, installment_plan_id)
    references public.installment_plans (organization_id, id),
  add constraint financial_entries_card_fk foreign key (organization_id, card_id)
    references public.credit_cards (organization_id, id),
  add constraint financial_entries_installment check ((installment_plan_id is null) = (installment_number is null)),
  add constraint financial_entries_card_plan check (card_id is null or installment_plan_id is not null);
create index financial_entries_plan_idx on public.financial_entries (installment_plan_id) where installment_plan_id is not null;
create index financial_entries_card_idx on public.financial_entries (card_id, due_date) where card_id is not null;

-- ---------------------------------------------------------------------------
-- Pagamentos de fatura
-- ---------------------------------------------------------------------------

create table public.card_payments (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  card_id uuid not null,
  -- Mês de vencimento da fatura (dia 1).
  statement_month date not null check (extract(day from statement_month) = 1),
  account_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  paid_on date not null,
  method public.payment_method not null,
  reversed_at timestamptz,
  reverse_reason text check (reverse_reason is null or char_length(reverse_reason) <= 500),
  idempotency_key uuid not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, card_id) references public.credit_cards (organization_id, id),
  foreign key (organization_id, account_id) references public.financial_accounts (organization_id, id)
);
create index card_payments_card_idx on public.card_payments (card_id, statement_month);

alter table public.financial_payments add column card_payment_id bigint references public.card_payments (id);
create index financial_payments_card_payment_idx on public.financial_payments (card_payment_id) where card_payment_id is not null;

-- ---------------------------------------------------------------------------
-- Datas da fatura
-- ---------------------------------------------------------------------------

create function app.day_in_month(p_month date, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_month)::date
    + (least(p_day, extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::integer) - 1));
$$;

-- Vencimento da fatura em que cai uma compra feita em p_purchase, deslocado
-- p_offset faturas (parcela 1 = 0).
create function app.card_due_date(p_closing_day integer, p_due_day integer, p_purchase date, p_offset integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_purchase)::date;
begin
  -- Mês em que a fatura fecha.
  if p_purchase >= app.day_in_month(v_month, p_closing_day) then
    v_month := (v_month + interval '1 month')::date;
  end if;
  -- Mês em que vence.
  if p_due_day <= p_closing_day then
    v_month := (v_month + interval '1 month')::date;
  end if;
  return app.day_in_month((v_month + make_interval(months => p_offset))::date, p_due_day);
end;
$$;

-- Fechamento da fatura que vence em p_due_month.
create function app.card_closing_date(p_closing_day integer, p_due_day integer, p_due_month date)
returns date
language sql
immutable
set search_path = ''
as $$
  select app.day_in_month(
    case when p_due_day <= p_closing_day then (date_trunc('month', p_due_month) - interval '1 month')::date
         else date_trunc('month', p_due_month)::date end,
    p_closing_day);
$$;

revoke all on function app.day_in_month(date, integer) from public;
revoke all on function app.card_due_date(integer, integer, date, integer) from public;
revoke all on function app.card_closing_date(integer, integer, date) from public;
grant execute on function app.day_in_month(date, integer) to authenticated;
grant execute on function app.card_due_date(integer, integer, date, integer) to authenticated;
grant execute on function app.card_closing_date(integer, integer, date) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: compra parcelada (no cartão ou em carnê/boleto)
-- ---------------------------------------------------------------------------

create function public.create_installment_purchase(
  p_organization_id uuid,
  p_description text,
  p_total_cents bigint,
  p_installments integer,
  p_category_id uuid,
  p_purchase_date date,
  p_idempotency_key uuid,
  p_card_id uuid default null,
  -- Sem cartão: vencimento da 1ª parcela (padrão: a data da compra).
  p_first_due_date date default null,
  p_notes text default null
)
returns public.installment_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.assert_member(p_organization_id);
  v_plan public.installment_plans;
  v_card public.credit_cards;
  v_base bigint;
  v_amount bigint;
  v_due date;
  v_desc text;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_plan from public.installment_plans p
  where p.organization_id = p_organization_id and p.idempotency_key = p_idempotency_key;
  if found then
    return v_plan;
  end if;

  perform app.check_entry_fields(p_organization_id, 'payable', p_description, p_total_cents, p_category_id, null);
  if char_length(trim(p_description)) > 100 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;
  if p_installments is null or p_installments not between 1 and 48 or p_total_cents < p_installments then
    raise exception 'invalid_installments' using errcode = '22023';
  end if;
  if p_purchase_date is null or p_purchase_date > current_date + 1 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if p_card_id is not null then
    select * into v_card from public.credit_cards c
    where c.id = p_card_id and c.organization_id = p_organization_id and c.active;
    if not found then
      raise exception 'card_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.installment_plans
    (organization_id, card_id, description, category_id, total_cents, installments, purchase_date, notes,
     idempotency_key, created_by)
  values
    (p_organization_id, p_card_id, trim(p_description), p_category_id, p_total_cents, p_installments, p_purchase_date,
     nullif(trim(p_notes), ''), p_idempotency_key, v_user)
  returning * into v_plan;

  v_base := p_total_cents / p_installments;
  for k in 1..p_installments loop
    v_amount := v_base + case when k = 1 then p_total_cents - v_base * p_installments else 0 end;
    if p_card_id is not null then
      v_due := app.card_due_date(v_card.closing_day, v_card.due_day, p_purchase_date, k - 1);
    else
      v_due := (coalesce(p_first_due_date, p_purchase_date) + make_interval(months => k - 1))::date;
    end if;
    v_desc := case when p_installments = 1 then trim(p_description)
                   else trim(p_description) || ' (' || k || '/' || p_installments || ')' end;

    insert into public.financial_entries
      (organization_id, direction, description, amount_cents, competence_date, due_date, category_id, notes,
       installment_plan_id, installment_number, card_id, created_by)
    values
      (p_organization_id, 'payable', v_desc, v_amount, v_due, v_due, p_category_id, v_plan.notes,
       v_plan.id, k, p_card_id, v_user);
  end loop;

  return v_plan;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancelar compra parcelada (só sem parcela paga)
-- ---------------------------------------------------------------------------

create function public.cancel_installment_purchase(p_plan_id uuid, p_reason text)
returns public.installment_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.installment_plans;
begin
  select * into v_plan from public.installment_plans p where p.id = p_plan_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform app.assert_member(v_plan.organization_id);

  if v_plan.cancelled_at is not null then
    return v_plan;
  end if;
  perform 1 from public.financial_entries e where e.installment_plan_id = v_plan.id for update;
  if exists (select 1 from public.financial_entries e where e.installment_plan_id = v_plan.id and e.paid_cents <> 0) then
    raise exception 'purchase_has_payments' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.financial_entries e
  set cancelled_at = now(), cancel_reason = left(trim(p_reason), 500)
  where e.installment_plan_id = v_plan.id and e.cancelled_at is null;

  update public.installment_plans p
  set cancelled_at = now(), cancel_reason = left(trim(p_reason), 500)
  where p.id = v_plan.id
  returning * into v_plan;
  return v_plan;
end;
$$;

-- Parcelas se cancelam pela compra, nunca uma a uma.
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
  if v_entry.installment_plan_id is not null then
    raise exception 'entry_from_installments' using errcode = '55000';
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
-- RPC: pagar fatura (total ou parcial)
-- ---------------------------------------------------------------------------

create function public.pay_card_statement(
  p_card_id uuid,
  p_statement_month date,
  p_amount_cents bigint,
  p_account_id uuid,
  p_method public.payment_method,
  p_paid_on date,
  p_idempotency_key uuid
)
returns public.card_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.credit_cards;
  v_user uuid;
  v_month date := date_trunc('month', p_statement_month)::date;
  v_cp public.card_payments;
  v_open bigint;
  v_left bigint;
  v_part bigint;
  v_entry public.financial_entries;
  v_pay public.financial_payments;
begin
  -- Trava o cartão: pagamentos simultâneos da mesma fatura ficam em fila.
  select * into v_card from public.credit_cards c where c.id = p_card_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_card.organization_id);

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  select * into v_cp from public.card_payments p
  where p.organization_id = v_card.organization_id and p.idempotency_key = p_idempotency_key;
  if found then
    return v_cp;
  end if;

  if v_month is null then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  select coalesce(sum(e.amount_cents - e.paid_cents), 0) into v_open
  from public.financial_entries e
  where e.card_id = v_card.id and e.cancelled_at is null and date_trunc('month', e.due_date) = v_month;
  if p_amount_cents > v_open then
    raise exception 'amount_exceeds_open' using errcode = '22023';
  end if;

  insert into public.card_payments
    (organization_id, card_id, statement_month, account_id, amount_cents, paid_on, method, idempotency_key, created_by)
  values
    (v_card.organization_id, v_card.id, v_month, p_account_id, p_amount_cents, coalesce(p_paid_on, current_date),
     coalesce(p_method, 'other'), p_idempotency_key, v_user)
  returning * into v_cp;

  v_left := p_amount_cents;
  for v_entry in
    select * from public.financial_entries e
    where e.card_id = v_card.id and e.cancelled_at is null and date_trunc('month', e.due_date) = v_month
      and e.paid_cents < e.amount_cents
    order by e.due_date, e.created_at, e.installment_number
    for update
  loop
    exit when v_left = 0;
    v_part := least(v_left, v_entry.amount_cents - v_entry.paid_cents);
    -- apply_payment confere conta ativa e data.
    v_pay := app.apply_payment(v_entry, v_part, p_account_id, v_cp.method, v_cp.paid_on, null, null, v_user);
    update public.financial_payments p set card_payment_id = v_cp.id where p.id = v_pay.id;
    v_left := v_left - v_part;
  end loop;

  return v_cp;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: estornar pagamento de fatura
-- ---------------------------------------------------------------------------

create function public.reverse_card_payment(p_card_payment_id bigint, p_reason text)
returns public.card_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp public.card_payments;
  v_user uuid;
  v_pay public.financial_payments;
begin
  select * into v_cp from public.card_payments p where p.id = p_card_payment_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := app.assert_member(v_cp.organization_id);
  -- Mesma ordem de travas do pagamento: cartão primeiro.
  perform 1 from public.credit_cards c where c.id = v_cp.card_id for update;
  select * into v_cp from public.card_payments p where p.id = p_card_payment_id for update;

  if v_cp.reversed_at is not null then
    return v_cp;
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  for v_pay in
    select p.* from public.financial_payments p
    where p.card_payment_id = v_cp.id and p.amount_cents > 0
      and not exists (select 1 from public.financial_payments r where r.reverses_payment_id = p.id)
    order by p.id
  loop
    perform 1 from public.financial_entries e where e.id = v_pay.entry_id for update;
    insert into public.financial_payments
      (organization_id, entry_id, account_id, amount_cents, paid_on, method, notes, reverses_payment_id,
       card_payment_id, created_by)
    values
      (v_pay.organization_id, v_pay.entry_id, v_pay.account_id, -v_pay.amount_cents, current_date, v_pay.method,
       left(trim(p_reason), 500), v_pay.id, v_cp.id, v_user);
    update public.financial_entries e set paid_cents = e.paid_cents - v_pay.amount_cents where e.id = v_pay.entry_id;
  end loop;

  update public.card_payments p
  set reversed_at = now(), reverse_reason = left(trim(p_reason), 500)
  where p.id = v_cp.id
  returning * into v_cp;
  return v_cp;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visões
-- ---------------------------------------------------------------------------

-- Faturas: parcelas do cartão agrupadas pelo mês de vencimento.
create view public.card_statements
with (security_invoker = true)
as
select
  e.organization_id,
  e.card_id,
  date_trunc('month', e.due_date)::date as statement_month,
  max(e.due_date) as due_date,
  app.card_closing_date(c.closing_day, c.due_day, date_trunc('month', e.due_date)::date) as closing_date,
  sum(e.amount_cents)::bigint as total_cents,
  sum(e.paid_cents)::bigint as paid_cents,
  sum(e.amount_cents - e.paid_cents)::bigint as open_cents,
  count(*)::integer as installments,
  case
    when sum(e.amount_cents - e.paid_cents) = 0 then 'paid'
    when (now() at time zone 'America/Sao_Paulo')::date
      < app.card_closing_date(c.closing_day, c.due_day, date_trunc('month', e.due_date)::date) then 'open'
    when (now() at time zone 'America/Sao_Paulo')::date > max(e.due_date) then 'overdue'
    when sum(e.paid_cents) > 0 then 'partial'
    else 'closed'
  end as status
from public.financial_entries e
join public.credit_cards c on c.id = e.card_id
where e.card_id is not null and e.cancelled_at is null
group by e.organization_id, e.card_id, c.closing_day, c.due_day, date_trunc('month', e.due_date);

-- Lançamentos com os dados de parcela e cartão.
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
  e.purchase_id,
  e.installment_plan_id,
  e.installment_number,
  p.installments as installment_count,
  e.card_id,
  cc.name as card_name
from public.financial_entries e
join public.financial_categories c on c.id = e.category_id
left join public.customers cu on cu.id = e.customer_id
left join public.orders o on o.id = e.order_id
left join public.suppliers s on s.id = e.supplier_id
left join public.installment_plans p on p.id = e.installment_plan_id
left join public.credit_cards cc on cc.id = e.card_id;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.credit_cards enable row level security;
alter table public.installment_plans enable row level security;
alter table public.card_payments enable row level security;

revoke all on public.credit_cards, public.installment_plans, public.card_payments, public.card_statements
  from anon, authenticated;
grant select on public.credit_cards, public.installment_plans, public.card_payments, public.card_statements to authenticated;

grant insert (organization_id, name, closing_day, due_day, limit_cents) on public.credit_cards to authenticated;
grant update (name, closing_day, due_day, limit_cents, active) on public.credit_cards to authenticated;

create policy credit_cards_select on public.credit_cards
  for select to authenticated using (app.is_member(organization_id));
create policy credit_cards_insert on public.credit_cards
  for insert to authenticated with check (app.is_member(organization_id));
create policy credit_cards_update on public.credit_cards
  for update to authenticated using (app.is_member(organization_id)) with check (app.is_member(organization_id));
create policy installment_plans_select on public.installment_plans
  for select to authenticated using (app.is_member(organization_id));
create policy card_payments_select on public.card_payments
  for select to authenticated using (app.is_member(organization_id));

revoke all on function public.create_installment_purchase(uuid, text, bigint, integer, uuid, date, uuid, uuid, date, text) from public, anon;
revoke all on function public.cancel_installment_purchase(uuid, text) from public, anon;
revoke all on function public.pay_card_statement(uuid, date, bigint, uuid, public.payment_method, date, uuid) from public, anon;
revoke all on function public.reverse_card_payment(bigint, text) from public, anon;
grant execute on function public.create_installment_purchase(uuid, text, bigint, integer, uuid, date, uuid, uuid, date, text) to authenticated;
grant execute on function public.cancel_installment_purchase(uuid, text) to authenticated;
grant execute on function public.pay_card_statement(uuid, date, bigint, uuid, public.payment_method, date, uuid) to authenticated;
grant execute on function public.reverse_card_payment(bigint, text) to authenticated;

-- Exclusão de conta: compras pessoais sem descrição nem observações.
create or replace function app.anonymize_personal_installments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'personal' and new.closed_at is not null and old.closed_at is null then
    update public.installment_plans set description = 'Compra removida', notes = null where organization_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function app.anonymize_personal_installments() from public;

create trigger organizations_anonymize_personal_installments
  after update of closed_at on public.organizations
  for each row execute function app.anonymize_personal_installments();
