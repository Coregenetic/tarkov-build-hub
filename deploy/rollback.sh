#!/usr/bin/env bash
# Zurück auf das vorherige (oder ein bestimmtes) Release:  sudo ./rollback.sh [tbh-<version>]
# Migrationen werden nicht zurückgedreht – sie sind so geschrieben, dass ältere Releases damit laufen.
# Für einen Rückweg der Daten: Sicherung aus /opt/tarkov-build-hub/backups einspielen (siehe docs/betrieb.md).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$HERE/lib.sh"
need_root

[[ -L $BASE/current ]] || die "Noch kein Release ausgerollt."
current=$(readlink -f "$BASE/current")
if [[ -n ${1:-} ]]; then
  target="$BASE/releases/$1"
else
  target=""
  # Neuestes Release, das nicht das aktuelle ist.
  # shellcheck disable=SC2012,SC2045
  for r in $(ls -1dt "$BASE"/releases/tbh-*); do
    if [[ $r != "$current" ]]; then target=$r; break; fi
  done
fi
[[ -n $target && -d $target ]] || die "Kein Release zum Zurückgehen gefunden."
info "Von $(basename "$current") auf $(basename "$target")"
ln -sfn "$target" "$BASE/current"
systemctl restart tbh-web.service
if health; then
  echo "$(basename "$target") läuft."
else
  echo "$(basename "$target") startet nicht – zurück auf $(basename "$current")." >&2
  ln -sfn "$current" "$BASE/current"
  systemctl restart tbh-web.service
  health && echo "$(basename "$current") läuft wieder." >&2
  die "Zurückrollen fehlgeschlagen – bitte journalctl -u tbh-web ansehen."
fi
