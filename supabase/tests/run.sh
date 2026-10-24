#!/usr/bin/env bash
# Roda migrações + testes SQL num Postgres local.
#
# Uso:
#   DATABASE_URL=postgres://... bash supabase/tests/run.sh   # usa um banco existente (ex.: CI)
#   bash supabase/tests/run.sh                               # sobe um cluster temporário (precisa de initdb no PATH)
#
# O banco precisa estar vazio: o script cria o shim do Supabase, aplica as
# migrações em ordem e executa os arquivos *_test.sql e *_test.sh
# (estes últimos para testes com várias conexões, como concorrência).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
tmp=""

cleanup() {
  if [[ -n "$tmp" ]]; then
    pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$tmp"
  fi
}
trap cleanup EXIT

if [[ -z "${DATABASE_URL:-}" ]]; then
  if ! command -v initdb >/dev/null; then
    for d in /usr/lib/postgresql/*/bin; do PATH="$d:$PATH"; done
  fi
  tmp="$(mktemp -d)"
  initdb -D "$tmp/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
  pg_ctl -D "$tmp/data" -o "-k $tmp -p 54329 -c listen_addresses=''" -l "$tmp/log" -w start >/dev/null
  DATABASE_URL="postgresql://postgres@/postgres?host=$tmp&port=54329"
fi

psql_run() { psql "$DATABASE_URL" -X -q -t -v ON_ERROR_STOP=1 "$@"; }

psql_run -f "$here/00_supabase_shim.sql"
for f in "$root"/supabase/migrations/*.sql; do
  echo "migração: $(basename "$f")"
  psql_run -f "$f"
done
psql_run -f "$here/01_helpers.sql"

status=0
for f in "$here"/*_test.sql; do
  echo "teste: $(basename "$f")"
  if ! psql_run -f "$f" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /'; then
    status=1
  fi
done
for f in "$here"/*_test.sh; do
  [[ -e "$f" ]] || continue
  echo "teste: $(basename "$f")"
  if ! DATABASE_URL="$DATABASE_URL" bash "$f"; then
    status=1
  fi
done

if [[ $status -ne 0 ]]; then
  echo "TESTES SQL FALHARAM"
else
  echo "todos os testes SQL passaram"
fi
exit $status
