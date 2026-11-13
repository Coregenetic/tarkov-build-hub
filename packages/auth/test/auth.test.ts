import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appUser, auditLog, connect, userSession, type DbHandle } from "@tbh/db";
import { resetTestDatabase } from "@tbh/db/testing";
import {
  AuthError,
  authConfigFromEnv,
  banUser,
  createRateLimiter,
  createSessionForIdentity,
  deleteExpiredSessions,
  deleteSession,
  getPublicProfile,
  getSessionUser,
  safeReturnTo,
  setRole,
  startLogin,
  verifyCallback,
} from "../src/index.ts";
import { createFakeTwitch, type FakeTwitch } from "./fake-twitch.ts";

describe("safeReturnTo", () => {
  it.each([
    ["/builds/abc?x=1#k", "/builds/abc?x=1#k"],
    ["/", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["https://evil.com", "/"],
    ["javascript:alert(1)", "/"],
    ["/ok\nSet-Cookie: x", "/"],
    [null, "/"],
    ["/" + "a".repeat(600), "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});

describe("Login-Konfiguration", () => {
  const env = { TWITCH_CLIENT_ID: "abc", TWITCH_CLIENT_SECRET: "def", PUBLIC_BASE_URL: "https://builds.example.de", AUTH_SECRET: "x".repeat(40) };
  it("akzeptiert eine vollständige Konfiguration mit sicheren Cookies bei https", () => {
    const c = authConfigFromEnv(env);
    expect(c.secureCookies).toBe(true);
    expect(c.redirectUri).toBe("https://builds.example.de/auth/twitch/callback");
  });
  it("behandelt Platzhalter aus der Vorlage als nicht eingerichtet", () => {
    expect(() => authConfigFromEnv({ ...env, TWITCH_CLIENT_ID: "CHANGE_ME" })).toThrow(/Platzhalter/);
    expect(() => authConfigFromEnv({ ...env, AUTH_SECRET: "CHANGE_ME_TO_A_LONG_RANDOM_VALUE_xxxxxxxx" })).toThrow(/Platzhalter/);
  });
});

describe("Rate-Limit", () => {
  it("blockiert nach dem Maximum und gibt im nächsten Fenster wieder frei", () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 2 });
    expect([rl.hit("ip", 0), rl.hit("ip", 1), rl.hit("ip", 2)]).toEqual([true, true, false]);
    expect(rl.hit("andere-ip", 3)).toBe(true);
    expect(rl.hit("ip", 1001)).toBe(true);
  });
});

describe("Twitch-Login (ohne Datenbank)", () => {
  let fake: FakeTwitch;
  beforeEach(async () => {
    fake = await createFakeTwitch();
  });

  async function roundTrip(mutate?: (p: { code: string | null; state: string | null; error: string | null }, cookie: string) => string | void) {
    const start = startLogin(fake.config, "/builds/b-1");
    const { code, state } = fake.authorize(start.redirectUrl);
    const params = { code, state, error: null as string | null };
    const cookie = mutate?.(params, start.cookieValue) ?? start.cookieValue;
    return verifyCallback(fake.config, params, cookie, { jwks: fake.jwks });
  }

  it("fragt bei Twitch nur den Scope openid an", () => {
    const url = new URL(startLogin(fake.config, "/").redirectUrl);
    expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(url.searchParams.get("scope")).toBe("openid");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/twitch/callback");
    expect(url.searchParams.get("state")).toHaveLength(32);
    expect(url.searchParams.get("nonce")).toHaveLength(32);
  });

  it("bestätigt einen echten Ablauf und liefert Identität und Rücksprungziel", async () => {
    const { identity, returnTo } = await roundTrip();
    expect(identity).toEqual({ twitchId: "123456789", login: "gunsmith_tester", displayName: "Gunsmith_Tester", avatarUrl: "https://static-cdn.jtvnw.net/test.png" });
    expect(returnTo).toBe("/builds/b-1");
  });

  const rejects = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({ code });
  };

  it("lehnt einen fremden State ab (Login-CSRF)", async () => {
    await rejects(roundTrip((p) => void (p.state = "angreifer-state")), "invalid_state");
  });

  it("lehnt ein fehlendes oder manipuliertes Login-Cookie ab", async () => {
    await rejects(roundTrip(() => ""), "invalid_state");
    await rejects(roundTrip((_p, c) => c.slice(0, -2) + "xx"), "invalid_state");
  });

  it("lehnt einen zu alten Login-Versuch ab", async () => {
    const start = startLogin(fake.config, "/", Date.now() - 11 * 60 * 1000);
    const { code, state } = fake.authorize(start.redirectUrl);
    await rejects(verifyCallback(fake.config, { code, state, error: null }, start.cookieValue, { jwks: fake.jwks }), "expired_state");
  });

  it("meldet Abbruch bei Twitch verständlich", async () => {
    await rejects(roundTrip((p) => void (p.error = "access_denied")), "denied");
  });

  it("lehnt Tokens mit falscher Signatur, falschem Empfänger, falscher Nonce oder abgelaufen ab", async () => {
    fake.overrides = { signWithOtherKey: true };
    await rejects(roundTrip(), "invalid_id_token");
    fake.overrides = { idTokenClaims: { aud: "anderer-client" } };
    await rejects(roundTrip(), "invalid_id_token");
    fake.overrides = { idTokenClaims: { iss: "https://fake-issuer.example" } };
    await rejects(roundTrip(), "invalid_id_token");
    fake.overrides = { idTokenClaims: { nonce: "falsch" } };
    await rejects(roundTrip(), "invalid_id_token");
    fake.overrides = { expiresInSeconds: -60 };
    await rejects(roundTrip(), "invalid_id_token");
  });

  it("lehnt ab, wenn das Twitch-Profil nicht zum signierten Token passt", async () => {
    fake.overrides = { helixUser: { id: "999", login: "jemand_anders", display_name: "X" } };
    await rejects(roundTrip(), "profile_failed");
  });

  it("meldet einen fehlgeschlagenen Code-Tausch", async () => {
    fake.overrides = { tokenStatus: 400 };
    await rejects(roundTrip(), "token_exchange_failed");
  });

  it("übernimmt nur HTTPS-Avatare", async () => {
    fake.user.profile_image_url = "http://unsicher.example/a.png";
    expect((await roundTrip()).identity.avatarUrl).toBeNull();
  });
});

const url = process.env["TEST_DATABASE_URL"];

describe.skipIf(!url)("Sitzungen gegen PostgreSQL", () => {
  let handle: DbHandle;
  let fake: FakeTwitch;

  beforeAll(async () => {
    await resetTestDatabase(url!);
    handle = connect(url);
    fake = await createFakeTwitch();
  });
  afterAll(async () => {
    await handle?.close();
  });

  const identity = () => ({ twitchId: fake.user.id, login: fake.user.login, displayName: fake.user.display_name, avatarUrl: null });

  it("legt Nutzer an, speichert nur den Hash des Tokens und erkennt die Sitzung wieder", async () => {
    const { user, token } = await createSessionForIdentity(handle.db, identity(), { ttlDays: 30, userAgent: "vitest" });
    expect(user.role).toBe("user");
    const rows = await handle.db.select().from(userSession);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await getSessionUser(handle.db, token, { ttlDays: 30 }))?.login).toBe("gunsmith_tester");
    expect(await getSessionUser(handle.db, token + "x", { ttlDays: 30 })).toBeNull();
  });

  it("übernimmt Umbenennungen bei Twitch beim nächsten Login, ohne doppelte Nutzer", async () => {
    await createSessionForIdentity(handle.db, { ...identity(), login: "neuer_name", displayName: "Neuer_Name" }, { ttlDays: 30 });
    const users = await handle.db.select().from(appUser);
    expect(users).toHaveLength(1);
    expect(users[0]!.login).toBe("neuer_name");
    expect(await getPublicProfile(handle.db, "NEUER_NAME")).toMatchObject({ displayName: "Neuer_Name" });
  });

  it("löscht abgelaufene Sitzungen beim Zugriff und verlängert aktive", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token } = await createSessionForIdentity(handle.db, identity(), { ttlDays: 1, now: t0 });
    const later = new Date(t0.getTime() + 2 * 3600_000);
    expect(await getSessionUser(handle.db, token, { ttlDays: 1, now: later })).not.toBeNull();
    // Durch die Verlängerung zwei Stunden später ist die Sitzung nach 25 h noch gültig.
    expect(await getSessionUser(handle.db, token, { ttlDays: 1, now: new Date(t0.getTime() + 25 * 3600_000) })).not.toBeNull();
    expect(await getSessionUser(handle.db, token, { ttlDays: 1, now: new Date(t0.getTime() + 60 * 3600_000) })).toBeNull();
    expect(await deleteExpiredSessions(handle.db, new Date(t0.getTime() + 60 * 3600_000))).toBeGreaterThanOrEqual(0);
  });

  it("meldet beim Logout ab", async () => {
    const { token } = await createSessionForIdentity(handle.db, identity(), { ttlDays: 30 });
    await deleteSession(handle.db, token);
    expect(await getSessionUser(handle.db, token, { ttlDays: 30 })).toBeNull();
  });

  it("vergibt Rollen und protokolliert das", async () => {
    const admin = await setRole(handle.db, fake.user.id, "admin", "test");
    expect(admin.role).toBe("admin");
    const audit = await handle.db.select().from(auditLog).where(eq(auditLog.action, "user.set_role"));
    expect(audit).toHaveLength(1);
    await expect(setRole(handle.db, "gibt_es_nicht", "admin", "test")).rejects.toThrow(/unbekannt/);
  });

  it("sperrt: alle Sitzungen enden sofort, neuer Login wird verweigert, Profil verschwindet", async () => {
    const { token } = await createSessionForIdentity(handle.db, identity(), { ttlDays: 30 });
    await banUser(handle.db, fake.user.id, "Spam", "test");
    expect(await getSessionUser(handle.db, token, { ttlDays: 30 })).toBeNull();
    await expect(createSessionForIdentity(handle.db, identity(), { ttlDays: 30 })).rejects.toMatchObject({ code: "banned" });
    expect(await getPublicProfile(handle.db, fake.user.login)).toBeNull();
    expect(await handle.db.select().from(userSession)).toHaveLength(0);
  });
});
