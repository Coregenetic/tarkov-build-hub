import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchTarkovDevDataset, type FetchResult } from "@tbh/data-adapters";
import { auditLog, connect, item, itemDataset, itemName, itemSlot, slotAllowedItem, type DbHandle } from "@tbh/db";
import { resetTestDatabase } from "@tbh/db/testing";
import { activateDataset, discardDataset, importDataset, ImportRefusedError, listDatasets, rollbackDataset } from "../src/service.ts";

/**
 * Läuft gegen eine echte PostgreSQL (TEST_DATABASE_URL, siehe scripts/test-db.sh).
 * Ohne die Variable wird der Test übersprungen, nicht still bestanden.
 */
const url = process.env["TEST_DATABASE_URL"];
const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "data-adapters", "test", "fixtures", "m4a1");
const thresholds = { minItems: 1, minGuns: 1, maxMissingNameRatio: 1, maxDanglingRatio: 1 };
const actor = "test";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const SF3P = "5c7fb51d2e2216001219ce11";
const MINI_MONSTER = "55d6190f4bdc2d87028b4567";

describe.skipIf(!url)("Import-Dienst gegen PostgreSQL", () => {
  let handle: DbHandle;
  let fixture: FetchResult;

  beforeAll(async () => {
    await resetTestDatabase(url!);
    handle = connect(url);
    fixture = await fetchTarkovDevDataset({ mode: "pvp", fromDir: fixtureDir });
  });

  afterAll(async () => {
    await handle?.close();
  });

  it("legt einen Import als Vorschau mit allen Beziehungen an", async () => {
    const { db } = handle;
    const { datasetId, report } = await importDataset(db, fixture, { actor, thresholds });
    expect(report.itemCount).toBe(19);

    const [ds] = await db.select().from(itemDataset).where(eq(itemDataset.id, datasetId));
    expect(ds!.status).toBe("preview");
    expect(ds!.patchId).toBeNull();

    const slots = await db.select().from(itemSlot).where(and(eq(itemSlot.datasetId, datasetId), eq(itemSlot.itemExtId, M4A1)));
    expect(slots).toHaveLength(6);

    const sf3pAllows = await db
      .select({ a: slotAllowedItem.allowedExtId })
      .from(slotAllowedItem)
      .where(and(eq(slotAllowedItem.datasetId, datasetId), eq(slotAllowedItem.itemExtId, SF3P)));
    expect(sf3pAllows.map((r) => r.a)).toContain(MINI_MONSTER);

    const [de] = await db
      .select({ name: itemName.name })
      .from(itemName)
      .where(and(eq(itemName.datasetId, datasetId), eq(itemName.extId, M4A1), eq(itemName.lang, "de")));
    expect(de!.name).toBe("Colt M4A1 5,56x45mm Sturmgewehr");
  });

  it("lehnt identische Daten ein zweites Mal ab", async () => {
    await expect(importDataset(handle.db, fixture, { actor, thresholds })).rejects.toThrow(ImportRefusedError);
  });

  it("lehnt einen unvollständigen Abruf mit den Standard-Schwellen ab", async () => {
    await expect(importDataset(handle.db, fixture, { actor, allowDuplicate: true })).rejects.toThrow(/unvollständig/);
  });

  it("gibt frei, archiviert beim nächsten Patch und rollt sauber zurück", async () => {
    const { db } = handle;
    const [first] = await listDatasets(db, "pvp");
    await activateDataset(db, first!.id, "0.16.9", actor);

    const second = await importDataset(db, fixture, { actor, thresholds, allowDuplicate: true });
    await activateDataset(db, second.datasetId, "0.16.10", actor);

    let rows = await listDatasets(db, "pvp");
    expect(rows.find((r) => r.id === first!.id)!.status).toBe("archived");
    expect(rows.find((r) => r.id === second.datasetId)).toMatchObject({ status: "active", patch: "0.16.10" });

    const result = await rollbackDataset(db, "pvp", actor);
    expect(result).toEqual({ from: second.datasetId, to: first!.id });
    rows = await listDatasets(db, "pvp");
    expect(rows.filter((r) => r.status === "active").map((r) => r.id)).toEqual([first!.id]);
    expect(rows.find((r) => r.id === first!.id)!.patch).toBe("0.16.9");

    // Archivierte Datensätze behalten ihre Items, damit alte Builds lesbar bleiben.
    const [{ count }] = (await db.execute(sql`SELECT count(*)::int AS count FROM item WHERE dataset_id = ${second.datasetId}`)) as unknown as [{ count: number }];
    expect(count).toBe(19);
  });

  it("erlaubt nie zwei aktive Datensätze im selben Modus", async () => {
    const { db } = handle;
    const [active] = (await listDatasets(db, "pvp")).filter((r) => r.status === "active");
    const other = (await listDatasets(db, "pvp")).find((r) => r.status === "archived")!;
    await expect(db.update(itemDataset).set({ status: "active" }).where(eq(itemDataset.id, other.id))).rejects.toThrow();
    expect(active).toBeDefined();
  });

  it("verwirft nur Vorschauen und räumt ihre Items weg", async () => {
    const { db } = handle;
    const preview = await importDataset(db, fixture, { actor, thresholds, allowDuplicate: true });
    await discardDataset(db, preview.datasetId, actor);
    const items = await db.select().from(item).where(eq(item.datasetId, preview.datasetId));
    expect(items).toHaveLength(0);
    const [ds] = await db.select().from(itemDataset).where(eq(itemDataset.id, preview.datasetId));
    expect(ds!.status).toBe("discarded");

    const [active] = (await listDatasets(db, "pvp")).filter((r) => r.status === "active");
    await expect(discardDataset(db, active!.id, actor)).rejects.toThrow(/Nur Vorschauen/);
  });

  it("verlangt eine gültige Patch-Bezeichnung", async () => {
    const preview = await importDataset(handle.db, fixture, { actor, thresholds, allowDuplicate: true });
    await expect(activateDataset(handle.db, preview.datasetId, "  ", actor)).rejects.toThrow(/Patch-Bezeichnung/);
    await expect(activateDataset(handle.db, preview.datasetId, "0.16; DROP", actor)).rejects.toThrow(/Patch-Bezeichnung/);
  });

  it("protokolliert jede Aktion", async () => {
    const actions = (await handle.db.select({ action: auditLog.action }).from(auditLog)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["dataset.import", "dataset.activate", "dataset.rollback", "dataset.discard"]));
  });
});
