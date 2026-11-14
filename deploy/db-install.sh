#!/usr/bin/env bash
# Eigene Datenbank für den Build Hub: neuer Docker-Container "tbh-postgres" (PostgreSQL 16).
# Lauscht nur auf 127.0.0.1:5432, eigenes Volume "tbh-pgdata", eigenes Zufallspasswort.
# Bestehende Container (lootgame, polier-behr-app) werden nicht angefasst.
#
#   sudo ./db-install.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$HERE/lib.sh"
need_root

command -v docker >/dev/null || die "Docker wird benötigt."
ENVF="$BASE/shared/.env"
[[ -f $ENVF ]] || die "Erst ./install.sh ausführen."

if docker container inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  info "Container $PG_CONTAINER gibt es schon – Zustand:"
  docker ps -a --filter "name=^${PG_CONTAINER}\$" --format '   {{.Names}}  {{.Status}}  {{.Ports}}'
  exit 0
fi
port_taken 127.0.0.1 5432 && die "Port 5432 ist schon belegt – nichts verändert."
docker volume inspect "$PG_VOLUME" >/dev/null 2>&1 && die "Volume $PG_VOLUME existiert schon (alte Daten?). Bitte prüfen – nichts verändert."

PW=$(openssl rand -hex 24)
info "Lade Image $PG_IMAGE"
docker pull -q "$PG_IMAGE"
info "Starte Container $PG_CONTAINER (nur 127.0.0.1:5432)"
docker volume create "$PG_VOLUME" >/dev/null
docker run -d \
  --name "$PG_CONTAINER" \
  --restart unless-stopped \
  --memory 512m \
  --shm-size 128m \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p 127.0.0.1:5432:5432 \
  -v "$PG_VOLUME":/var/lib/postgresql/data \
  -e POSTGRES_USER=tbh \
  -e POSTGRES_DB=tbh \
  -e POSTGRES_PASSWORD="$PW" \
  "$PG_IMAGE" >/dev/null

info "Warte, bis die Datenbank bereit ist"
for _ in $(seq 1 60); do
  docker exec "$PG_CONTAINER" pg_isready -U tbh -d tbh -q 2>/dev/null && break
  sleep 1
done
docker exec "$PG_CONTAINER" pg_isready -U tbh -d tbh -q || die "Datenbank antwortet nicht (docker logs $PG_CONTAINER)."

set_env "$ENVF" DATABASE_URL "postgres://tbh:$PW@127.0.0.1:5432/tbh"
echo
echo "Datenbank läuft: $(docker exec "$PG_CONTAINER" postgres --version)"
echo "Zugangsdaten stehen in $ENVF (nur für Nutzer tbh lesbar)."
echo "Nächster Schritt: sudo ./deploy/deploy.sh <tbh-version.tar.gz>"
