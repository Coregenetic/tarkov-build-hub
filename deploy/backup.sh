#!/usr/bin/env bash
# Datenbanksicherung aus dem Container tbh-postgres (über tbh-backup.timer, täglich). Behält 14 Tage.
set -euo pipefail
DIR=/opt/tarkov-build-hub/backups
CONTAINER=tbh-postgres
umask 077
file="$DIR/tbh-$(date +%Y%m%d-%H%M%S).dump"
docker exec "$CONTAINER" pg_dump --format=custom --no-owner -U tbh -d tbh > "$file.tmp"
[[ -s $file.tmp ]] || { rm -f "$file.tmp"; echo "Sicherung leer – abgebrochen" >&2; exit 1; }
mv "$file.tmp" "$file"
find "$DIR" -name 'tbh-*.dump' -mtime +14 -delete
echo "Sicherung: $file ($(du -h "$file" | cut -f1))"
