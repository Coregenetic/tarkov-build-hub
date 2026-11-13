import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assembleFromParts, type BuildNode } from "@tbh/compat-engine";
import { fetchTarkovDevDataset } from "@tbh/data-adapters";
import { appUser, auditLog, build, connect, userSession, type DbHandle } from "@tbh/db";
import { resetTestDatabase } from "@tbh/db/testing";
import { gameDataFromNormalized, loadGameData } from "@tbh/game-data";
import { activateDataset, importDataset } from "../../../apps/importer/src/service.ts";
import {
  addComment,
  banUserFor,
  deleteOwnComment,
  editComment,
  fileReport,
  getBuildView,
  getInteraction,
  getSettings,
  hardDeleteBuild,
  hideBuild,
  listAudit,
  listBookmarks,
  listComments,
  listOpenReports,
  parseSearchParams,
  publishDraft,
  purgeUserContent,
  resolveReports,
  restoreBuild,
  saveDraft,
  searchBuilds,
  setBookmark,
  setLike,
  setUserRoleById,
  statsOverview,
  unbanUserById,
  updateSettings,
  type Actor,
  type Staff,
} from "../src/index.ts";

/** Echte Daten (M4A1-Ausschnitt, json.tarkov.dev 13.11.2026) gegen echte PostgreSQL. */
const url = process.env["TEST_DATABASE_URL"];
const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data-adapters", "test", "fixtures", "m4a1");
const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PRESET = "5af08cf886f774223c269184";

describe.skipIf(!url)("Community und Moderation", () => {
  let handle: DbHandle;
  let alice: Actor;
  let bob: Actor;
  let carol: Actor;
  let mod: Staff;
  let admin: Staff;
  let buildId = "";
  let preset: BuildNode;
  const fresh = () => new Date();
  const stale = () => new Date(Date.now() - 60 * 60_000);

  beforeAll(async () => {
    await resetTestDatabase(url!);
    handle = connect(url);
    const fixture = await fetchTarkovDevDataset({ mode: "pvp", fromDir: fixtureDir });
    const { datasetId } = await importDataset(handle.db, fixture, { actor: "test", thresholds: { minItems: 1, minGuns: 1, maxMissingNameRatio: 1, maxDanglingRatio: 1 } });
    await activateDataset(handle.db, datasetId, "0.16.9", "test");
    const data = gameDataFromNormalized(1, fixture.dataset);
    preset = assembleFromParts(data, M4A1, fixture.dataset.items.find((i) => i.extId === PRESET)!.contains.map((c) => c.itemExtId).filter((id) => id !== M4A1)).build;
    const users = await handle.db
      .insert(appUser)
      .values([
        { twitchId: "3001", login: "alice_c", displayName: "Alice" },
        { twitchId: "3002", login: "bob_c", displayName: "Bob" },
        { twitchId: "3003", login: "carol_c", displayName: "Carol" },
        { twitchId: "3004", login: "mod_c", displayName: "Mod", role: "moderator" },
        { twitchId: "3005", login: "admin_c", displayName: "Admin", role: "admin" },
      ])
      .returning();
    [alice, bob, carol] = users.slice(0, 3).map((u) => ({ id: u.id, login: u.login })) as [Actor, Actor, Actor];
    mod = { id: users[3]!.id, login: users[3]!.login, sessionStartedAt: fresh() };
    admin = { id: users[4]!.id, login: users[4]!.login, sessionStartedAt: fresh() };
    const { id } = await saveDraft(handle.db, alice, { tree: preset });
    buildId = (await publishDraft(handle.db, alice, id, { title: "Alices M4A1", purpose: "allround" }, { getGameData: (d) => loadGameData(handle.db, d) })).publicId;
  });

  afterAll(async () => {
    await handle?.close();
  });

  it("zählt Gefällt mir, verbietet Selbst-Likes und sortiert nach Beliebtheit", async () => {
    await expect(setLike(handle.db, alice, buildId, true)).rejects.toMatchObject({ code: "forbidden" });
    expect(await setLike(handle.db, bob, buildId, true)).toEqual({ liked: true, likeCount: 1 });
    expect(await setLike(handle.db, bob, buildId, true)).toEqual({ liked: true, likeCount: 1 }); // doppelt zählt nicht
    expect(await setLike(handle.db, carol, buildId, true)).toEqual({ liked: true, likeCount: 2 });
    expect(await setLike(handle.db, carol, buildId, false)).toEqual({ liked: false, likeCount: 1 });
    const r = await searchBuilds(handle.db, { ...parseSearchParams({}), sort: "popular" }, null);
    expect(r.hits[0]).toMatchObject({ publicId: buildId, likeCount: 1 });
  });

  it("merkt Builds nur für den jeweiligen Nutzer", async () => {
    await setBookmark(handle.db, bob, buildId, true);
    expect((await listBookmarks(handle.db, bob)).map((b) => b.publicId)).toEqual([buildId]);
    expect(await listBookmarks(handle.db, carol)).toEqual([]);
    expect(await getInteraction(handle.db, bob.id, buildId)).toMatchObject({ liked: true, bookmarked: true, likeCount: 1 });
  });

  it("nimmt Kommentare an, prüft Länge, Doppelungen und das Bearbeitungsfenster", async () => {
    const { id } = await addComment(handle.db, bob, buildId, "  Sauberer Build!\n\n\n\nDanke.  ");
    const [c] = await listComments(handle.db, buildId, { id: bob.id, role: "user" });
    expect(c).toMatchObject({ id, body: "Sauberer Build!\n\nDanke.", canEdit: true, author: { login: "bob_c" } });
    await expect(addComment(handle.db, bob, buildId, "Sauberer Build!\n\nDanke.")).rejects.toMatchObject({ code: "rate_limited" });
    await expect(addComment(handle.db, bob, buildId, "   ")).rejects.toThrow(/leer/);
    await expect(addComment(handle.db, bob, buildId, "x".repeat(1001))).rejects.toThrow(/zu lang/);
    await expect(editComment(handle.db, carol, id, "fremd")).rejects.toMatchObject({ code: "not_found" });
    await expect(editComment(handle.db, bob, id, "spät", new Date(Date.now() + 16 * 60_000))).rejects.toMatchObject({ code: "forbidden" });
    await editComment(handle.db, bob, id, "Sauberer Build, danke.");
    expect((await getBuildView(handle.db, buildId, null)).publicId).toBe(buildId);
    const [b] = await handle.db.select({ n: build.commentCount }).from(build).where(eq(build.publicId, buildId));
    expect(b!.n).toBe(1);
  });

  it("lässt Meldungen nur einmal je Ziel zu und nicht für eigene Inhalte", async () => {
    await expect(fileReport(handle.db, alice, { targetType: "build", target: buildId, reason: "spam" })).rejects.toMatchObject({ code: "forbidden" });
    await fileReport(handle.db, bob, { targetType: "build", target: buildId, reason: "wrong_info", note: "Passt so nicht?" });
    await expect(fileReport(handle.db, bob, { targetType: "build", target: buildId, reason: "spam" })).rejects.toMatchObject({ code: "limit_reached" });
    await fileReport(handle.db, carol, { targetType: "build", target: buildId, reason: "spam" });
    await expect(fileReport(handle.db, carol, { targetType: "build", target: buildId, reason: "erfunden" })).rejects.toThrow(/Grund/);
  });

  it("zeigt Meldungen nur der Moderation, gruppiert je Ziel", async () => {
    await expect(listOpenReports(handle.db, { id: bob.id, login: bob.login })).rejects.toMatchObject({ code: "forbidden" });
    const groups = await listOpenReports(handle.db, mod);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ targetType: "build", reports: 2, reasons: { wrong_info: 1, spam: 1 }, buildPublicId: buildId, author: { login: "alice_c" }, notes: ["Passt so nicht?"] });
  });

  it("blendet über eine Meldung aus und sperrt zeitlich; Builds verschwinden, Sperre läuft ab", async () => {
    const [g] = await listOpenReports(handle.db, mod);
    await expect(resolveReports(handle.db, mod, { targetType: "build", targetId: g!.targetId, action: "hide_ban" })).rejects.toThrow(/Grund/);
    await resolveReports(handle.db, mod, { targetType: "build", targetId: g!.targetId, action: "hide_ban", reason: "Spam-Verdacht" });
    expect(await listOpenReports(handle.db, mod)).toHaveLength(0);
    await expect(getBuildView(handle.db, buildId, null)).rejects.toMatchObject({ code: "not_found" });
    expect((await getBuildView(handle.db, buildId, { id: mod.id, role: "moderator" })).status).toBe("hidden");
    const [a] = await handle.db.select().from(appUser).where(eq(appUser.id, alice.id));
    expect(a!.bannedUntil!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    await expect(saveDraft(handle.db, alice, { tree: preset })).rejects.toMatchObject({ code: "banned" });

    // Abgelaufene Sperre gilt nicht mehr.
    await handle.db.update(appUser).set({ bannedUntil: new Date(Date.now() - 1000) }).where(eq(appUser.id, alice.id));
    await expect(saveDraft(handle.db, alice, { tree: preset })).resolves.toMatchObject({ id: expect.any(Number) });

    await restoreBuild(handle.db, mod, buildId);
    expect((await getBuildView(handle.db, buildId, null)).status).toBe("published");
  });

  it("hält Moderatoren in ihren Grenzen", async () => {
    await expect(banUserFor(handle.db, mod, carol.id, "permanent", "Test")).rejects.toMatchObject({ code: "forbidden" });
    await expect(banUserFor(handle.db, mod, admin.id, "24h", "Test")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setUserRoleById(handle.db, mod, carol.id, "moderator")).rejects.toMatchObject({ code: "forbidden" });
    await expect(hardDeleteBuild(handle.db, mod, buildId, "Test")).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateSettings(handle.db, mod, { maintenance: { enabled: true } })).rejects.toMatchObject({ code: "forbidden" });
    await banUserFor(handle.db, mod, carol.id, "24h", "Beleidigung");
    await unbanUserById(handle.db, mod, carol.id);
  });

  it("verlangt für Rollenwechsel und endgültiges Löschen eine frische Anmeldung", async () => {
    const staleAdmin = { ...admin, sessionStartedAt: stale() };
    await expect(setUserRoleById(handle.db, staleAdmin, carol.id, "moderator")).rejects.toMatchObject({ code: "reauth_required" });
    await expect(setUserRoleById(handle.db, admin, carol.id, "admin")).rejects.toThrow(/Server-Konsole/);
    await setUserRoleById(handle.db, admin, carol.id, "moderator");
    await expect(hardDeleteBuild(handle.db, staleAdmin, buildId, "Löschanfrage")).rejects.toMatchObject({ code: "reauth_required" });
  });

  it("entfernt Spam-Konten vollständig und beendet ihre Sitzungen", async () => {
    await handle.db.insert(userSession).values({ tokenHash: "x".repeat(64), userId: bob.id, expiresAt: new Date(Date.now() + 86_400_000) });
    const r = await purgeUserContent(handle.db, admin, bob.id, "Spam-Konto");
    expect(r.comments).toBe(1);
    expect(await listComments(handle.db, buildId, null)).toHaveLength(0);
    expect(await handle.db.select().from(userSession).where(eq(userSession.userId, bob.id))).toHaveLength(0);
    const [b] = await handle.db.select().from(appUser).where(eq(appUser.id, bob.id));
    expect(b).toMatchObject({ bannedUntil: null });
    expect(b!.bannedAt).not.toBeNull();
  });

  it("protokolliert jede Aktion mit vorher/nachher; nur Admins lesen das Protokoll", async () => {
    await expect(listAudit(handle.db, mod, {})).rejects.toMatchObject({ code: "forbidden" });
    const { rows } = await listAudit(handle.db, admin, { area: "users" });
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["user.ban", "user.unban", "user.set_role", "user.purge"]));
    const role = rows.find((r) => r.action === "user.set_role");
    expect(role?.details).toMatchObject({ before: "user", after: "moderator" });
    expect(role?.actor).toBe("admin_c");
    const all = await handle.db.select({ action: auditLog.action }).from(auditLog);
    expect(all.map((a) => a.action)).toEqual(expect.arrayContaining(["report.action", "build.restore"]));
  });

  it("speichert Banner und Wartungsmodus und löscht endgültig mit frischer Anmeldung", async () => {
    await expect(updateSettings(handle.db, admin, { banner: { enabled: true, text: "" } })).rejects.toThrow(/Bannertext/);
    await updateSettings(handle.db, admin, { banner: { enabled: true, text: "Neuer Patch – Daten werden aktualisiert." }, maintenance: { enabled: false } });
    expect(await getSettings(handle.db)).toEqual({ banner: { enabled: true, text: "Neuer Patch – Daten werden aktualisiert." }, maintenance: { enabled: false } });
    await hideBuild(handle.db, mod, buildId, "Prüfung");
    await hardDeleteBuild(handle.db, admin, buildId, "Löschanfrage des Erstellers");
    await expect(getBuildView(handle.db, buildId, { id: admin.id, role: "admin" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("zählt Statistik nur als Summen", async () => {
    const s = await statsOverview(handle.db, 7);
    expect(s.days).toHaveLength(7);
    expect(s.totals).toMatchObject({ comments: 1, likes: 2, reports: 2 });
    const [{ n }] = (await handle.db.execute(sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name IN ('daily_counter','user_activity_day','search_miss') AND column_name ILIKE '%ip%'`)) as unknown as [{ n: number }];
    expect(n).toBe(0);
  });
});
