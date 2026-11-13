# Kompatibilitäts-Engine

`packages/compat-engine` prüft einen Build gegen einen Datensatz. Das Paket hat keine Abhängigkeiten und läuft unverändert im Browser (Live-Feedback im Gunsmith) und auf dem Server (verbindliche Prüfung beim Speichern und Veröffentlichen).

## Build-Format

Ein Build ist ein Baum. Jeder Knoten ist ein verbautes Item, seine Kinder stecken in Slots, deren Schlüssel die Slot-IDs aus der Quelle sind.

```json
{ "itemId": "5447a9cd4bdc2dbd208b4567", "slots": {
    "<slot-id mod_reciever>": { "itemId": "55d355e64bdc2d962f8b4569", "slots": { … } } } }
```

## Regeln

| Code | Schwere | Bedeutung |
| --- | --- | --- |
| `not_allowed` | Fehler | Item steht nicht in der Erlaubt-Liste (oder erlaubten Kategorie) dieses Slots |
| `excluded` | Fehler | Item oder seine Kategorie ist im Slot ausdrücklich ausgeschlossen |
| `conflict_item` | Fehler | Zwei verbaute Items schließen sich aus – geprüft in **beide** Richtungen, weil die Quelle 11.241 von 14.160 Konflikten nur einseitig einträgt |
| `conflict_category` | Fehler | Ein Item schließt die Kategorie eines anderen verbauten Items aus |
| `blocked_slot` | Fehler | Ein verbautes Item sperrt einen Slot, der trotzdem belegt ist |
| `unknown_slot` | Fehler | Der Slot existiert am Eltern-Item nicht |
| `unknown_item` | Fehler | Das Item gibt es im Datensatz nicht (z. B. nach einem Patch entfernt) |
| `parent_unknown` | Fehler | Unterteil eines unbekannten Items, nicht prüfbar |
| `missing_required` | unvollständig | Pflicht-Slot leer – die Waffe wäre nicht funktionsfähig |

`valid` heißt: keine Fehler. `complete` heißt: alle Pflicht-Slots belegt. Beides wird getrennt gemeldet.

## Bearbeiten

- `installPart` setzt ein Teil ein oder tauscht es. Unterteile wandern in den gleichen Slot des neuen Teils (gleiche ID, sonst gleicher Slot-Typ wie `mod_muzzle`). Passen sie dort nicht, markiert `validateBuild` sie – sie werden nie still entfernt. Unterteile ohne passenden Slot-Typ kommen in `detached` zurück.
- `removePart` nimmt ein Teil samt allem darunter ab und meldet es.
- `checkCandidates` bewertet Teile für die Auswahl im Gunsmith (passt / passt nicht mit Grund).
- `assembleFromParts` baut aus einer flachen Teileliste (z. B. einem Preset) einen Baum.
- `sumModifiers` summiert Ergonomie, Rückstoß-Modifikatoren, Gewicht und Preis der Teile. Das sind Summen laut Quelle, **keine** Endwerte der Waffe; die Spielformel ist bewusst nicht nachgebaut.

## Nachweis gegen echte Daten

`importer verify-presets <datensatz>` setzt jedes Waffen-Preset des Spiels aus seiner Teileliste zusammen und prüft es. Presets sind vom Spiel gebaute Waffen und müssen gültig sein.

Stand 13.11.2026 (PvP): **401 von 401 Waffen-Presets gültig, vollständig und ohne übrige Teile.** 609 Patronen in Magazinen sind nicht mitgezählt (sie stecken im Patronenfach, nicht in einem Anbau-Slot), 99 Presets von Westen und Helmen gehören nicht zum Gunsmith.

Nach jedem neuen Import sollte dieser Befehl laufen, bevor der Datensatz freigegeben wird.
