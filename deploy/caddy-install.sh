#!/usr/bin/env bash
# Eigene Caddy-Instanz für den Build Hub – ZUSÄTZLICH zu den bestehenden Instanzen.
#
#   sudo ./caddy-install.sh --caddy /pfad/caddy_2.x.y_linux_amd64.tar.gz
#
# Vorher /opt/tarkov-build-hub/caddy/caddy.env ausfüllen (Vorlage: caddy/caddy.env.example).
# Eigenes Caddy-Programm unter /opt/tarkov-build-hub/caddy/bin, eigener Nutzer tbh-caddy,
# eigene Zertifikate, Admin-Schnittstelle aus, lauscht NUR auf TBH_BIND.
# Bricht ab, ohne etwas zu verändern, wenn die Adresse/Ports schon belegt sind –
# auch durch eine bestehende Instanz, die auf allen Adressen (0.0.0.0 / ::) lauscht.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$HERE/lib.sh"
need_root

CADDY_ARCHIVE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --caddy) CADDY_ARCHIVE=$2; shift 2 ;;
    *) die "unbekannte Option $1" ;;
  esac
done

C="$BASE/caddy"
install -d -m 0755 -o root -g root "$C" "$C/bin"
if [[ ! -f $C/caddy.env ]]; then
  install -m 0640 -o root -g root "$HERE/caddy/caddy.env.example" "$C/caddy.env"
  die "$C/caddy.env angelegt – bitte ausfüllen und erneut starten."
fi
# shellcheck disable=SC1091
set -a; . "$C/caddy.env"; set +a
[[ ${TBH_DOMAIN:-} && $TBH_DOMAIN != builds.example.de ]] || die "TBH_DOMAIN in $C/caddy.env eintragen."
[[ ${TBH_BIND:-} && $TBH_BIND != 203.0.113.10 ]] || die "TBH_BIND in $C/caddy.env eintragen."
ip -o addr show | awk '{print $4}' | cut -d/ -f1 | grep -qx "$TBH_BIND" || die "$TBH_BIND ist keine Adresse dieses Servers."

info "Prüfe, ob $TBH_BIND:$TBH_HTTP_PORT und :$TBH_HTTPS_PORT frei sind"
if ! systemctl is-active --quiet tbh-caddy.service; then
  for p in "$TBH_HTTP_PORT" "$TBH_HTTPS_PORT"; do
    if port_taken "$TBH_BIND" "$p"; then
      echo "Belegt:" >&2
      ss -Hltnp "sport = :$p" >&2
      die "Port $p ist auf $TBH_BIND schon belegt (oder eine Instanz lauscht auf allen Adressen). Nichts verändert."
    fi
  done
fi

if [[ ! -x $C/bin/caddy ]]; then
  [[ -n $CADDY_ARCHIVE ]] || die "Kein Caddy-Programm. Mit --caddy <caddy_2.x.y_linux_amd64.tar.gz> angeben (GitHub-Release, Prüfsumme vorher vergleichen)."
  tmp=$(mktemp -d)
  tar -xzf "$CADDY_ARCHIVE" -C "$tmp" caddy
  install -m 0755 "$tmp/caddy" "$C/bin/caddy"
  rm -rf "$tmp"
fi
"$C/bin/caddy" version

id tbh-caddy >/dev/null 2>&1 || useradd --system --home-dir "$C" --no-create-home --shell /usr/sbin/nologin tbh-caddy
install -d -m 0750 -o tbh-caddy -g tbh-caddy "$C/data" "$C/config" "$C/logs"
install -m 0644 "$HERE/caddy/Caddyfile" "$C/Caddyfile"

info "Konfiguration prüfen"
runuser -u tbh-caddy -- env TBH_DOMAIN="$TBH_DOMAIN" TBH_BIND="$TBH_BIND" TBH_HTTP_PORT="$TBH_HTTP_PORT" TBH_HTTPS_PORT="$TBH_HTTPS_PORT" \
  TBH_ACME_EMAIL="$TBH_ACME_EMAIL" XDG_DATA_HOME="$C/data" XDG_CONFIG_HOME="$C/config" \
  "$C/bin/caddy" validate --config "$C/Caddyfile" --adapter caddyfile

install -m 0644 "$HERE/systemd/tbh-caddy.service" /etc/systemd/system/tbh-caddy.service
systemctl daemon-reload
systemctl enable --quiet tbh-caddy.service
if systemctl is-active --quiet tbh-caddy.service; then systemctl reload tbh-caddy.service; else systemctl start tbh-caddy.service; fi
sleep 2
systemctl is-active --quiet tbh-caddy.service || { journalctl -u tbh-caddy -n 30 --no-pager; die "tbh-caddy läuft nicht."; }
echo "Eigene Caddy-Instanz läuft auf $TBH_BIND für https://$TBH_DOMAIN. Andere Instanzen wurden nicht angefasst."
