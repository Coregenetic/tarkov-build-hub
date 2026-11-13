# Admin-Bereich und Community

Der Admin-Bereich liegt unter `/admin`. Wer nicht zum Team gehört, bekommt dort „nicht gefunden“ – auch die API (`POST /api/admin/action`) verrät nichts.

## Rollen

| Rolle | Darf |
| --- | --- |
| Nutzer | Builds veröffentlichen, Gefällt mir, Merken, Kommentieren, Melden |
| Moderator | Meldungen bearbeiten, Builds und Kommentare ausblenden/wiederherstellen, Nutzer 24 h oder 7 Tage sperren |
| Admin | zusätzlich: Statistiken, Item-Namen, Datenimport, Protokoll, System, dauerhafte Sperren, Rollen, Sitzungen beenden, Spam-Konten bereinigen, Builds endgültig löschen |

Admin wird man nur über die Server-Konsole (`pnpm importer role <login> admin`). Admins lassen sich im Admin-Bereich weder sperren noch herabstufen.

Jede Aktion prüft die Rolle **in der Datenbank** (nicht nur in der Sitzung) und schreibt mit vorher/nachher und Grund ins Protokoll. Das Protokoll ist per Datenbank-Trigger unveränderlich.

## Frische Anmeldung

Rollenwechsel, endgültiges Löschen, das Bereinigen eines Spam-Kontos, Datensatz-Freigabe und Zurückrollen verlangen eine Anmeldung, die höchstens 10 Minuten alt ist. Ist sie älter, leitet die Seite zu Twitch mit `force_verify=true` – Twitch fragt dann erneut nach, auch wenn man dort angemeldet ist – und kehrt danach zurück.

## Bereiche

- **Übersicht** – offene Meldungen, aktive Nutzer, neue Builds, Zustand der Spieldaten, letzte Änderungen.
- **Statistiken** – 7/30/90 Tage: neue Builds, Varianten, Kommentare, Gefällt mir, Anmeldungen, Meldungen, aktive Nutzer je Tag, beliebteste Waffen, Suchen ohne Treffer. Keine IP-Adressen, keine Seitenaufrufe je Person; „war an diesem Tag aktiv“ wird nach 90 Tagen gelöscht (`purgeOldActivity`).
- **Item-Namen** – eigene Anzeigenamen (z. B. Waffennamen) für Deutsch und Englisch. Die Quelle bleibt gespeichert; eigene Namen gelten auch nach neuen Importen. Auffällige Namen aus dem Prüfbericht (kyrillische Buchstaben, falsches Kaliber) lassen sich einzeln oder mit „Alle Vorschläge übernehmen“ korrigieren – jede Änderung einzeln im Protokoll, jederzeit zurücksetzbar. Hat sich der Name der Quelle seit der Änderung geändert, weist die Liste darauf hin.
- **Datenimport** – neuen Datensatz von tarkov.dev abrufen (Vorschau mit Prüfbericht), mit Patch-Bezeichnung freigeben, verwerfen, zurückrollen. Bei Fehlern im Prüfbericht ist die Freigabe gesperrt.
- **Builds** – suchen, nach „gemeldet“ oder „ausgeblendet“ filtern, ausblenden (Grund sieht der Ersteller), wiederherstellen, endgültig löschen.
- **Meldungen** – je Inhalt gebündelt: ablehnen, ausblenden, ausblenden und Ersteller 7 Tage sperren.
- **Nutzer** – suchen, sperren/entsperren, Rolle Nutzer ↔ Moderator, alle Sitzungen beenden, Spam-Konto bereinigen (alles ausblenden + dauerhaft sperren), Verlauf je Nutzer.
- **Protokoll** – nach Bereich filtern, blättern, CSV-Export (höchstens 5000 Einträge; Zellen gegen Formel-Einschleusung entschärft).
- **System** – Datenbank, Spieldaten-Alter, Erreichbarkeit von tarkov.dev, Twitch-Login; Hinweisbanner und Wartungsmodus (Besucher sehen eine Wartungsseite, die API nimmt keine Änderungen an; das Team arbeitet weiter).

## Community-Grenzen

- Kommentare: 1–1000 Zeichen, höchstens 10 je 10 Minuten, keine Doppelungen, eigene 15 Minuten lang bearbeitbar, eigene löschbar.
- Meldungen: höchstens 20 am Tag, je Inhalt nur eine offene Meldung pro Person.
- Eigene Builds kann man nicht mit „Gefällt mir“ markieren.
- Gesperrte Nutzer verschwinden mit ihren Builds aus Suche und Feed.

## Tests

`apps/web/test/gunsmith.e2e.test.ts` spielt den Ablauf im Browser gegen die gebaute App durch: Gefällt mir, Kommentar, Meldung; kein Zugang für Gäste und Nutzer; Meldung bearbeiten, Build ausblenden und wiederherstellen; Waffennamen ändern und zurücksetzen; Rollenwechsel mit erzwungener erneuter Anmeldung; Banner, Protokoll und CSV. Die Regeln selbst prüft `packages/builds/test/community.test.ts`.
