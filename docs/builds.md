# Builds: Entwurf, Veröffentlichen, Versionen, Varianten

## Ablauf
1. **Entwurf** – angemeldet speichert der Gunsmith automatisch im Konto (`build_draft`), sonst im Browser.
   Ein Browser-Entwurf wird nach der Anmeldung ins Konto übernommen. Höchstens 50 Entwürfe je Nutzer.
2. **Veröffentlichen** – `POST /api/drafts/:id/publish`. Der Server prüft verbindlich mit der Engine gegen den
   aktiven Datensatz: gültig, vollständig (Pflicht-Slots), Waffe, Munition passt zu Waffe ∩ Magazin. Titel 4–80 Zeichen,
   Notizen bis 2000, Einsatzzweck Pflicht. Höchstens 10 Veröffentlichungen pro Stunde je Nutzer.
3. **Version** – jede Veröffentlichung ist eine `build_version` mit fester Datensatz-ID, Patch, vollständigem Teilebaum,
   Werten und Beschaffung. Ein Datenbank-Trigger verbietet `UPDATE`. Bearbeiten ergibt die nächste Version.
4. **Variante** – `POST /api/builds/:id/fork` legt einen Entwurf an, der auf die konkrete Version zeigt
   (`forked_from_version_id`) und die Herkunft zusätzlich als Text speichert. Wird das Original gelöscht, bleibt der Text.

## Sicht und Rechte
- Ansehen ohne Anmeldung. „Nur über Link“ erscheint nicht im Profil Fremder (und später nicht im Feed).
- Bearbeiten, Sichtbarkeit, Löschen nur durch den Ersteller; gelöschte Builds sind für alle „nicht gefunden“.
- Alle schreibenden API-Routen verlangen Sitzung und `Origin` der eigenen Seite (sonst 401/403).

## Ältere Patches
Die Build-Seite zeigt immer die Werte der Version. Beruht sie auf einem älteren Datensatz, prüft die Seite zusätzlich
gegen den aktiven und zeigt „auch mit den aktuellen Spieldaten gültig“ bzw. die betroffenen Teile.
