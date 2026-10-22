#!/usr/bin/env bash
# Spins up a throw-away PostgreSQL cluster, applies a Supabase stub plus all
# migrations, runs the database test suite, then tears everything down.
# Requires PostgreSQL 15+ server binaries (initdb, pg_ctl) on PATH or in
# /usr/lib/postgresql/<ver>/bin.
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
PORT="${TEST_PG_PORT:-54329}"
DATA="$(mktemp -d)"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$DATA"
  RUN_AS=(su postgres -s /bin/bash -c)
fi

run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }

cleanup() { run "$PGBIN/pg_ctl -D $DATA -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

run "$PGBIN/initdb -D $DATA -U postgres --auth=trust" >/dev/null
run "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp -c listen_addresses=127.0.0.1' -l $DATA/log -w start" >/dev/null

export DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/postgres"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f tests/db/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/private/payment_details.example.sql

npx vitest run --config vitest.db.config.ts
