# Anmeldung über Twitch

Es gibt keine eigenen Benutzerkonten und keine Passwörter. Wer etwas veröffentlichen, merken oder kommentieren will, meldet sich mit Twitch an. Ansehen und Suchen gehen ohne Anmeldung.

## Ablauf

1. `/auth/twitch/login` – erzeugt zufälligen `state` und `nonce`, legt sie in einem signierten, httpOnly-Cookie (10 Minuten) ab und leitet zu Twitch. Angefragt wird nur der Scope `openid`: Der Build Hub erhält keine Rechte am Twitch-Konto.
2. Twitch leitet zurück zu `/auth/twitch/callback`. Geprüft wird:
   - `state` aus der Adresse = `state` aus dem signierten Cookie (Schutz vor Login-CSRF), Alter ≤ 10 Minuten
   - Code-Tausch mit Client-Secret (nur serverseitig)
   - ID-Token: RS256-Signatur gegen die öffentlichen Schlüssel von Twitch, Aussteller, Empfänger (eigene Client-ID), Ablauf, `nonce`
   - Twitch-Profil (Login-Name, Anzeigename, Avatar) über die Twitch-API; die ID muss zum signierten Token passen
3. Nutzer wird angelegt oder aktualisiert (Umbenennungen bei Twitch werden übernommen, Identität bleibt die Twitch-ID).
4. Sitzung: 256-Bit-Zufallstoken im Cookie (httpOnly, SameSite=Lax, bei HTTPS `__Host-`-Präfix und Secure). In der Datenbank liegt nur der SHA-256-Hash.
5. Rücksprung nur auf eigene Seiten (`safeReturnTo`).

Abmelden geht nur per POST aus einem Formular der Seite.

## Sitzungen

- Gültig 30 Tage (`SESSION_TTL_DAYS`), verlängern sich bei Nutzung höchstens einmal pro Stunde.
- Abgelaufene Sitzungen werden beim Zugriff gelöscht.
- Gesperrte Nutzer: alle Sitzungen enden sofort, neue Anmeldungen werden abgelehnt, das öffentliche Profil verschwindet.
- Rate-Limit: 20 Login-Versuche pro Minute und IP.

## Rollen verwalten

Der Nutzer muss sich vorher einmal angemeldet haben. Jede Aktion landet im `audit_log`.

```bash
pnpm importer role  <login|twitch-id> admin        # user | moderator | admin
pnpm importer ban   <login|twitch-id> --reason "Spam"
pnpm importer unban <login|twitch-id>
```

## Twitch-Application einrichten

1. <https://dev.twitch.tv/console/apps> → „Anwendung registrieren“
2. Name z. B. „Build Hub“, Kategorie „Website Integration“, Client-Typ „Vertraulich“
3. OAuth-Redirect-URL: `<PUBLIC_BASE_URL>/auth/twitch/callback` (lokal `http://localhost:3000/auth/twitch/callback`; später zusätzlich die echte Domain)
4. Client-ID und ein neues Client-Secret in die `.env` auf dem Server eintragen – nie ins Repo und nie in Chats.

Eine eigene Application für den Build Hub, getrennt vom Loot-Game-Bot, damit ein Leck in einem Projekt das andere nicht betrifft.

## Tests

- `packages/auth/test`: Ablauf mit nachgebautem Twitch und echten RSA-Signaturen; Angriffsfälle (fremder State, manipuliertes Cookie, falsche Signatur, falscher Empfänger, falscher Aussteller, falsche Nonce, abgelaufenes Token, fremdes Profil, Open-Redirect).
- `apps/web/test/login.e2e.test.ts`: kompletter Login im echten Chrome gegen die gebaute App.
- Die Variable `TWITCH_TEST_ENDPOINT_BASE` leitet die Twitch-Adressen für diese Tests um und wird nur für `localhost`/`127.0.0.1` akzeptiert.
