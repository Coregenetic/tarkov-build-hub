#!/usr/bin/env bash
# Datenbanksicherung (läuft als Nutzer tbh über tbh-backup.timer). Behält 14 Tage.
set -euo pipefail
DIR=/opt/tarkov-build-hub/backups
: "${DATABASE_URL:?DATABASE_URL fehlt}"
command -v pg_dump >/dev/null || { echo "pg_dump nicht gefunden – Sicherung nicht möglich" >&2; exit 1; }
file="$DIR/tbh-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$file.tmp"
mv "$file.tmp" "$file"
chmod 600 "$file"
find "$DIR" -name 'tbh-*.dump' -mtime +14 -delete
echo "Sicherung: $file ($(du -h "$file" | cut -f1))"
