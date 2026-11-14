#!/usr/bin/env bash
# Build Hub im vorhandenen Caddy veröffentlichen – als EIGENE Datei, ohne bestehende Seiten zu ändern.
#
#   sudo ./caddy-site.sh --domain builds.lootgamebot.de     # einrichten
#   sudo ./caddy-site.sh --remove                           # vollständig zurücknehmen
#
# Ablauf beim Einrichten:
#  1. Sicherung der Caddyfile (Caddyfile.vor-build-hub-<zeit>)
#  2. neue Datei build-hub.caddy, am Ende der Caddyfile EINE Zeile "import …/build-hub.caddy"
#  3. caddy validate – bei Fehler wird die Sicherung sofort zurückgespielt, Caddy nicht neu geladen
#  4. systemctl reload caddy (ohne Unterbrechung; laufende Seiten bleiben erreichbar)
#  5. läuft Caddy danach nicht, wird die Sicherung zurückgespielt und erneut geladen
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$HERE/lib.sh"
need_root

CADDY_DIR=${TBH_CADDY_DIR:-/etc/caddy}
CF="$CADDY_DIR/Caddyfile"
SITE="$CADDY_DIR/build-hub.caddy"
LINE="import $SITE"
MARK="# Tarkov Build Hub – eigene Datei, entfernen mit: caddy-site.sh --remove"

DOMAIN=""
REMOVE=0
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN=$2; shift 2 ;;
    --remove) REMOVE=1; shift ;;
    *) die "unbekannte Option $1" ;;
  esac
done

command -v caddy >/dev/null || die "caddy nicht gefunden."
[[ -f $CF ]] || die "$CF nicht gefunden."
systemctl is-active --quiet caddy || die "caddy.service läuft nicht – nichts verändert."

# Lässt sich die bestehende Konfiguration von hier aus prüfen? Sonst lieber gar nichts anfassen.
if ! caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then
  caddy validate --config "$CF" --adapter caddyfile 2>&1 | tail -5 >&2
  die "Die bestehende Caddyfile lässt sich so nicht prüfen – nichts verändert. Bitte die Meldung an Claude geben."
fi

backup="$CF.vor-build-hub-$(date +%Y%m%d-%H%M%S)"
cp -a "$CF" "$backup"
site_existed=0
[[ -f $SITE ]] && site_existed=1 && cp -a "$SITE" "$backup.site"

restore() {
  cp -a "$backup" "$CF"
  if [[ $site_existed == 1 ]]; then cp -a "$backup.site" "$SITE"; else rm -f "$SITE"; fi
}

VLOG=$(mktemp)
trap 'rm -f "$VLOG"' EXIT
validate() { caddy validate --config "$CF" --adapter caddyfile >"$VLOG" 2>&1; }

reload_or_restore() {
  if ! validate; then
    restore
    tail -15 "$VLOG" >&2
    die "Caddy-Konfiguration ungültig – ursprünglicher Zustand wiederhergestellt, Caddy wurde nicht neu geladen."
  fi
  if ! systemctl reload caddy || ! { sleep 2; systemctl is-active --quiet caddy; }; then
    restore
    systemctl reload caddy || true
    die "Neuladen fehlgeschlagen – ursprünglicher Zustand wiederhergestellt."
  fi
}

if [[ $REMOVE == 1 ]]; then
  info "Nehme den Build Hub aus Caddy heraus"
  # Genau den angehängten Block entfernen, damit die Caddyfile wieder Byte für Byte wie vorher ist.
  content=$(cat "$CF"; printf x); content=${content%x}
  suffix=$'\n'"$MARK"$'\n'"$LINE"$'\n'
  if [[ $content == *"$suffix" ]]; then
    printf '%s' "${content%"$suffix"}" > "$CF"
  else
    tmp=$(mktemp)
    grep -vxF -e "$LINE" -e "$MARK" "$CF" > "$tmp" || true
    cat "$tmp" > "$CF"; rm -f "$tmp"
  fi
  rm -f "$SITE"
  reload_or_restore
  echo "Entfernt. Sicherung der vorherigen Caddyfile: $backup"
  exit 0
fi

[[ $DOMAIN =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die "Bitte --domain angeben (z. B. builds.lootgamebot.de)."
# Domain darf nicht schon von einer bestehenden Seite benutzt werden – geprüft an der von Caddy
# ausgewerteten Konfiguration (inklusive importierter Dateien). Die eigene Datei zählt nicht.
used_elsewhere() {
  local adapted
  if [[ $site_existed == 1 ]]; then mv "$SITE" "$SITE.pruefung"; : > "$SITE"; fi
  adapted=$(caddy adapt --config "$CF" --adapter caddyfile 2>/dev/null || true)
  if [[ $site_existed == 1 ]]; then mv "$SITE.pruefung" "$SITE"; fi
  grep -qF "\"$DOMAIN\"" <<<"$adapted"
}
if used_elsewhere; then
  rm -f "$backup" "$backup.site"
  die "$DOMAIN wird schon von einer bestehenden Seite benutzt – nichts verändert."
fi
port_taken 127.0.0.1 3002 || echo "   Hinweis: auf 127.0.0.1:3002 läuft noch nichts (erst deploy.sh)."

info "Schreibe $SITE"
cat > "$SITE" <<EOF
# Tarkov Build Hub – wird von caddy-site.sh verwaltet.
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3002 {
		# Nur die echte Client-Adresse weitergeben (keine vom Client mitgeschickten Werte).
		header_up X-Forwarded-For {remote_host}
	}
}
EOF
chmod 0644 "$SITE"
if ! grep -qxF "$LINE" "$CF"; then
  printf '\n%s\n%s\n' "$MARK" "$LINE" >> "$CF"
fi

info "Prüfe und lade Caddy neu (ohne Unterbrechung)"
reload_or_restore
echo "Caddy hat die neue Seite übernommen. Sicherung der vorherigen Caddyfile: $backup"

info "Warte auf HTTPS für $DOMAIN (Zertifikat wird beim ersten Mal geholt)"
for _ in $(seq 1 "${TBH_HTTPS_WAIT:-30}"); do
  if curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "https://$DOMAIN ist erreichbar."
    exit 0
  fi
  sleep 2
done
echo "Noch nicht über HTTPS erreichbar. Häufigster Grund: DNS zeigt noch nicht auf diesen Server."
echo "Caddy versucht es selbstständig weiter; andere Seiten sind davon nicht betroffen."
echo "Prüfen mit: journalctl -u caddy -n 50 --no-pager | grep -i $DOMAIN"
