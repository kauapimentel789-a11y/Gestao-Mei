#!/usr/bin/env bash
# Concorrência real no financeiro: 10 conexões tentam pagar R$ 30,00 de um
# título de R$ 100,00 ao mesmo tempo. Com o título travado, exatamente 3
# conseguem, as outras recebem amount_exceeds_open e nada é pago a mais.
set -euo pipefail

q() { psql "$DATABASE_URL" -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }

ids="$(q <<'SQL'
select test.login_as(test.create_user('concorrencia-fin@example.com', 'Conc')) \g /dev/null
select (public.create_organization('Concorrência Fin', 'resale')).id as org \gset
select id as acc from public.financial_accounts where organization_id = :'org' \gset
select id as cat from public.financial_categories where organization_id = :'org' and name = 'Aluguel' \gset
select (public.create_financial_entry(:'org', 'payable', 'Aluguel', 10000, :'cat', current_date, gen_random_uuid())).id as entry \gset
select auth.uid() || ' ' || :'entry' || ' ' || :'acc';
SQL
)"
read -r user entry acc <<<"$(echo "$ids" | tail -n1)"

tmp="$(mktemp -d)"
for i in $(seq 1 10); do
  (
    if q -c "select test.login_as('$user')" \
         -c "select from public.settle_financial_entry('$entry', 3000, '$acc', 'pix', current_date, gen_random_uuid())" >/dev/null 2>"$tmp/err$i"; then
      echo ok >"$tmp/res$i"
    else
      echo fail >"$tmp/res$i"
    fi
  ) &
done
wait

ok=$(cat "$tmp"/res* | grep -c "^ok$" || true)
fail=$(cat "$tmp"/res* | grep -c "^fail$" || true)
other=$(cat "$tmp"/err* | grep -v amount_exceeds_open | grep -c ERROR || true)

read -r paid sum <<<"$(q -F ' ' -c "
  select e.paid_cents, (select sum(amount_cents) from public.financial_payments where entry_id = e.id)
  from public.financial_entries e where e.id = '$entry'")"
rm -rf "$tmp"

check() { if [[ "$1" == "$2" ]]; then echo "  ok - $3"; else echo "  FALHOU: $3 (esperado $2, veio $1)"; exit 1; fi; }
check "$ok" 3 "3 pagamentos simultâneos aceitos"
check "$fail" 7 "7 pagamentos simultâneos recusados"
check "$other" 0 "recusas são todas por valor acima do aberto"
check "$paid" 9000 "pago no título = 3 × R\$ 30,00"
check "$sum" 9000 "soma das baixas bate com o título"
