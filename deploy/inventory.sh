#!/usr/bin/env bash
# Server-Inventur – AUSSCHLIESSLICH LESEND. Verändert nichts, startet und stoppt nichts.
# Aufruf: sudo bash inventory.sh > inventur.txt   (sudo nur, damit ss/docker Prozessnamen zeigen)
set -uo pipefail

section() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section "System"
uname -srm
grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release 2>/dev/null
nproc; free -h | sed -n '1,3p'; df -h / /opt 2>/dev/null | sort -u
have systemctl && systemctl --version | head -1

section "Netzwerkadressen"
ip -brief address 2>/dev/null || hostname -I

section "Lauschende Ports (TCP)"
ss -Hltnp 2>/dev/null | awk '{print $4, $6}' | sort -u

section "Ports 80/443/2019/3002 im Detail"
for p in 80 443 2019 3002 5432; do
  printf -- '-- :%s\n' "$p"
  ss -Hltnp "sport = :$p" 2>/dev/null | awk '{print "   ", $4, $6}'
done

section "Caddy-Prozesse und -Dienste"
pgrep -a -i caddy 2>/dev/null || echo "(keine Caddy-Prozesse)"
have systemctl && systemctl list-units --all --no-pager --plain 'caddy*' 2>/dev/null | head -20
for b in $(command -v -a caddy 2>/dev/null | sort -u); do echo "$b: $("$b" version 2>/dev/null)"; done

section "Docker"
if have docker; then
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null || echo "(kein Zugriff)"
else
  echo "(docker nicht installiert)"
fi

section "PostgreSQL"
have psql && psql --version
have pg_dump && pg_dump --version
have systemctl && systemctl list-units --all --no-pager --plain 'postgresql*' 2>/dev/null | head -10
docker ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null | grep -i postgres || true

section "Node.js"
for b in $(command -v -a node 2>/dev/null | sort -u); do echo "$b: $("$b" -v)"; done

section "Firewall (nur Anzeige)"
have ufw && ufw status 2>/dev/null | head -20
have nft && nft list ruleset 2>/dev/null | grep -E 'dport|policy' | head -20

section "Vorhandener Build Hub"
ls -la /opt/tarkov-build-hub 2>/dev/null || echo "(noch nicht vorhanden)"
id tbh 2>/dev/null || echo "(Nutzer tbh nicht vorhanden)"
have systemctl && systemctl list-units --all --no-pager --plain 'tbh-*' 2>/dev/null | head

echo; echo "Inventur fertig – es wurde nichts verändert."
