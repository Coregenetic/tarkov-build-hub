# Betrieb auf dem Server

Ziel: Der Build Hub läuft **zusätzlich** zu allem, was schon auf dem Server läuft. Er hat eigene Dienste, einen eigenen Nutzer, eine eigene Node-Laufzeit und eine eigene Datenbank. Bestehende Dienste, Container, Ports und Firewall-Regeln werden nicht verändert. Am vorhandenen Caddy kommt nur eine eigene Datei hinzu (siehe Schritt 5) – mit Sicherung, Prüfung und Rückweg.

## Ausgangslage (Inventur 14.11.2026)

- Ubuntu 26.04, 2 Kerne, 3,7 GB RAM, 2 GB Swap, 26 GB frei
- Ein Caddy (`caddy.service`, `/etc/caddy/Caddyfile`) auf `*:80` und `*:443` – alle Adressen. Eine zweite Caddy-Instanz auf 443 ist deshalb nicht möglich; der Build Hub kommt als eigene Datei in diesen Caddy.
- Docker: `lootgame` (127.0.0.1:3000), `polier-behr-app` (127.0.0.1:3001)
- Kein PostgreSQL, keine System-Node, Port 3002 und 5432 frei
- Firewall (ufw): 22, 80, 443 offen – bleibt so

## Aufbau

```
/opt/tarkov-build-hub/
  releases/tbh-JJJJMMTT-<commit>/   je Release: web/, tools/, migrations/, deploy/, VERSION
  current -> releases/…             aktives Release
  runtime/node -> node-v22.…        eigene Node-Laufzeit
  shared/.env                       Umgebung (chmod 600, Nutzer tbh)
  backups/                          tägliche Datenbanksicherungen (14 Tage, nur root)
/etc/caddy/build-hub.caddy          eigene Caddy-Datei (über eine import-Zeile eingebunden)
Docker: Container tbh-postgres, Volume tbh-pgdata (PostgreSQL 16, nur 127.0.0.1:5432)
```

| Dienst | Aufgabe |
| --- | --- |
| `tbh-web.service` | Next.js, nur `127.0.0.1:3002`, Nutzer `tbh`, systemd-Härtung |
| `tbh-maintenance.timer` | täglich 04:17: abgelaufene Sitzungen, Aktivitätstage > 90 Tage löschen |
| `tbh-backup.timer` | täglich 03:41: `pg_dump` aus `tbh-postgres` nach `backups/` |

## Einrichtung

Release bauen (Entwicklungsrechner): `node scripts/release.mjs --build` → `release/tbh-<version>.tar.gz`.

```bash
# 1. Paket auf den Server und entpacken
cd /root && tar -xzf tbh-<version>.tar.gz && cd tbh-<version>

# 2. Ersteinrichtung: Nutzer, Ordner, Node 22 (von nodejs.org, Prüfsumme geprüft), .env, AUTH_SECRET
./deploy/install.sh --domain builds.lootgamebot.de

# 3. Datenbank-Container (trägt DATABASE_URL automatisch ein)
./deploy/db-install.sh

# 4. Ausrollen (Migrationen, Dienste, Gesundheitsprüfung)
./deploy/deploy.sh /root/tbh-<version>.tar.gz

# Spieldaten
tbh-admin import --mode pvp
tbh-admin activate <id> --patch <Patch-Bezeichnung>

# 5. Erst wenn der DNS-Eintrag auf den Server zeigt: im Caddy veröffentlichen
./deploy/caddy-site.sh --domain builds.lootgamebot.de
```

### Was caddy-site.sh genau tut

1. Prüft die bestehende Caddyfile mit `caddy validate`. Geht das nicht, bricht es ab, ohne etwas anzufassen.
2. Prüft über `caddy adapt`, ob die Domain schon von einer bestehenden Seite benutzt wird (auch in importierten Dateien).
3. Sichert die Caddyfile (`Caddyfile.vor-build-hub-<zeit>`).
4. Schreibt `/etc/caddy/build-hub.caddy` und hängt **eine** Zeile `import /etc/caddy/build-hub.caddy` (mit Kommentar) an.
5. `caddy validate` – bei Fehler: Sicherung zurück, Caddy wird nicht neu geladen.
6. `systemctl reload caddy` – ohne Unterbrechung. Läuft Caddy danach nicht, wird die Sicherung zurückgespielt.

Rückweg: `./deploy/caddy-site.sh --remove` – die Caddyfile ist danach Byte für Byte wie vorher.

## Aktualisieren

```bash
./deploy/deploy.sh /root/tbh-<neue-version>.tar.gz
```

Sicherung → Migrationen → Umstellen → Neustart → Gesundheitsprüfung. Startet das neue Release nicht, geht das Skript automatisch auf das vorige zurück und entfernt das fehlerhafte. Die letzten 5 Releases bleiben liegen.

## Zurückrollen

```bash
./deploy/rollback.sh                 # auf das vorige Release
./deploy/rollback.sh tbh-<version>   # auf ein bestimmtes
```

Startet das Ziel nicht, geht es automatisch zurück auf das laufende Release. Migrationen werden nicht zurückgedreht; sie sind so geschrieben, dass ältere Releases damit laufen. Daten zurückholen:

```bash
systemctl stop tbh-web
docker exec -i tbh-postgres pg_restore --clean --if-exists --no-owner -U tbh -d tbh < /opt/tarkov-build-hub/backups/tbh-<zeit>.dump
systemctl start tbh-web
```

## Fehlersuche

```bash
systemctl status tbh-web
journalctl -u tbh-web -n 100
curl -s http://127.0.0.1:3002/api/health      # {"ok":true}
cat /opt/tarkov-build-hub/current/VERSION
docker ps --filter name=tbh-postgres
```

- Login-Knopf „deaktiviert“: Twitch-Werte in `.env` sind noch Platzhalter (gewollt, bis die Twitch-Application eingerichtet ist).
- HTTPS geht nicht: DNS-Eintrag prüfen, dann `journalctl -u caddy -n 50 | grep builds.lootgamebot.de`.
- Admin-Bereich → System zeigt Datenbank, Spieldaten-Alter und Erreichbarkeit von tarkov.dev.

## Was getestet ist

- **Release-Paket:** in einem leeren Ordner entpackt und mit leerer Umgebung (`env -i`) gestartet. Geprüft:
  - Migrationen
  - echter Import von tarkov.dev (5.498 Items) und Freigabe
  - Preset-Prüfung (401/401)
  - Webserver, Inhaltsrichtlinie, Bedienung im Browser
- **install.sh:** echt ausgeführt. Geprüft:
  - Node-Download mit Prüfsumme; eine manipulierte Prüfsumme wird abgelehnt
  - Rechte der `.env` (600, Nutzer tbh)
  - AUTH_SECRET wird erzeugt, Domain eingetragen
  - zweiter Lauf ändert nichts
- **deploy.sh / rollback.sh:** echt ausgeführt, mit Test-Ersatz für systemd/docker, der den echten Server und ein echtes `pg_dump` startet. Geprüft:
  - erstes Ausrollen
  - kaputtes Release → automatisch zurück, fehlerhaftes Release entfernt
  - Sicherung vor der Migration (32 Tabellen)
  - Rollback auf ein nicht startendes Ziel → zurück auf das laufende Release
- **caddy-site.sh:** mit echtem `caddy validate`/`caddy adapt` (Caddy 2.6) und Test-Ersatz für systemctl. Geprüft:
  - Einrichten, erneut Einrichten, Domain wechseln
  - Entfernen (Byte für Byte wie vorher)
  - Domain schon vorhanden (auch in importierter Datei)
  - ungültige Domain
  - bestehende Caddyfile nicht prüfbar
  - Neuladen schlägt fehl → Wiederherstellung
- **Statische Prüfungen:** ShellCheck ohne Befund, `systemd-analyze verify` ohne Befund.
- **Nicht hier testbar:** `db-install.sh` (Docker-Images sind in der Testumgebung gesperrt) und der echte systemd/Caddy-Neustart auf dem Server. Das passiert Schritt für Schritt bei der Einrichtung.
