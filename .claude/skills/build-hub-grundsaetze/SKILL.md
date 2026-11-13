---
name: build-hub-grundsaetze
description: Verbindliche Grundsätze des Tarkov Build Hub – Patch-Versionierung, echte Kompatibilität, Varianten, Twitch-Login und Datenquelle. Bei jeder Arbeit an Datenmodell, Gunsmith, Veröffentlichen, Auth oder Import zuerst lesen.
---

# Grundsätze des Tarkov Build Hub

Diese Regeln gelten von Anfang an und gehen den allgemeinen Skills vor.

## 1. Patch-Versionierung
- Jeder Build zeigt dauerhaft, für welchen Patch und welchen Datensatz er erstellt wurde.
- Veröffentlichen erzeugt einen unveränderlichen Snapshot (`build_version`) mit fester `item_dataset`-ID und vollständig aufgelöstem Teile-Baum.
- Neue Importe verändern alte Snapshots nie. Sie liefern nur einen Hinweis „unter aktuellem Patch gültig / ungültig“ mit Liste der betroffenen Teile.
- Datensätze werden archiviert, nie gelöscht, solange ein Build darauf verweist.

## 2. Echte Kompatibilität
- Ein Teil passt nur, wenn es in der Erlaubt-Liste genau des Slots am genau diesem Eltern-Teil steht (`slot_allowed_item`, `slot_filter`) und keinen Konflikt (`item_conflict`) mit einem verbauten Teil hat.
- Beispiel aus echten Daten: SureFire SF3P nimmt SOCOM556-MINI MONSTER auf; Daniel Defense WAVE nur den DD WAVE QD. Wird die Mündung getauscht, wird der ganze Unterbaum neu geprüft.
- Nie aus Namen, Kalibern oder Ähnlichkeit raten. Fehlende Daten heißen „unbekannt“.
- Dieselbe Prüflogik läuft im Browser (Live-Feedback) und auf dem Server (verbindlich).

## 3. Varianten (Community-Qualität)
- Jeder Build kann als eigene Variante kopiert, verändert und veröffentlicht werden.
- Die Variante speichert `forked_from_version_id` auf die konkrete Version des Originals; die Herkunft ist auf beiden Seiten sichtbar.
- Wird das Original gelöscht, bleibt die Herkunftsangabe als Text erhalten.

## Konten
- Keine eigenen Benutzerkonten oder Passwörter. Anmeldung nur über Twitch (OAuth/OIDC, Authorization Code Flow, Scope `openid`).
- Identität ist die Twitch-User-ID. Rollen (Nutzer, Moderator, Admin) liegen in der eigenen Datenbank.
- Eigene Twitch-Application für den Build Hub, getrennt von den Secrets des Loot-Game-Bots.
- Ansehen und Suchen funktionieren ohne Anmeldung.

## Datenquelle
- `json.tarkov.dev` (PvP = `regular`, PvE = `pve`), Übersetzungen `items_de`, `items_en`. GraphQL war am 13.11.2026 nicht verfügbar.
- Bilder von `assets.tarkov.dev` sind Spielgrafiken von Battlestate Games, bereitgestellt von tarkov.dev. Vor dem Go-live Nutzungsbedingungen prüfen und Quelle sichtbar nennen.
- Es gibt Bilder nur für einzelne Teile und Presets, nicht für frei zusammengestellte Builds. Der Gunsmith zeigt deshalb eine Aufbauansicht aus Einzelteil-Bildern; ein echtes Gesamtbild nur bei Preset-Gleichheit oder per hochgeladenem Screenshot.

## Produktivserver
- Bestehende Dienste, Caddy-Konfiguration, Ports, Container und Firewall werden nicht angefasst.
- Der Build Hub läuft isoliert unter `/opt/tarkov-build-hub`, nur auf `127.0.0.1:3002`, eigene Datenbank ohne veröffentlichten Port.
- Die Caddy-Einbindung erfolgt erst im Go-live-Schritt, mit ausdrücklicher Freigabe und Rückweg.
