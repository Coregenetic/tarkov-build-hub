# Betrieb auf dem Server

Ziel: Der Build Hub läuft **zusätzlich** zu allem, was schon auf dem Server läuft – mit eigenem Nutzer, eigener Node-Laufzeit, eigenen Diensten und eigener Caddy-Instanz. Bestehende Dienste, Caddy-Instanzen, Container, Ports und Firewall-Regeln werden nicht verändert. Jedes Skript bricht ab, bevor es etwas anlegt, wenn ein Port oder eine Adresse schon belegt ist.

## Aufbau

```
/opt/tarkov-build-hub/
  releases/tbh-JJJJMMTT-<commit>/   je Release: web/, tools/, migrations/, deploy/, VERSION
  current -> releases/…             aktives Release
  runtime/node -> node-v22.…        eigene Node-Laufzeit (unabhängig von einer System-Node)
  shared/.env                       Umgebung (chmod 600, Nutzer tbh)
  backups/                          tägliche Datenbanksicherungen (14 Tage)
  caddy/                            eigene Caddy-Instanz: bin/caddy, Caddyfile, caddy.env, data/, logs/
```

| Dienst | Aufgabe | Lauscht auf |
| --- | --- | --- |
| `tbh-web.service` | Next.js-Anwendung | nur `127.0.0.1:3002` |
| `tbh-maintenance.timer` | täglich 04:17: abgelaufene Sitzungen, Aktivitätstage > 90 Tage löschen | – |
| `tbh-backup.timer` | täglich 03:41: `pg_dump` nach `backups/` | – |
| `tbh-caddy.service` | eigene Caddy-Instanz, HTTPS für die Domain | nur `TBH_BIND:80/443`, Admin-Schnittstelle aus |

Alle Dienste laufen ohne Root (`tbh` bzw. `tbh-caddy`), mit systemd-Härtung (kein Zugriff auf `/home`, System nur lesend, eigenes `/tmp`).

## 0. Inventur (nur lesend)

```bash
sudo bash deploy/inventory.sh > inventur.txt
```

Zeigt Adressen, belegte Ports (besonders 80/443/2019/3002/5432), Caddy-Prozesse, Docker, PostgreSQL, Node, Firewall. Verändert nichts.

## 1. Release bauen (Entwicklungsrechner oder CI)

```bash
pnpm install
node scripts/release.mjs --build     # → release/tbh-<version>.tar.gz
```

Das Paket enthält den fertigen Server und gebündelte Werkzeuge (Migrationen, Verwaltungs-CLI). Auf dem Server werden weder pnpm noch Quellcode noch Build-Werkzeuge gebraucht.

## 2. Ersteinrichtung

```bash
# Node 22 von nodejs.org laden und Prüfsumme mit SHASUMS256.txt vergleichen
tar -xzf tbh-<version>.tar.gz && cd tbh-<version>
sudo ./deploy/install.sh --node /pfad/node-v22.x.y-linux-x64.tar.xz
sudo nano /opt/tarkov-build-hub/shared/.env
```

Datenbank: eigene Datenbank und eigener Datenbanknutzer `tbh` – entweder im vorhandenen PostgreSQL (nur `CREATE ROLE tbh …; CREATE DATABASE tbh OWNER tbh;`, nichts an anderen Datenbanken) oder eine eigene Instanz. Welche Variante passt, zeigt die Inventur.

## 3. Ausrollen und Aktualisieren

```bash
sudo ./deploy/deploy.sh /pfad/tbh-<version>.tar.gz
```

Ablauf: entpacken → Sicherung (ab dem zweiten Release, wenn `pg_dump` da ist) → Migrationen → `current` umstellen → `tbh-web` neu starten → Gesundheitsprüfung. Schlägt die Prüfung fehl, geht das Skript automatisch auf das vorige Release zurück. Die letzten 5 Releases bleiben liegen.

Erste Spieldaten und Admin-Rolle:

```bash
sudo tbh-admin import --mode pvp
sudo tbh-admin activate <id> --patch <Patch-Bezeichnung>
sudo tbh-admin role <twitch-login> admin     # nach der ersten Twitch-Anmeldung
```

## 4. Eigene Caddy-Instanz (nur nach Freigabe)

```bash
sudo ./deploy/caddy-install.sh --caddy /pfad/caddy_2.x.y_linux_amd64.tar.gz
```

Beim ersten Aufruf legt das Skript `caddy/caddy.env` an und stoppt. Dort Domain, Adresse (`TBH_BIND`) und E-Mail für Let's Encrypt eintragen, dann erneut starten. Das Skript

- prüft, dass `TBH_BIND` eine Adresse des Servers ist,
- bricht ab, wenn auf `TBH_BIND:80/443` schon etwas lauscht – auch wenn eine bestehende Instanz auf **allen** Adressen (`0.0.0.0`/`::`) lauscht,
- prüft die Konfiguration mit `caddy validate`, bevor der Dienst startet,
- nutzt eigenes Programm, eigenen Nutzer, eigene Zertifikatsablage und schaltet die Admin-Schnittstelle ab (kein Konflikt mit Port 2019 der bestehenden Instanzen).

**Wichtig:** Auf Port 443 kann pro Adresse nur ein Programm lauschen. Eine zusätzliche Caddy-Instanz braucht deshalb eine Adresse, die die bestehenden Instanzen nicht belegen – z. B. eine zusätzliche IPv4 beim Hoster – oder einen anderen Port. Welche Variante möglich ist, zeigt die Inventur.

## Zurückrollen

```bash
sudo ./deploy/rollback.sh                 # auf das vorige Release
sudo ./deploy/rollback.sh tbh-<version>   # auf ein bestimmtes
```

Migrationen werden nicht zurückgedreht; sie sind so geschrieben, dass ältere Releases damit weiterlaufen. Daten zurückholen:

```bash
sudo systemctl stop tbh-web
sudo -u tbh pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /opt/tarkov-build-hub/backups/tbh-<zeit>.dump
sudo systemctl start tbh-web
```

## Fehlersuche

```bash
systemctl status tbh-web tbh-caddy
journalctl -u tbh-web -n 100
curl -s http://127.0.0.1:3002/api/health      # {"ok":true}
cat /opt/tarkov-build-hub/current/VERSION
```

- `{"ok":false}` / 503: Datenbank nicht erreichbar → `DATABASE_URL` prüfen.
- Login-Knopf zeigt „deaktiviert“: Twitch-Werte in `.env` sind noch Platzhalter (gewollt, bis die Twitch-Application eingerichtet ist).
- Admin-Bereich → System zeigt Datenbank, Spieldaten-Alter und Erreichbarkeit von tarkov.dev.

## Was getestet ist

- Release-Paket: in einem leeren Ordner entpackt, mit fremder Node aus `env -i` gestartet – Migrationen, echter Import von tarkov.dev (5.498 Items), Freigabe, Preset-Prüfung (401/401), Webserver mit Gesundheitsprüfung, Seiten, Inhaltsrichtlinie, Bedienung im Browser.
- Skripte: `bash -n` und ShellCheck ohne Befund; die Port-Prüfung gegen echte Listener (feste Adresse, Wildcard, frei).
- Noch nicht getestet: systemd-Einheiten und Skripte auf dem echten Server (hier gibt es kein systemd). Das passiert bei der Einrichtung Schritt für Schritt mit Freigabe.
