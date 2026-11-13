# Tarkov Build Hub

Community-Plattform zum Erstellen, Teilen und Weiterentwickeln von Escape-from-Tarkov-Waffenbuilds mit interaktivem Gunsmith und Twitch-Login.

Fan-Projekt, nicht mit Battlestate Games verbunden. Spieldaten und Bilder stammen von [tarkov.dev](https://tarkov.dev) (Community-Projekt, keine offizielle Quelle).

## Stand

| Phase | Inhalt | Status |
| --- | --- | --- |
| 0 | Server-Inventur, Architektur, Design-Richtung | erledigt |
| 1 | Datenfundament: versionierte Spieldaten, Import mit Vorschau, Freigabe und Rückweg | **in Arbeit** |
| 2 | Kompatibilitäts-Engine | offen |
| 3 | Twitch-Login, Profile, Rollen | offen |
| 4–9 | Gunsmith, Veröffentlichen, Discovery, Community, Go-live | offen |

## Aufbau

```
apps/importer          CLI: Spieldaten abrufen, prüfen, freigeben, zurückrollen
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
pnpm check                      # Lint, Typprüfung, Tests, Build
```

Integrationstests gegen PostgreSQL laufen nur, wenn `TEST_DATABASE_URL` gesetzt ist:

```bash
export TEST_DATABASE_URL=$(scripts/test-db.sh start)
pnpm test
scripts/test-db.sh stop
```

## Spieldaten importieren

Siehe [docs/datenimport.md](docs/datenimport.md).

```bash
pnpm importer import --mode pvp           # legt eine Vorschau an
pnpm importer list
pnpm importer activate <id> --patch 0.16.9
pnpm importer rollback --mode pvp
```
