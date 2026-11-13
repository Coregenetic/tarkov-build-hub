# Tarkov Build Hub

Community-Plattform zum Erstellen, Teilen und Weiterentwickeln von Escape-from-Tarkov-Waffenbuilds mit interaktivem Gunsmith und Twitch-Login.

Fan-Projekt, nicht mit Battlestate Games verbunden. Spieldaten und Bilder stammen von [tarkov.dev](https://tarkov.dev) (Community-Projekt, keine offizielle Quelle).

## Stand

| Phase | Inhalt | Status |
| --- | --- | --- |
| 0 | Server-Inventur, Architektur, Design-Richtung | erledigt |
| 1 | Datenfundament: versionierte Spieldaten, Import mit Vorschau, Freigabe und Rückweg | erledigt (Server-Betrieb folgt mit Deployment) |
| 2 | Kompatibilitäts-Engine, geprüft an allen 401 Waffen-Presets | erledigt |
| 3 | Next.js-App, Twitch-Login, Profile, Rollen | erledigt |
| 4 | Gunsmith-Entwurf (Variante B „Werkbank“) | erledigt |
| 5 | Gunsmith: Aufbauansicht, Teile tauschen, Munition, Beschaffung (Händler/Flohmarkt), Sprache für Item-Namen, Handy-Ansicht, Entwurf im Browser; Import um Händler, Tausch, Aufgaben, Kategorien und Namensprüfung erweitert | erledigt |
| 6 | Veröffentlichen mit Server-Prüfung, unveränderliche Versionen je Patch, Varianten mit Herkunft, Entwürfe im Konto, Build-Seite, Profil | erledigt |
| 7 | Startseite mit Feed, Suche und Filter (Text in beiden Sprachen, Waffe, Kaliber, Zweck, Budget, Patch, Ersteller, Teil), Sortierung, Sitemap | erledigt |
| 8–9 | Community (Merken, Kommentare, Meldungen) und Admin-Bereich, Go-live | offen |

## Aufbau

```
apps/web               Next.js-Anwendung (Seiten, Login, Profile)
apps/importer          Verwaltungs-CLI: Spieldaten, Presets prüfen, Rollen und Sperren
packages/auth          Twitch-Login (OIDC) und Sitzungen
packages/compat-engine Kompatibilitätsprüfung ohne Abhängigkeiten (Browser + Server)
packages/game-data     Lädt einen Datensatz als Eingabe für die Engine
packages/data-adapters Adapter für json.tarkov.dev + Normalisierung + Prüfbericht
packages/db            PostgreSQL-Schema (Drizzle) und Migrationen
scripts/test-db.sh     Wegwerf-PostgreSQL für lokale Tests
docs/                  Architektur und Betriebsanleitungen
```

## Entwicklung

Voraussetzungen: Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example .env            # DATABASE_URL eintragen
pnpm db:migrate
pnpm check                      # Lint, Typprüfung, Build, Tests
pnpm --filter @tbh/web dev      # App lokal auf http://localhost:3000
```

Integrationstests gegen PostgreSQL laufen nur, wenn `TEST_DATABASE_URL` gesetzt ist:

```bash
scripts/test-db.sh start
export TEST_DATABASE_URL=$(scripts/test-db.sh test-url)
pnpm test
scripts/test-db.sh stop
```

## Spieldaten importieren

Siehe [docs/datenimport.md](docs/datenimport.md), [docs/kompatibilitaet.md](docs/kompatibilitaet.md) und [docs/anmeldung.md](docs/anmeldung.md).

```bash
pnpm importer import --mode pvp           # legt eine Vorschau an
pnpm importer list
pnpm importer activate <id> --patch 0.16.9
pnpm importer rollback --mode pvp
pnpm importer verify-presets <id>         # Engine gegen alle Waffen-Presets prüfen
```
