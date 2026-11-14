#!/usr/bin/env bash
# Ersteinrichtung des Build Hub unter /opt/tarkov-build-hub.
# Legt NUR Neues an (Nutzer tbh, Ordner, eigene Node-Laufzeit, Umgebungsdatei, tbh-admin).
# Ändert keine bestehenden Dienste, keine Caddy-Konfiguration, keine Container, keine Firewall.
#
#   sudo ./install.sh --domain builds.lootgamebot.de
#
# Node 22 wird von nodejs.org geladen und gegen SHASUMS256.txt geprüft.
# Alternativ: --node /pfad/node-v22.x.y-linux-x64.tar.xz (bereits geprüftes Archiv).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$HERE/lib.sh"
need_root

NODE_TARBALL=""
DOMAIN=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --node) NODE_TARBALL=$2; shift 2 ;;
    --domain) DOMAIN=$2; shift 2 ;;
    *) die "unbekannte Option $1" ;;
  esac
done
[[ -z $DOMAIN || $DOMAIN =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die "Ungültige Domain: $DOMAIN"

info "Prüfe Voraussetzungen"
for c in systemctl ss curl sha256sum tar xz openssl; do command -v "$c" >/dev/null || die "$c wird benötigt."; done
if port_taken 127.0.0.1 3002 && ! systemctl is-active --quiet tbh-web.service; then
  die "Port 3002 ist schon von einem anderen Programm belegt – nichts verändert."
fi

info "Nutzer tbh (Systemnutzer ohne Anmeldung)"
id tbh >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --no-create-home --shell /usr/sbin/nologin tbh

info "Ordner unter $BASE"
install -d -m 0755 -o root -g root "$BASE" "$BASE/runtime"
install -d -m 0755 -o tbh -g tbh "$BASE/releases"
install -d -m 0750 -o tbh -g tbh "$BASE/shared"
install -d -m 0700 -o root -g root "$BASE/backups"

if [[ ! -x $NODE_BIN ]]; then
  if [[ -z $NODE_TARBALL ]]; then
    info "Lade Node 22 (aktuellste 22.x) von nodejs.org und prüfe die Prüfsumme"
    dl=$(mktemp -d)
    trap 'rm -rf "$dl"' EXIT
    dist=${TBH_NODE_DIST:-https://nodejs.org/dist/latest-v22.x}
    curl -fsSL --retry 3 -o "$dl/SHASUMS256.txt" "$dist/SHASUMS256.txt"
    file=$(grep -oE 'node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$' "$dl/SHASUMS256.txt" | head -1)
    [[ -n $file ]] || die "Node-22-Archiv nicht in SHASUMS256.txt gefunden."
    curl -fsSL --retry 3 -o "$dl/$file" "$dist/$file"
    (cd "$dl" && grep " $file\$" SHASUMS256.txt | sha256sum -c --quiet -) || die "Prüfsumme von $file stimmt nicht – nichts installiert."
    NODE_TARBALL="$dl/$file"
  fi
  name=$(basename "$NODE_TARBALL"); name=${name%.tar.xz}; name=${name%.tar.gz}
  [[ $name =~ ^node-v22\.[0-9]+\.[0-9]+-linux-(x64|arm64)$ ]] || die "Erwarte ein offizielles Node-22-Archiv (node-v22.x.y-linux-x64)."
  info "Eigene Node-Laufzeit $name (unabhängig von einer System-Node)"
  tar -xf "$NODE_TARBALL" -C "$BASE/runtime"
  ln -sfn "$BASE/runtime/$name" "$BASE/runtime/node"
fi
"$NODE_BIN" -v | grep -q '^v22\.' || die "Node 22 erwartet, gefunden: $("$NODE_BIN" -v)"

ENVF="$BASE/shared/.env"
if [[ ! -f $ENVF ]]; then
  info "Umgebungsdatei anlegen"
  install -m 0600 -o tbh -g tbh "$HERE/env.production.example" "$ENVF"
fi
if grep -q '^AUTH_SECRET=CHANGE_ME' "$ENVF"; then
  info "Zufälligen AUTH_SECRET erzeugen"
  set_env "$ENVF" AUTH_SECRET "$(openssl rand -hex 48)"
fi
if [[ -n $DOMAIN ]]; then
  set_env "$ENVF" PUBLIC_BASE_URL "https://$DOMAIN"
fi

info "Verwaltungsbefehl tbh-admin"
install -m 0755 "$HERE/tbh-admin" /usr/local/bin/tbh-admin

echo
echo "Ersteinrichtung fertig. Bestehende Dienste wurden nicht angefasst."
echo "  Node:     $("$NODE_BIN" -v)"
echo "  Adresse:  $(grep '^PUBLIC_BASE_URL=' "$ENVF" | cut -d= -f2-)"
echo "Nächster Schritt: sudo ./deploy/db-install.sh"
