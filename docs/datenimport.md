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
