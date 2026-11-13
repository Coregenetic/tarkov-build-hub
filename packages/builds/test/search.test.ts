import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assembleFromParts, installPart, type BuildNode } from "@tbh/compat-engine";
import { fetchTarkovDevDataset } from "@tbh/data-adapters";
import { appUser, build, connect, type DbHandle } from "@tbh/db";
import { resetTestDatabase } from "@tbh/db/testing";
import { gameDataFromNormalized, loadGameData } from "@tbh/game-data";
import { activateDataset, importDataset } from "../../../apps/importer/src/service.ts";
import { parseSearchParams, publishDraft, saveDraft, searchBuilds, searchFacets, setVisibility, startFork, toSearchParams, type Actor, type Deps } from "../src/index.ts";

/** Echte Daten (M4A1-Ausschnitt, json.tarkov.dev 13.11.2026) gegen echte PostgreSQL. */
const url = process.env["TEST_DATABASE_URL"];
const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data-adapters", "test", "fixtures", "m4a1");
const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PRESET = "5af08cf886f774223c269184";
const SF3P = "5c7fb51d2e2216001219ce11";
const MINI_MONSTER = "55d6190f4bdc2d87028b4567";

describe.skipIf(!url)("Suche und Filter", () => {
  let handle: DbHandle;
  let deps: Deps;
  let datasetId: number;
  let alice: Actor;
  let bob: Actor;
  let silentId = "";
  let plainId = "";

  beforeAll(async () => {
    await resetTestDatabase(url!);
    handle = connect(url);
    const fixture = await fetchTarkovDevDataset({ mode: "pvp", fromDir: fixtureDir });
    ({ datasetId } = await importDataset(handle.db, fixture, { actor: "test", thresholds: { minItems: 1, minGuns: 1, maxMissingNameRatio: 1, maxDanglingRatio: 1 } }));
    await activateDataset(handle.db, datasetId, "0.16.9", "test");
    deps = { getGameData: (id) => loadGameData(handle.db, id) };
    const data = gameDataFromNormalized(1, fixture.dataset);
    const parts = fixture.dataset.items.find((i) => i.extId === PRESET)!.contains.map((c) => c.itemExtId).filter((id) => id !== M4A1);
    const preset = assembleFromParts(data, M4A1, parts).build;
    const muzzle = (n: BuildNode, p: string[] = []): string[] | null => {
      for (const [slotId, child] of Object.entries(n.slots ?? {})) {
        const it = fixture.dataset.items.find((i) => i.extId === n.itemId);
        if (it?.slots.find((s) => s.extId === slotId)?.nameId === "mod_muzzle") return [...p, slotId];
        const r = muzzle(child, [...p, slotId]);
        if (r) return r;
      }
      return null;
    };
    const mp = muzzle(preset)!;
    const sf3pSlot = fixture.dataset.items.find((i) => i.extId === SF3P)!.slots[0]!.extId;
    const silent = installPart(installPart(preset, mp.slice(0, -1), mp.at(-1)!, SF3P).build, mp, sf3pSlot, MINI_MONSTER).build;

    const [a, b] = await handle.db
      .insert(appUser)
      .values([
        { twitchId: "2001", login: "alice_suche", displayName: "Alice" },
        { twitchId: "2002", login: "bob_suche", displayName: "Bob" },
      ])
      .returning();
    alice = { id: a!.id, login: a!.login };
    bob = { id: b!.id, login: b!.login };
    const publish = async (who: Actor, tree: BuildNode, title: string, purpose: string, visibility = "public") => {
      const { id } = await saveDraft(handle.db, who, { tree });
      return (await publishDraft(handle.db, who, id, { title, purpose, visibility }, deps)).publicId;
    };
    silentId = await publish(alice, silent, "Leise Nachtcarbine", "silent");
    plainId = await publish(bob, preset, "Standard 100 Prozent", "allround");
    await publish(bob, preset, "Geheimer Link-Build", "budget", "unlisted");
  });

  afterAll(async () => {
    await handle?.close();
  });

  const search = (params: Record<string, string>) => searchBuilds(handle.db, parseSearchParams(params), datasetId);

  it("zeigt nur öffentliche Builds, neueste zuerst", async () => {
    const r = await search({});
    expect(r.hits.map((h) => h.publicId)).toEqual([plainId, silentId]);
    expect(r.total).toBe(2);
    expect(r.hits[0]).toMatchObject({ patchLabel: "0.16.9", caliber: "Caliber556x45NATO", owner: { login: "bob_suche" } });
  });

  it("findet über Waffennamen in beiden Sprachen, Titel und Ersteller", async () => {
    expect((await search({ q: "Sturmgewehr" })).total).toBe(2); // deutscher Waffenname
    expect((await search({ q: "assault rifle" })).total).toBe(2); // englischer Waffenname
    expect((await search({ q: "nachtcarbine" })).hits.map((h) => h.publicId)).toEqual([silentId]);
    expect((await search({ q: "bob_su" })).hits.map((h) => h.publicId)).toEqual([plainId]);
  });

  it("behandelt % und _ im Suchtext als normale Zeichen", async () => {
    expect((await search({ q: "%" })).total).toBe(0);
    expect((await search({ q: "_" })).hits.map((h) => h.publicId)).toEqual(expect.arrayContaining([silentId, plainId])); // Logins enthalten _
  });

  it("filtert nach Teil, Zweck, Budget, Kaliber, Patch und Ersteller", async () => {
    expect((await search({ teil: MINI_MONSTER })).hits.map((h) => h.publicId)).toEqual([silentId]);
    expect((await search({ zweck: "allround" })).hits.map((h) => h.publicId)).toEqual([plainId]);
    const [silentRow] = await handle.db.select({ price: build.partsPrice }).from(build).where(eq(build.publicId, silentId));
    expect((await search({ budget: String(silentRow!.price! - 1) })).hits.map((h) => h.publicId)).not.toContain(silentId);
    expect((await search({ kaliber: "Caliber556x45NATO" })).total).toBe(2);
    expect((await search({ kaliber: "Caliber762x39" })).total).toBe(0);
    expect((await search({ patch: "0.16.9" })).total).toBe(2);
    expect((await search({ von: "alice_suche" })).hits.map((h) => h.publicId)).toEqual([silentId]);
  });

  it("sortiert nach Varianten und zählt nur öffentliche Varianten", async () => {
    const { draftId } = await startFork(handle.db, bob, silentId);
    const { id } = { id: draftId };
    const fork = await publishDraft(handle.db, bob, id, { title: "Bobs leise Variante", purpose: "silent" }, deps);
    let r = await search({ sort: "forks" });
    expect(r.hits[0]).toMatchObject({ publicId: silentId, forkCount: 1 });
    await setVisibility(handle.db, bob, fork.publicId, "unlisted");
    r = await search({ sort: "forks" });
    expect(r.hits.find((h) => h.publicId === silentId)?.forkCount).toBe(0);
  });

  it("blendet Builds gesperrter Nutzer aus", async () => {
    await handle.db.update(appUser).set({ bannedAt: new Date() }).where(eq(appUser.id, alice.id));
    expect((await search({})).hits.map((h) => h.publicId)).not.toContain(silentId);
    await handle.db.update(appUser).set({ bannedAt: null }).where(eq(appUser.id, alice.id));
  });

  it("ignoriert kaputte Parameter und baut saubere URLs", () => {
    const f = parseSearchParams({ waffe: "'; drop", zweck: "x", budget: "-5", seite: "999999", sort: "evil", kaliber: "../../" });
    expect(f).toMatchObject({ weapon: null, purpose: null, maxPrice: null, page: 1, sort: "new", caliber: null });
    expect(toSearchParams(parseSearchParams({ q: "m4", zweck: "silent", seite: "2" })).toString()).toBe("q=m4&zweck=silent&seite=2");
  });

  it("liefert Filterwerte nur aus vorhandenen öffentlichen Builds", async () => {
    const facets = await searchFacets(handle.db, "pvp");
    expect(facets.weapons).toEqual([{ value: M4A1, count: 2 }]);
    expect(facets.calibers).toEqual([{ value: "Caliber556x45NATO", count: 2 }]);
  });
});
