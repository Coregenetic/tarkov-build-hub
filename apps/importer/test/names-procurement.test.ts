import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchTarkovDevDataset } from "@tbh/data-adapters";
import { auditLog, connect, type DbHandle } from "@tbh/db";
import { resetTestDatabase } from "@tbh/db/testing";
import { loadDisplayNames, loadProcurementData, removeNameOverride, setNameOverride, summarizeProcurement } from "@tbh/game-data";
import { activateDataset, importDataset } from "../src/service.ts";

const url = process.env["TEST_DATABASE_URL"];
const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "data-adapters", "test", "fixtures", "m4a1");
const thresholds = { minItems: 1, minGuns: 1, maxMissingNameRatio: 1, maxDanglingRatio: 1 };

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const MINI_MONSTER = "55d6190f4bdc2d87028b4567";
const STANAG = "55d4887d4bdc2d962f8b4570";
const admin = { label: "test-admin", userId: null };

describe.skipIf(!url)("Eigene Namen und Beschaffung aus der Datenbank", () => {
  let handle: DbHandle;
  let datasetId: number;

  beforeAll(async () => {
    await resetTestDatabase(url!);
    handle = connect(url);
    const fixture = await fetchTarkovDevDataset({ mode: "pvp", fromDir: fixtureDir });
    ({ datasetId } = await importDataset(handle.db, fixture, { actor: "test", thresholds }));
    await activateDataset(handle.db, datasetId, "test", "test");
  });

  afterAll(async () => {
    await handle?.close();
  });

  it("ersetzt einen Namen, behält das Original und protokolliert vorher/nachher", async () => {
    const { db } = handle;
    await setNameOverride(db, { extId: M4A1, lang: "de", field: "short_name", value: "  M4A1  Colt ", sourceValue: "M4A1" }, admin);
    const names = await loadDisplayNames(db, datasetId, "de", [M4A1]);
    expect(names.get(M4A1)).toEqual({
      name: "Colt M4A1 5,56x45mm Sturmgewehr",
      shortName: "M4A1 Colt",
      source: { name: "Colt M4A1 5,56x45mm Sturmgewehr", shortName: "M4A1" },
      overridden: { name: false, shortName: true },
    });
    // Englisch bleibt unberührt.
    expect((await loadDisplayNames(db, datasetId, "en", [M4A1])).get(M4A1)?.overridden.shortName).toBe(false);

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "item_name.set"));
    expect(entry!.details).toMatchObject({ before: "M4A1", after: "M4A1 Colt" });
  });

  it("übersteht einen neuen Import und lässt sich zurücknehmen", async () => {
    const { db } = handle;
    const fixture = await fetchTarkovDevDataset({ mode: "pvp", fromDir: fixtureDir });
    const second = await importDataset(db, fixture, { actor: "test", thresholds, allowDuplicate: true });
    expect((await loadDisplayNames(db, second.datasetId, "de", [M4A1])).get(M4A1)?.shortName).toBe("M4A1 Colt");

    expect(await removeNameOverride(db, { extId: M4A1, lang: "de", field: "short_name" }, admin)).toBe(true);
    expect((await loadDisplayNames(db, datasetId, "de", [M4A1])).get(M4A1)?.shortName).toBe("M4A1");
    expect(await removeNameOverride(db, { extId: M4A1, lang: "de", field: "short_name" }, admin)).toBe(false);
  });

  it("lehnt leere Namen, unsichtbare Steuerzeichen und ungültige IDs ab", async () => {
    const { db } = handle;
    await expect(setNameOverride(db, { extId: M4A1, lang: "de", field: "name", value: "   " }, admin)).rejects.toThrow(/1 bis 200/);
    await expect(setNameOverride(db, { extId: M4A1, lang: "de", field: "name", value: "M4‮evil" }, admin)).rejects.toThrow(/Steuerzeichen/);
    await expect(setNameOverride(db, { extId: "../x", lang: "de", field: "name", value: "x" }, admin)).rejects.toThrow(/Item-ID/);
  });

  it("liefert dieselbe Beschaffung wie aus den Rohdaten", async () => {
    const data = await loadProcurementData(handle.db, datasetId, [M4A1, MINI_MONSTER, STANAG]);
    expect(data.fleaMinPlayerLevel).toBe(15);
    expect(data.traders).toHaveLength(16);
    const s = summarizeProcurement({ traders: new Map(data.traders.map((t) => [t.id, t])), fleaMinPlayerLevel: data.fleaMinPlayerLevel }, data.sources);
    expect(s.traderRoute.playerLevel).toBe(26);
    expect(s.parts.find((p) => p.itemId === MINI_MONSTER)?.alternatives.map((a) => a.kind)).toEqual(["barter"]);
    expect(s.fleaRoute.playerLevel).toBe(25);
  });
});
