import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assembleFromParts, installPart, removePart, type BuildNode } from "@tbh/compat-engine";
import { fetchTarkovDevDataset } from "@tbh/data-adapters";
import { appUser, buildVersion, connect, type DbHandle } from "@tbh/db";
import { resetTestDatabase } from "@tbh/db/testing";
import { gameDataFromNormalized, loadGameData } from "@tbh/game-data";
import { activateDataset, importDataset } from "../../../apps/importer/src/service.ts";
import {
  BuildError,
  deleteOwnBuild,
  getBuildView,
  InputError,
  listUserBuilds,
  publishDraft,
  saveDraft,
  setVisibility,
  startEdit,
  startFork,
  type Actor,
  type Deps,
} from "../src/index.ts";

/** Echte Daten: M4A1-Ausschnitt aus json.tarkov.dev (13.11.2026), echte PostgreSQL (TEST_DATABASE_URL). */
const url = process.env["TEST_DATABASE_URL"];
const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data-adapters", "test", "fixtures", "m4a1");

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PRESET = "5af08cf886f774223c269184";
const SF3P = "5c7fb51d2e2216001219ce11";
const WAVE = "5cff9e5ed7ad1a09407397d4";
const MINI_MONSTER = "55d6190f4bdc2d87028b4567";

describe.skipIf(!url)("Builds veröffentlichen, versionieren, variieren", () => {
  let handle: DbHandle;
  let deps: Deps;
  let preset: BuildNode;
  let muzzlePath: string[];
  let sf3pSlot: string;
  let alice: Actor;
  let bob: Actor;
  const publishMeta = { title: "M4A1 leise Carbine", notes: "SF3P, damit der MINI MONSTER passt.", purpose: "silent" };

  beforeAll(async () => {
    await resetTestDatabase(url!);
    handle = connect(url);
    const fixture = await fetchTarkovDevDataset({ mode: "pvp", fromDir: fixtureDir });
    const { datasetId } = await importDataset(handle.db, fixture, { actor: "test", thresholds: { minItems: 1, minGuns: 1, maxMissingNameRatio: 1, maxDanglingRatio: 1 } });
    await activateDataset(handle.db, datasetId, "0.16.9", "test");
    deps = { getGameData: (id) => loadGameData(handle.db, id) };

    const data = gameDataFromNormalized(1, fixture.dataset);
    const parts = fixture.dataset.items.find((i) => i.extId === PRESET)!.contains.map((c) => c.itemExtId).filter((id) => id !== M4A1);
    preset = assembleFromParts(data, M4A1, parts).build;
    const find = (n: BuildNode, p: string[]): string[] | null => {
      for (const [slotId, child] of Object.entries(n.slots ?? {})) {
        const item = fixture.dataset.items.find((i) => i.extId === n.itemId);
        if (item?.slots.find((s) => s.extId === slotId)?.nameId === "mod_muzzle") return [...p, slotId];
        const r = find(child, [...p, slotId]);
        if (r) return r;
      }
      return null;
    };
    muzzlePath = find(preset, [])!;
    sf3pSlot = fixture.dataset.items.find((i) => i.extId === SF3P)!.slots[0]!.extId;

    const [a, b] = await handle.db
      .insert(appUser)
      .values([
        { twitchId: "1001", login: "alice_test", displayName: "Alice" },
        { twitchId: "1002", login: "bob_test", displayName: "Bob" },
      ])
      .returning();
    alice = { id: a!.id, login: a!.login };
    bob = { id: b!.id, login: b!.login };
  });

  afterAll(async () => {
    await handle?.close();
  });

  const silentTree = () => {
    let t = installPart(preset, muzzlePath.slice(0, -1), muzzlePath.at(-1)!, SF3P).build;
    t = installPart(t, muzzlePath, sf3pSlot, MINI_MONSTER).build;
    return t;
  };

  it("veröffentlicht einen gültigen Build mit Patch, Datensatz, Werten und Beschaffung als Schnappschuss", async () => {
    const { db } = handle;
    const { id } = await saveDraft(db, alice, { tree: silentTree(), title: "" });
    const r = await publishDraft(db, alice, id, publishMeta, deps);
    expect(r.version).toBe(1);
    expect(r.publicId).toMatch(/^[0-9A-Za-z]{10}$/);

    const view = await getBuildView(db, r.publicId, null);
    expect(view.version).toMatchObject({ version: 1, patchLabel: "0.16.9", title: "M4A1 leise Carbine", purpose: "silent" });
    expect(view.version.partIds).toEqual(expect.arrayContaining([M4A1, SF3P, MINI_MONSTER]));
    expect(view.version.stats).toMatchObject({ partCount: expect.any(Number) });
    expect((view.version.procurement as { traderRoute: { playerLevel: number } }).traderRoute.playerLevel).toBe(26);
    expect(view.owner.login).toBe("alice_test");
  });

  it("lehnt den echten Konflikt ab: WAVE nimmt den MINI MONSTER nicht", async () => {
    const { db } = handle;
    const wrong = installPart(silentTree(), muzzlePath.slice(0, -1), muzzlePath.at(-1)!, WAVE).build;
    const { id } = await saveDraft(db, alice, { tree: wrong });
    const error = await publishDraft(db, alice, id, publishMeta, deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BuildError);
    expect((error as BuildError).code).toBe("invalid_build");
    expect((error as BuildError).issues.some((i) => i.itemId === MINI_MONSTER)).toBe(true);
  });

  it("lehnt unvollständige Builds ab (Pflicht-Slot Pistolengriff leer)", async () => {
    const { db } = handle;
    const gripSlot = Object.keys(preset.slots!).find((s) => preset.slots![s]!.itemId === "55d4b9964bdc2d1d4e8b456e")!;
    const { id } = await saveDraft(db, alice, { tree: removePart(preset, [], gripSlot).build });
    await expect(publishDraft(db, alice, id, publishMeta, deps)).rejects.toMatchObject({ code: "incomplete_build" });
  });

  it("prüft Eingaben: Titel, Item-IDs, Größe des Baums", async () => {
    const { db } = handle;
    const { id } = await saveDraft(db, alice, { tree: preset });
    await expect(publishDraft(db, alice, id, { ...publishMeta, title: "ab" }, deps)).rejects.toBeInstanceOf(InputError);
    await expect(saveDraft(db, alice, { tree: { itemId: "<script>" } })).rejects.toBeInstanceOf(InputError);
    let deep: BuildNode = { itemId: M4A1 };
    for (let i = 0; i < 200; i++) deep = { itemId: M4A1, slots: { "55d5a2ec4bdc2d972f8b4575": deep } };
    await expect(saveDraft(db, alice, { tree: deep })).rejects.toBeInstanceOf(InputError);
  });

  it("hält veröffentlichte Versionen unveränderlich – auch direkt in der Datenbank", async () => {
    await expect(handle.db.update(buildVersion).set({ title: "geändert" })).rejects.toThrow();
  });

  it("lässt nur den Ersteller neue Versionen machen; v1 bleibt dabei unverändert", async () => {
    const { db } = handle;
    const [mine] = await listUserBuilds(db, alice.id, true);
    await expect(startEdit(db, bob, mine!.publicId)).rejects.toMatchObject({ code: "forbidden" });

    const { draftId } = await startEdit(db, alice, mine!.publicId);
    const r = await publishDraft(db, alice, draftId, { ...publishMeta, title: "M4A1 leise Carbine (Version 2)" }, deps);
    expect(r).toEqual({ publicId: mine!.publicId, version: 2 });
    const v1 = await getBuildView(db, mine!.publicId, null, 1);
    expect(v1.version.title).toBe("M4A1 leise Carbine");
    expect((await getBuildView(db, mine!.publicId, null)).versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it("verknüpft Varianten mit der konkreten Version und behält die Herkunft, wenn das Original gelöscht wird", async () => {
    const { db } = handle;
    const [original] = await listUserBuilds(db, alice.id, true);
    const { draftId } = await startFork(db, bob, original!.publicId, 1);
    const fork = await publishDraft(db, bob, draftId, { ...publishMeta, title: "Bobs Variante" }, deps);
    let view = await getBuildView(db, fork.publicId, null);
    expect(view.forkedFrom).toEqual({ label: "„M4A1 leise Carbine“ v1 von alice_test", publicId: original!.publicId, version: 1 });
    expect((await getBuildView(db, original!.publicId, null)).forkCount).toBe(1);

    await expect(deleteOwnBuild(db, bob, original!.publicId)).rejects.toMatchObject({ code: "not_found" });
    await deleteOwnBuild(db, alice, original!.publicId);
    await expect(getBuildView(db, original!.publicId, null)).rejects.toMatchObject({ code: "not_found" });
    view = await getBuildView(db, fork.publicId, null);
    expect(view.forkedFrom).toEqual({ label: "„M4A1 leise Carbine“ v1 von alice_test", publicId: null, version: null });
  });

  it("zeigt Fremden nur öffentliche Builds", async () => {
    const { db } = handle;
    const [fork] = await listUserBuilds(db, bob.id, true);
    await setVisibility(db, bob, fork!.publicId, "unlisted");
    expect(await listUserBuilds(db, bob.id, false)).toHaveLength(0);
    expect(await listUserBuilds(db, bob.id, true)).toHaveLength(1);
    // Über den Link bleibt er erreichbar.
    expect((await getBuildView(db, fork!.publicId, null)).visibility).toBe("unlisted");
    await expect(setVisibility(db, alice, fork!.publicId, "public")).rejects.toMatchObject({ code: "not_found" });
  });

  it("sperrt gesperrte Nutzer und begrenzt Veröffentlichungen pro Stunde", async () => {
    const { db } = handle;
    await db.update(appUser).set({ bannedAt: new Date() }).where(eq(appUser.id, bob.id));
    await expect(saveDraft(db, bob, { tree: preset })).rejects.toMatchObject({ code: "banned" });
    await db.update(appUser).set({ bannedAt: null }).where(eq(appUser.id, bob.id));

    for (let i = 0; i < 9; i++) {
      const { id } = await saveDraft(db, bob, { tree: preset });
      await publishDraft(db, bob, id, { ...publishMeta, title: `Serie ${i + 1}` }, deps);
    }
    const { id } = await saveDraft(db, bob, { tree: preset });
    await expect(publishDraft(db, bob, id, { ...publishMeta, title: "Eine zu viel" }, deps)).rejects.toMatchObject({ code: "rate_limited" });
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM build_version`)) as unknown as [{ n: number }];
    expect(n).toBe(12);
  });
});
