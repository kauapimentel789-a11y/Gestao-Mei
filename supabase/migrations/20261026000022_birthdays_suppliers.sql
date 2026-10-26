-- 0022 — Aniversário e endereço do cliente; fornecedor mais completo.
--
-- * customers.birth_day / birth_month / birth_year: aniversário opcional. O
--   ano é opcional porque muita gente sabe só o dia e o mês. 29/02 só com ano
--   bissexto (ou sem ano).
-- * customers.address: endereço de entrega (confeitaria, salgados etc.).
-- * upcoming_birthdays(): aniversários dos próximos dias, na data de Brasília.
--   Quem faz aniversário em 29/02 comemora em 28/02 nos anos não bissextos.
-- * suppliers.contact_name / address / supplies: com quem falar, onde fica e
--   o que o fornecedor vende.

alter table public.customers
  add column birth_day smallint check (birth_day between 1 and 31),
  add column birth_month smallint check (birth_month between 1 and 12),
  add column birth_year smallint check (birth_year between 1900 and 2100),
  add column address text check (address is null or char_length(trim(address)) between 3 and 200),
  add constraint customers_birthday_valid check (
    ((birth_day is null) = (birth_month is null))
    and (birth_year is null or birth_day is not null)
    and (birth_day is null or birth_day <= case birth_month when 2 then 29 when 4 then 30 when 6 then 30
                                                             when 9 then 30 when 11 then 30 else 31 end)
    and not (birth_month = 2 and birth_day = 29 and birth_year is not null
             and not (birth_year % 4 = 0 and (birth_year % 100 <> 0 or birth_year % 400 = 0)))
  );

create index customers_org_birthday_idx on public.customers (organization_id, birth_month, birth_day)
  where birth_month is not null;

grant insert (birth_day, birth_month, birth_year, address) on public.customers to authenticated;
grant update (birth_day, birth_month, birth_year, address) on public.customers to authenticated;

-- Data do aniversário no ano dado (29/02 vira 28/02 quando o ano não é bissexto).
create function app.birthday_in(p_year integer, p_month integer, p_day integer) returns date
language sql immutable as $$
  select make_date(p_year, p_month,
    least(p_day, extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::integer));
$$;
revoke all on function app.birthday_in(integer, integer, integer) from public, anon;
grant execute on function app.birthday_in(integer, integer, integer) to authenticated;

-- Aniversários de hoje até daqui a p_days dias (máx. 366), do mais próximo ao
-- mais distante. Roda com as permissões de quem chama: a RLS de customers
-- garante que só aparecem clientes da empresa.
create function public.upcoming_birthdays(p_organization_id uuid, p_days integer default 30)
returns table (
  id uuid,
  name text,
  phone text,
  phone_digits text,
  address text,
  birth_day smallint,
  birth_month smallint,
  birth_year smallint,
  next_birthday date,
  days_until integer,
  turning integer
)
language sql stable security invoker as $$
  with t as (select (now() at time zone 'America/Sao_Paulo')::date as today),
  c as (
    select cu.*, t.today,
      app.birthday_in(extract(year from t.today)::integer, cu.birth_month, cu.birth_day) as this_year
    from public.customers cu, t
    where cu.organization_id = p_organization_id and cu.birth_month is not null
  ),
  n as (
    select c.*,
      case when c.this_year >= c.today then c.this_year
           else app.birthday_in(extract(year from c.today)::integer + 1, c.birth_month, c.birth_day) end as next_date
    from c
  )
  select n.id, n.name, n.phone, n.phone_digits, n.address, n.birth_day, n.birth_month, n.birth_year,
    n.next_date, n.next_date - n.today,
    case when n.birth_year is null then null else extract(year from n.next_date)::integer - n.birth_year end
  from n
  where n.next_date - n.today <= least(greatest(coalesce(p_days, 30), 0), 366)
  order by n.next_date - n.today, lower(n.name);
$$;
revoke all on function public.upcoming_birthdays(uuid, integer) from public, anon;
grant execute on function public.upcoming_birthdays(uuid, integer) to authenticated;

alter table public.suppliers
  add column contact_name text check (contact_name is null or char_length(trim(contact_name)) between 1 and 120),
  add column address text check (address is null or char_length(trim(address)) between 3 and 200),
  add column supplies text check (supplies is null or char_length(trim(supplies)) between 1 and 300);

grant insert (contact_name, address, supplies) on public.suppliers to authenticated;
grant update (contact_name, address, supplies) on public.suppliers to authenticated;
