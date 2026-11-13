#!/usr/bin/env bash
# Ersteinrichtung des Build Hub unter /opt/tarkov-build-hub.
# Legt NUR Neues an (Nutzer tbh, Ordner, tbh-*-Dienste). Ändert keine bestehenden Dienste,
# keine Caddy-Konfiguration, keine Ports anderer Programme und keine Firewall-Regeln.
#
#   sudo ./install.sh --node /pfad/node-v22.x.y-linux-x64.tar.xz
#
# Danach: /opt/tarkov-build-hub/shared/.env ausfüllen und das Release mit ./deploy.sh ausrollen.
# Die eigene Caddy-Instanz ist ein getrennter, ausdrücklicher Schritt: ./caddy-install.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$HERE/lib.sh"
need_root

NODE_TARBALL=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --node) NODE_TARBALL=$2; shift 2 ;;
    *) die "unbekannte Option $1" ;;
  esac
done

info "Prüfe Voraussetzungen"
command -v systemctl >/dev/null || die "systemd wird benötigt."
command -v ss >/dev/null || die "ss (iproute2) wird benötigt."
command -v curl >/dev/null || die "curl wird benötigt."
if port_taken 127.0.0.1 3002 && ! systemctl is-active --quiet tbh-web.service; then
  die "Port 3002 ist schon von einem anderen Programm belegt – nichts verändert."
fi

info "Nutzer tbh (Systemnutzer ohne Anmeldung)"
id tbh >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --no-create-home --shell /usr/sbin/nologin tbh

info "Ordner unter $BASE"
install -d -m 0755 -o root -g root "$BASE" "$BASE/runtime"
install -d -m 0755 -o tbh -g tbh "$BASE/releases"
install -d -m 0750 -o tbh -g tbh "$BASE/shared" "$BASE/backups"

if [[ ! -x $NODE_BIN ]]; then
  [[ -n $NODE_TARBALL ]] || die "Keine Node-Laufzeit vorhanden. Mit --node <node-v22…-linux-x64.tar.xz> angeben (von nodejs.org, Prüfsumme vorher mit SHASUMS256.txt vergleichen)."
  info "Eigene Node-Laufzeit aus $NODE_TARBALL (unabhängig von einer System-Node)"
  name=$(basename "$NODE_TARBALL"); name=${name%.tar.xz}; name=${name%.tar.gz}
  [[ $name =~ ^node-v22\.[0-9]+\.[0-9]+-linux-(x64|arm64)$ ]] || die "Erwarte ein offizielles Node-22-Archiv (node-v22.x.y-linux-x64)."
  tar -xf "$NODE_TARBALL" -C "$BASE/runtime"
  ln -sfn "$BASE/runtime/$name" "$BASE/runtime/node"
fi
"$NODE_BIN" -v | grep -q '^v22\.' || die "Node 22 erwartet, gefunden: $("$NODE_BIN" -v)"

if [[ ! -f $BASE/shared/.env ]]; then
  info "Umgebungsdatei anlegen (Vorlage)"
  install -m 0600 -o tbh -g tbh "$HERE/env.production.example" "$BASE/shared/.env"
  echo "   Bitte $BASE/shared/.env ausfüllen (DATABASE_URL, PUBLIC_BASE_URL, AUTH_SECRET, Twitch)."
fi

info "Verwaltungsbefehl tbh-admin"
install -m 0755 "$HERE/tbh-admin" /usr/local/bin/tbh-admin

echo
echo "Ersteinrichtung fertig. Bestehende Dienste wurden nicht angefasst."
echo "Nächster Schritt: $BASE/shared/.env ausfüllen, dann: sudo ./deploy.sh <release.tar.gz>"
