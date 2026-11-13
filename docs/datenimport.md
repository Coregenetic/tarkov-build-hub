# Spieldaten-Import

## Quelle

`https://json.tarkov.dev/{regular|pve}/items` plus Übersetzungen `items_de` und `items_en`.

- Community-Projekt von tarkov.dev, nicht offiziell von Battlestate Games.
- Die GraphQL-API (`api.tarkov.dev`) war bei der Prüfung am 13.11.2026 nicht verfügbar. Die JSON-Dateien enthalten alles Nötige: Slots, erlaubte Teile je Slot, Konflikte, Presets, Bild-Links und Preise.
- Die Quelle liefert **keine Patch-Nummer**. Der Patch wird beim Freigeben vom Admin vergeben.
- Abruf etwa 17 MB je Modus. Ein importierter Datensatz belegt rund 30 MB in der Datenbank (Rohdaten gzip-komprimiert etwa 2,7 MB).

## Ablauf

1. **Import** – `importer import --mode pvp`
   Ruft ab, prüft und speichert als **Vorschau**. Eine Vorschau ist für Nutzer unsichtbar.
   Abgelehnt wird der Import, wenn
   - weniger als 1000 Items oder 50 Waffen ankommen (Abruf kaputt),
   - mehr als 1 % der Kompatibilitäts-Verweise ins Leere zeigen,
   - die Daten identisch mit einem vorhandenen Datensatz sind (gleiche Prüfsumme).
2. **Prüfen** – `importer show <id>` zeigt Zählungen, Warnungen und Fehler.
3. **Freigeben** – `importer activate <id> --patch 0.16.9`
   Der bisher aktive Datensatz desselben Modus wird **archiviert**, nicht gelöscht. Veröffentlichte Builds verweisen weiter auf ihn.
4. **Verwerfen** – `importer discard <id>` löscht die Items einer Vorschau. Der Prüfbericht bleibt.
5. **Zurückrollen** – `importer rollback --mode pvp` macht den vorherigen Datensatz wieder aktiv.

Jede Aktion landet im `audit_log` mit Zeitpunkt und Ausführendem (`TBH_ACTOR`, sonst der Systembenutzer).
Das Protokoll ist nur anhängbar: Ein Datenbank-Trigger lehnt `UPDATE`, `DELETE` und `TRUNCATE` ab.

## Händler, Tausch und Flohmarkt

Zusätzlich zu `items` lädt der Import `traders`, `traders_de/_en`, `barters`, `tasks` und `tasks_de/_en`.
Fehlen Händler oder Händlerangebote, wird der Import abgelehnt – eine leere Beschaffung wäre irreführend.

| Tabelle | Inhalt |
| --- | --- |
| `trader` | Händler mit Stufen (Spielerlevel, Ruf, Umsatz) und Namen |
| `trader_offer` | Kaufangebote (`buyFromTrader`): Händler, Stufe, Preis, Währung, Aufgabe, Kauflimit |
| `barter` | Tauschangebote: Händler, Stufe, Aufgabe, benötigte Items |
| `task` | Aufgaben, die Angebote freischalten (Name, Händler, Wiki-Link) |
| `item.min_level_for_flea` | eigene Flohmarkt-Sperre des Items |
| `item_dataset.flea_min_player_level` | allgemeine Flohmarkt-Freischaltung (derzeit 15) |

`min_level_for_flea = 0` bedeutet: keine eigene Sperre, es gilt die allgemeine Freischaltung.
Items mit dem Typ `noFlea` sind nicht auf dem Flohmarkt handelbar.

Die Beschaffung (`@tbh/game-data/procurement`) wählt je Teil ein Angebot: freie Angebote vor solchen mit Aufgabe,
niedrigeres nötiges Spielerlevel zuerst, Kauf vor Tausch. Wird ein Händler ohnehin auf einer Stufe gebraucht,
nimmt sie dessen Angebot statt eines anderen Händlers. Fehlt jedes Angebot, steht dort „kein Angebot in den Daten“.

## Namensprüfung und eigene Namen

Jeder Import prüft die Item-Namen und schreibt Funde in den Prüfbericht (`importer name-issues <id>`):
- kyrillische Buchstaben in deutschen oder englischen Namen (z. B. `АК-74M` mit kyrillischem А und К),
- Kaliber im Waffennamen, das nicht zum Kaliber-Feld passt (derzeit nur AK-102: `5,45x45mm` statt 5.56x45).

Die Quelle wird nie verändert. Admins setzen stattdessen eigene Anzeigenamen (`item_name_override`),
die jeden Import überstehen: `importer name-set <item-id> --lang de --field short --value "AK-74M"`.
Entfernen mit `importer name-remove`. Beides wird mit vorher/nachher protokolliert.

## Regeln

- Ein importierter Datensatz wird nie verändert. Neue Daten bedeuten immer einen neuen Datensatz.
- Je Spielmodus ist höchstens ein Datensatz aktiv (von der Datenbank erzwungen).
- Kompatibilität kommt ausschließlich aus `slot_allowed_item`, `slot_filter` und `item_conflict`, nie aus Item-Namen.
- Rohdaten bleiben in `dataset_raw` erhalten, damit ein Import nachvollziehbar und wiederholbar ist.

## Gemessener Stand (13.11.2026)

| Wert | PvP |
| --- | --- |
| Items | 5.498 |
| Waffen | 172 |
| Presets | 500 |
| Slots | 3.673 |
| Kompatibilitäts-Verweise | 40.853 |
| Verweise ins Leere | 0 |
| Dauer Import | rund 6 s |
| Händler | 16 |
| Kaufangebote | 2.677 |
| Tauschangebote | 889 |
| Aufgaben | 503 |
| Auffällige Namen | 87 (de: 71 kyrillisch, 1 Kaliber; en: 15 kyrillisch) |
