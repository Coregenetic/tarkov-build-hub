#!/usr/bin/env bash
# Startet eine wegwerfbare PostgreSQL für lokale Tests (nicht für Produktion).
# Nutzung:  scripts/test-db.sh start | stop | url
set -euo pipefail

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA_DIR="${TEST_DB_DIR:-/tmp/tbh-test-pg}"
PORT="${TEST_DB_PORT:-54329}"
RUN_AS="${TEST_DB_USER:-postgres}"
URL="postgres://tbh:tbh@127.0.0.1:${PORT}/tbh"

as_pg() {
  if [ "$(id -u)" = "0" ]; then su -s /bin/bash "$RUN_AS" -c "$*"; else bash -c "$*"; fi
}

case "${1:-}" in
  start)
    if [ ! -d "$DATA_DIR" ]; then
      mkdir -p "$DATA_DIR"
      [ "$(id -u)" = "0" ] && chown "$RUN_AS" "$DATA_DIR"
      as_pg "$PG_BIN/initdb -D $DATA_DIR -U postgres --auth=trust -E UTF8 >/dev/null"
    fi
    as_pg "$PG_BIN/pg_ctl -D $DATA_DIR -o '-p $PORT -k /tmp -c listen_addresses=127.0.0.1' -l $DATA_DIR/log.txt -w start >/dev/null"
    as_pg "$PG_BIN/psql -h 127.0.0.1 -p $PORT -U postgres -tAc \"SELECT 1 FROM pg_roles WHERE rolname='tbh'\" | grep -q 1 || $PG_BIN/psql -h 127.0.0.1 -p $PORT -U postgres -c \"CREATE ROLE tbh LOGIN PASSWORD 'tbh' CREATEDB\" >/dev/null"
    as_pg "$PG_BIN/psql -h 127.0.0.1 -p $PORT -U postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='tbh'\" | grep -q 1 || $PG_BIN/psql -h 127.0.0.1 -p $PORT -U postgres -c 'CREATE DATABASE tbh OWNER tbh' >/dev/null"
    echo "$URL"
    ;;
  stop)
    as_pg "$PG_BIN/pg_ctl -D $DATA_DIR -m fast stop" || true
    ;;
  url)
    echo "$URL"
    ;;
  *)
    echo "Nutzung: $0 start|stop|url" >&2
    exit 1
    ;;
esac
