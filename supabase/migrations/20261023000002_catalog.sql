-- 0002 — Clientes, categorias e itens.
--
-- `products` é o cadastro único de tudo que a empresa vende ou estoca:
-- matéria-prima, mercadoria, produto acabado, material de consumo,
-- componente e serviço (serviço não controla estoque).
--
-- O saldo `stock_qty` não é gravável pelo app: só muda pelas RPCs de
-- movimentação de estoque (migração própria), que registram o histórico.

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 30),
  -- Telefone só com dígitos, para busca e para casar clientes (nunca pelo nome).
  phone_digits text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create index customers_org_name_idx on public.customers (organization_id, lower(name));
create index customers_org_phone_idx on public.customers (organization_id, phone_digits) where phone_digits is not null;

create trigger customers_updated_at
  before update on public.customers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Categorias de itens
-- ---------------------------------------------------------------------------

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index product_categories_org_name_key on public.product_categories (organization_id, lower(trim(name)));

-- ---------------------------------------------------------------------------
-- Itens
-- ---------------------------------------------------------------------------

create type public.item_type as enum (
  'raw_material',  -- matéria-prima / insumo
  'resale',        -- mercadoria para revenda
  'finished',      -- produto acabado
  'consumable',    -- material de consumo
  'component',     -- peça ou componente
  'service'        -- serviço (sem estoque)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_type public.item_type not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  sku text check (sku is null or char_length(trim(sku)) between 1 and 40),
  category_id uuid,
  unit text not null default 'un'
    check (unit in ('un', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'm2', 'h', 'cx', 'pct', 'par', 'dz')),
  track_stock boolean not null default true,
  stock_qty numeric(14, 3) not null default 0,
  min_stock numeric(14, 3) not null default 0 check (min_stock >= 0),
  cost_cents bigint check (cost_cents is null or cost_cents between 0 and 100000000000),
  price_cents bigint check (price_cents is null or price_cents between 0 and 100000000000),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, category_id)
    references public.product_categories (organization_id, id),
  -- Serviço não tem estoque.
  constraint products_service_no_stock check (item_type <> 'service' or (not track_stock and stock_qty = 0))
);

create unique index products_org_sku_key on public.products (organization_id, lower(trim(sku))) where sku is not null;
create index products_org_name_idx on public.products (organization_id, lower(name));
create index products_org_type_idx on public.products (organization_id, item_type) where active;

create trigger products_updated_at
  before update on public.products
  for each row execute function app.set_updated_at();

-- Serviço nunca controla estoque, mesmo que o app mande o contrário.
create function app.products_service_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.item_type = 'service' then
    new.track_stock := false;
  end if;
  return new;
end;
$$;

create trigger products_service_defaults
  before insert or update on public.products
  for each row execute function app.products_service_defaults();

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;

revoke all on public.customers, public.product_categories, public.products from anon, authenticated;

-- Sem DELETE: clientes e itens ficam no histórico de pedidos. Item sai de uso
-- com active = false.
grant select on public.customers to authenticated;
grant insert (organization_id, name, phone, notes) on public.customers to authenticated;
grant update (name, phone, notes) on public.customers to authenticated;

grant select on public.product_categories to authenticated;
grant insert (organization_id, name) on public.product_categories to authenticated;
grant update (name) on public.product_categories to authenticated;

grant select on public.products to authenticated;
grant insert (organization_id, item_type, name, description, sku, category_id, unit, track_stock,
              min_stock, cost_cents, price_cents, active)
  on public.products to authenticated;
grant update (name, description, sku, category_id, unit, track_stock, min_stock, cost_cents,
              price_cents, active)
  on public.products to authenticated;

create policy customers_select on public.customers
  for select to authenticated using (app.is_member(organization_id));
create policy customers_insert on public.customers
  for insert to authenticated with check (app.is_member(organization_id));
create policy customers_update on public.customers
  for update to authenticated
  using (app.is_member(organization_id)) with check (app.is_member(organization_id));

create policy product_categories_select on public.product_categories
  for select to authenticated using (app.is_member(organization_id));
create policy product_categories_insert on public.product_categories
  for insert to authenticated with check (app.is_member(organization_id));
create policy product_categories_update on public.product_categories
  for update to authenticated
  using (app.is_member(organization_id)) with check (app.is_member(organization_id));

create policy products_select on public.products
  for select to authenticated using (app.is_member(organization_id));
create policy products_insert on public.products
  for insert to authenticated with check (app.is_member(organization_id));
create policy products_update on public.products
  for update to authenticated
  using (app.is_member(organization_id)) with check (app.is_member(organization_id));
