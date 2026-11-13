#!/usr/bin/env bash
# Gemeinsame Hilfen für install.sh, update.sh und rollback.sh.
set -euo pipefail

BASE=/opt/tarkov-build-hub
NODE_BIN="$BASE/runtime/node/bin/node"
UNITS=(tbh-web.service tbh-maintenance.service tbh-maintenance.timer tbh-backup.service tbh-backup.timer)

die() { echo "ABBRUCH: $*" >&2; exit 1; }
info() { echo "→ $*"; }
need_root() { [[ $EUID -eq 0 ]] || die "bitte mit sudo ausführen."; }

# Lauscht schon jemand auf ADRESSE:PORT – auch über eine Wildcard (0.0.0.0, ::, *)?
port_taken() {
  local addr=$1 port=$2
  ss -Hltn "sport = :$port" | awk '{print $4}' | while read -r local; do
    local host=${local%:*}
    host=${host#[}; host=${host%]}
    if [[ $host == "$addr" || $host == "0.0.0.0" || $host == "*" || $host == "::" ]]; then echo "$local"; fi
  done | grep -q .
}

health() {
  local _
  for _ in $(seq 1 40); do
    curl -fsS --max-time 2 http://127.0.0.1:3002/api/health >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

# Nur eigene Einheiten (tbh-*) anfassen – nie andere Dienste.
install_units() {
  local src=$1 changed=0 u
  for u in "${UNITS[@]}"; do
    if ! cmp -s "$src/deploy/systemd/$u" "/etc/systemd/system/$u"; then
      install -m 0644 "$src/deploy/systemd/$u" "/etc/systemd/system/$u"
      changed=1
    fi
  done
  if [[ $changed == 1 ]]; then systemctl daemon-reload; fi
}

run_migrations() {
  local rel=$1
  info "Datenbank-Migrationen"
  runuser -u tbh -- "$NODE_BIN" --env-file="$BASE/shared/.env" "$rel/tools/migrate.mjs"
}
