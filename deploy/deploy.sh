#!/usr/bin/env bash
# Rollt ein Release aus:  sudo ./deploy.sh /pfad/tbh-<version>.tar.gz
#  1. entpacken nach releases/<version>
#  2. Datenbank sichern (falls pg_dump vorhanden) und migrieren
#  3. Verweis "current" umstellen, tbh-web neu starten
#  4. Gesundheitsprüfung – schlägt sie fehl, automatisch zurück auf das vorige Release
# Startet oder lädt ausschließlich tbh-*-Dienste neu.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$HERE/lib.sh"
need_root

TARBALL=${1:-}
[[ -f $TARBALL ]] || die "Nutzung: sudo ./deploy.sh <tbh-version.tar.gz>"
[[ -x $NODE_BIN ]] || die "Erst ./install.sh ausführen."
grep -q '^AUTH_SECRET=CHANGE_ME' "$BASE/shared/.env" && die "$BASE/shared/.env ist noch nicht ausgefüllt."

name=$(basename "$TARBALL" .tar.gz)
[[ $name =~ ^tbh-[0-9]{8}-[0-9a-f]{8}(-dirty)?$ ]] || die "Unerwarteter Dateiname: $name"
target="$BASE/releases/$name"
previous=$(readlink -f "$BASE/current" 2>/dev/null || true)

if [[ -d $target ]]; then
  info "Release $name ist schon entpackt"
else
  info "Entpacke $name"
  tmp=$(mktemp -d "$BASE/releases/.tmp-XXXXXX")
  tar -xzf "$TARBALL" -C "$tmp"
  [[ -f $tmp/$name/web/apps/web/server.js && -f $tmp/$name/tools/migrate.mjs ]] || { rm -rf "$tmp"; die "Paket unvollständig."; }
  mv "$tmp/$name" "$target"
  rmdir "$tmp"
  chown -R tbh:tbh "$target"
fi

install_units "$target"
if [[ -n $previous ]] && command -v pg_dump >/dev/null; then
  info "Sicherung vor der Migration"
  systemctl start tbh-backup.service || die "Sicherung fehlgeschlagen – nichts umgestellt (journalctl -u tbh-backup)."
elif [[ -n $previous ]]; then
  echo "   Hinweis: pg_dump nicht gefunden, keine Sicherung vor der Migration."
fi
run_migrations "$target"

ln -sfn "$target" "$BASE/current"
systemctl enable --quiet tbh-web.service tbh-maintenance.timer
command -v pg_dump >/dev/null && systemctl enable --quiet --now tbh-backup.timer
systemctl start tbh-maintenance.timer
info "Starte tbh-web neu"
systemctl restart tbh-web.service

if health; then
  echo "$name läuft (http://127.0.0.1:3002, Gesundheitsprüfung ok)."
  # Alte Releases aufräumen, die letzten 5 behalten.
  # Release-Namen sind geprüft (tbh-JJJJMMTT-hash), ls ist hier sicher.
  # shellcheck disable=SC2012
  ls -1dt "$BASE"/releases/tbh-* | tail -n +6 | xargs -r rm -rf
else
  echo "Gesundheitsprüfung fehlgeschlagen." >&2
  journalctl -u tbh-web.service -n 30 --no-pager >&2 || true
  if [[ -n $previous && -d $previous ]]; then
    echo "Zurück auf $(basename "$previous")" >&2
    ln -sfn "$previous" "$BASE/current"
    systemctl restart tbh-web.service
    health && echo "Vorheriges Release läuft wieder." >&2
  fi
  exit 1
fi
