#!/usr/bin/env bash
# Concorrência real de estoque: 20 conexões tentam tirar 1 unidade de um
# item com saldo 10 ao mesmo tempo. Com a linha travada, exatamente 10
# conseguem, 10 recebem insufficient_stock e o saldo termina em 0.
# Recebe DATABASE_URL do run.sh. Os dados ficam gravados (o banco de teste é
# descartável), com e-mail único para não colidir com outros testes.
set -euo pipefail

q() { psql "$DATABASE_URL" -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }

ids="$(q <<'SQL'
select test.login_as(test.create_user('concorrencia@example.com', 'Conc')) \g /dev/null
select (public.create_organization('Concorrência', 'resale')).id as org \gset
with p as (
  insert into public.products (organization_id, item_type, name) values (:'org', 'resale', 'Caneca') returning id
) select id as prod from p \gset
select from public.inventory_move(:'prod', 'purchase', 10, gen_random_uuid());
select auth.uid() || ' ' || :'prod';
SQL
)"
read -r user prod <<<"$(echo "$ids" | tail -n1)"

tmp="$(mktemp -d)"
for i in $(seq 1 20); do
  (
    if q -c "select test.login_as('$user')" \
         -c "select from public.inventory_move('$prod', 'sale', 1, gen_random_uuid())" >/dev/null 2>"$tmp/err$i"; then
      echo ok >"$tmp/res$i"
    else
      echo fail >"$tmp/res$i"
    fi
  ) &
done
wait

ok=$(cat "$tmp"/res* | grep -c "^ok$" || true)
fail=$(cat "$tmp"/res* | grep -c "^fail$" || true)
other=$(cat "$tmp"/err* | grep -v insufficient_stock | grep -c ERROR || true)

read -r stock sum count <<<"$(q -F ' ' -c "
  select p.stock_qty, (select sum(quantity) from public.inventory_movements where product_id = p.id),
         (select count(*) from public.inventory_movements where product_id = p.id)
  from public.products p where p.id = '$prod'")"
rm -rf "$tmp"

check() { if [[ "$1" == "$2" ]]; then echo "  ok - $3"; else echo "  FALHOU: $3 (esperado $2, veio $1)"; exit 1; fi; }
check "$ok" 10 "10 saídas simultâneas aceitas"
check "$fail" 10 "10 saídas simultâneas recusadas"
check "$other" 0 "recusas são todas por saldo insuficiente"
check "$stock" "0.000" "saldo final zero, sem negativo"
check "$sum" "0.000" "soma do histórico bate com o saldo"
check "$count" 11 "uma movimentação por saída aceita"
