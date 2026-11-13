import { gzipSync } from "node:zlib";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  DEFAULT_THRESHOLDS,
  validateDataset,
  type FetchResult,
  type GameMode,
  type Lang,
  type ValidationReport,
  type ValidationThresholds,
} from "@tbh/data-adapters";
import {
  auditLog,
  barter,
  datasetRaw,
  gamePatch,
  item,
  itemConflict,
  itemContains,
  itemDataset,
  itemName,
  itemSlot,
  slotAllowedItem,
  slotFilter,
  slotName,
  task,
  trader,
  traderOffer,
  type Database,
} from "@tbh/db";

export class ImportRefusedError extends Error {
  constructor(
    message: string,
    readonly report?: ValidationReport,
  ) {
    super(message);
    this.name = "ImportRefusedError";
  }
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const CHUNK = 1000;

async function insertChunked<T extends PgTable>(tx: Tx, table: T, rows: T["$inferInsert"][]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(table).values(rows.slice(i, i + CHUNK) as never);
  }
}

function toInt(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

export interface ImportOptions {
  actor: string;
  thresholds?: ValidationThresholds;
  /** Auch importieren, wenn ein identischer Datensatz (gleiche Prüfsumme) schon existiert. */
  allowDuplicate?: boolean;
}

export interface ImportOutcome {
  datasetId: number;
  report: ValidationReport;
}

/**
 * Speichert einen abgerufenen Datensatz als Vorschau.
 * Aktiv wird er erst durch activateDataset – vorher sieht ihn niemand.
 */
export async function importDataset(db: Database, fetched: FetchResult, options: ImportOptions): Promise<ImportOutcome> {
  const { dataset } = fetched;
  const report = validateDataset(dataset, fetched.rejected.length, options.thresholds ?? DEFAULT_THRESHOLDS);
  if (report.errors.length > 0) {
    throw new ImportRefusedError(`Import abgelehnt: ${report.errors.join(" ")}`, report);
  }

  if (!options.allowDuplicate) {
    const [same] = await db
      .select({ id: itemDataset.id, status: itemDataset.status })
      .from(itemDataset)
      .where(and(eq(itemDataset.mode, dataset.mode), eq(itemDataset.checksum, fetched.checksum), ne(itemDataset.status, "discarded")))
      .limit(1);
    if (same) {
      throw new ImportRefusedError(`Identische Daten liegen schon als Datensatz #${same.id} (${same.status}) vor.`, report);
    }
  }

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(itemDataset)
      .values({
        mode: dataset.mode,
        source: dataset.source,
        sourceUrl: dataset.sourceUrl,
        fetchedAt: new Date(dataset.fetchedAt),
        sourceUpdatedAt: dataset.sourceUpdatedAt ? new Date(dataset.sourceUpdatedAt) : null,
        checksum: fetched.checksum,
        status: "preview",
        itemCount: dataset.items.length,
        fleaMinPlayerLevel: toInt(dataset.fleaMinPlayerLevel),
        report,
      })
      .returning({ id: itemDataset.id });
    const datasetId = created!.id;

    const rawRows = [
      { datasetId, part: "items", gzip: gzipSync(fetched.raw.items), byteLength: fetched.raw.items.byteLength },
      ...Object.entries(fetched.raw.translations).map(([lang, bytes]) => ({
        datasetId,
        part: `items_${lang}`,
        gzip: gzipSync(bytes),
        byteLength: bytes.byteLength,
      })),
      ...Object.entries(fetched.raw.extra).map(([part, bytes]) => ({
        datasetId,
        part,
        gzip: gzipSync(bytes),
        byteLength: bytes.byteLength,
      })),
    ];
    await insertChunked(tx, datasetRaw, rawRows);

    await insertChunked(
      tx,
      item,
      dataset.items.map((i) => ({
        datasetId,
        extId: i.extId,
        normalizedName: i.normalizedName,
        types: i.types,
        categories: i.categories,
        propertiesType: i.propertiesType,
        width: toInt(i.width),
        height: toInt(i.height),
        weight: i.weight,
        basePrice: toInt(i.basePrice),
        avg24hPrice: toInt(i.avg24hPrice),
        low24hPrice: toInt(i.low24hPrice),
        lastScan: i.lastScan ? new Date(i.lastScan) : null,
        sourceUpdatedAt: i.sourceUpdatedAt ? new Date(i.sourceUpdatedAt) : null,
        images: i.images,
        properties: i.properties,
        conflictingCategories: i.conflictingCategories,
        conflictingSlotIds: i.conflictingSlotIds,
        minLevelForFlea: toInt(i.minLevelForFlea),
      })),
    );

    await insertChunked(
      tx,
      trader,
      dataset.traders.map((t) => ({
        datasetId,
        extId: t.extId,
        normalizedName: t.normalizedName,
        currency: t.currency,
        names: t.names,
        levels: t.levels,
      })),
    );
    await insertChunked(
      tx,
      traderOffer,
      dataset.items.flatMap((i) =>
        i.traderOffers.map((o, index) => ({
          datasetId,
          itemExtId: i.extId,
          sort: index,
          traderExtId: o.traderExtId,
          minTraderLevel: o.minTraderLevel,
          price: o.price,
          currency: o.currency,
          priceRub: toInt(o.priceRub),
          taskExtId: o.taskExtId,
          buyLimit: toInt(o.buyLimit),
        })),
      ),
    );
    await insertChunked(
      tx,
      barter,
      dataset.barters.map((b) => ({
        datasetId,
        extId: b.extId,
        traderExtId: b.traderExtId,
        minTraderLevel: b.minTraderLevel,
        taskExtId: b.taskExtId,
        buyLimit: toInt(b.buyLimit),
        offeredExtId: b.offered.itemExtId,
        offeredCount: b.offered.count,
        required: b.required,
      })),
    );
    await insertChunked(
      tx,
      task,
      dataset.tasks.map((t) => ({
        datasetId,
        extId: t.extId,
        traderExtId: t.traderExtId,
        minPlayerLevel: toInt(t.minPlayerLevel),
        wikiLink: t.wikiLink,
        names: t.names,
      })),
    );

    await insertChunked(
      tx,
      itemName,
      dataset.items.flatMap((i) =>
        (Object.entries(i.names) as [Lang, { name: string; shortName: string }][]).map(([lang, n]) => ({
          datasetId,
          extId: i.extId,
          lang,
          name: n.name,
          shortName: n.shortName,
        })),
      ),
    );

    await insertChunked(
      tx,
      slotName,
      dataset.slotNames.flatMap((s) =>
        Object.entries(s.names).map(([lang, name]) => ({ datasetId, key: s.key, lang, name: name as string })),
      ),
    );

    const slotRows: (typeof itemSlot.$inferInsert)[] = [];
    const allowedRows: (typeof slotAllowedItem.$inferInsert)[] = [];
    const filterRows: (typeof slotFilter.$inferInsert)[] = [];
    for (const i of dataset.items) {
      for (const s of i.slots) {
        slotRows.push({ datasetId, itemExtId: i.extId, slotExtId: s.extId, nameId: s.nameId, nameKey: s.nameKey, required: s.required, sort: s.sort });
        for (const a of s.filter.allowedItems) allowedRows.push({ datasetId, itemExtId: i.extId, slotExtId: s.extId, allowedExtId: a });
        for (const v of s.filter.allowedCategories) filterRows.push({ datasetId, itemExtId: i.extId, slotExtId: s.extId, rule: "allowed_category", value: v });
        for (const v of s.filter.excludedItems) filterRows.push({ datasetId, itemExtId: i.extId, slotExtId: s.extId, rule: "excluded_item", value: v });
        for (const v of s.filter.excludedCategories) filterRows.push({ datasetId, itemExtId: i.extId, slotExtId: s.extId, rule: "excluded_category", value: v });
      }
    }
    await insertChunked(tx, itemSlot, slotRows);
    await insertChunked(tx, slotAllowedItem, allowedRows);
    await insertChunked(tx, slotFilter, filterRows);

    await insertChunked(
      tx,
      itemConflict,
      dataset.items.flatMap((i) => i.conflictingItems.map((c) => ({ datasetId, itemExtId: i.extId, conflictingExtId: c }))),
    );
    await insertChunked(
      tx,
      itemContains,
      dataset.items.flatMap((i) =>
        i.contains.map((c, index) => ({ datasetId, itemExtId: i.extId, containedExtId: c.itemExtId, count: c.count, sort: index })),
      ),
    );

    await tx.insert(auditLog).values({
      actor: options.actor,
      action: "dataset.import",
      target: `item_dataset:${datasetId}`,
      details: {
        mode: dataset.mode,
        checksum: fetched.checksum,
        items: dataset.items.length,
        traderOffers: report.traderOfferCount,
        barters: report.barterCount,
        nameIssues: report.nameIssues,
        warnings: report.warnings,
      },
    });

    return { datasetId, report };
  });
}

export async function listDatasets(db: Database, mode?: GameMode) {
  return db
    .select({
      id: itemDataset.id,
      mode: itemDataset.mode,
      status: itemDataset.status,
      itemCount: itemDataset.itemCount,
      fetchedAt: itemDataset.fetchedAt,
      sourceUpdatedAt: itemDataset.sourceUpdatedAt,
      activatedAt: itemDataset.activatedAt,
      patch: gamePatch.label,
    })
    .from(itemDataset)
    .leftJoin(gamePatch, eq(gamePatch.id, itemDataset.patchId))
    .where(mode ? eq(itemDataset.mode, mode) : undefined)
    .orderBy(desc(itemDataset.id));
}

export async function getDataset(db: Database, id: number) {
  const [row] = await db
    .select({ dataset: itemDataset, patch: gamePatch.label })
    .from(itemDataset)
    .leftJoin(gamePatch, eq(gamePatch.id, itemDataset.patchId))
    .where(eq(itemDataset.id, id));
  return row ?? null;
}

async function requireDataset(tx: Tx, id: number) {
  const [row] = await tx.select().from(itemDataset).where(eq(itemDataset.id, id)).for("update");
  if (!row) throw new ImportRefusedError(`Datensatz #${id} existiert nicht.`);
  return row;
}

/** Gibt einen Vorschau-Datensatz frei. Der bisher aktive desselben Modus wird archiviert. */
export async function activateDataset(db: Database, id: number, patchLabel: string, actor: string): Promise<void> {
  const label = patchLabel.trim();
  if (!/^[0-9A-Za-z.\-_ ]{1,40}$/.test(label)) {
    throw new ImportRefusedError("Patch-Bezeichnung ungültig (1–40 Zeichen, Ziffern, Buchstaben, Punkt, Minus).");
  }
  await db.transaction(async (tx) => {
    const target = await requireDataset(tx, id);
    if (target.status !== "preview") {
      throw new ImportRefusedError(`Datensatz #${id} ist „${target.status}“, freigegeben werden kann nur eine Vorschau.`);
    }
    await tx.insert(gamePatch).values({ label }).onConflictDoNothing({ target: gamePatch.label });
    const [patch] = await tx.select({ id: gamePatch.id }).from(gamePatch).where(eq(gamePatch.label, label));

    const previous = await tx
      .update(itemDataset)
      .set({ status: "archived" })
      .where(and(eq(itemDataset.mode, target.mode), eq(itemDataset.status, "active")))
      .returning({ id: itemDataset.id });

    await tx
      .update(itemDataset)
      .set({ status: "active", patchId: patch!.id, activatedAt: sql`now()`, activatedBy: actor })
      .where(eq(itemDataset.id, id));

    await tx.insert(auditLog).values({
      actor,
      action: "dataset.activate",
      target: `item_dataset:${id}`,
      details: { patch: label, archived: previous.map((p) => p.id) },
    });
  });
}

/** Verwirft eine Vorschau und löscht ihre Item-Zeilen. Der Bericht bleibt erhalten. */
export async function discardDataset(db: Database, id: number, actor: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await requireDataset(tx, id);
    if (target.status !== "preview") {
      throw new ImportRefusedError(`Nur Vorschauen können verworfen werden, #${id} ist „${target.status}“.`);
    }
    for (const table of [
      itemContains,
      itemConflict,
      slotFilter,
      slotAllowedItem,
      itemSlot,
      slotName,
      itemName,
      traderOffer,
      barter,
      task,
      trader,
      item,
      datasetRaw,
    ]) {
      await tx.delete(table).where(eq(table.datasetId, id));
    }
    await tx.update(itemDataset).set({ status: "discarded" }).where(eq(itemDataset.id, id));
    await tx.insert(auditLog).values({ actor, action: "dataset.discard", target: `item_dataset:${id}`, details: {} });
  });
}

/** Macht den zuletzt aktiven, jetzt archivierten Datensatz wieder aktiv. */
export async function rollbackDataset(db: Database, mode: GameMode, actor: string): Promise<{ from: number; to: number }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(itemDataset)
      .where(and(eq(itemDataset.mode, mode), eq(itemDataset.status, "active")))
      .for("update");
    if (!current) throw new ImportRefusedError(`Für ${mode} ist kein Datensatz aktiv.`);

    const [previous] = await tx
      .select()
      .from(itemDataset)
      .where(and(eq(itemDataset.mode, mode), eq(itemDataset.status, "archived")))
      .orderBy(desc(itemDataset.activatedAt), desc(itemDataset.id))
      .limit(1)
      .for("update");
    if (!previous) throw new ImportRefusedError(`Für ${mode} gibt es keinen früheren Datensatz zum Zurückrollen.`);

    await tx.update(itemDataset).set({ status: "archived" }).where(eq(itemDataset.id, current.id));
    await tx.update(itemDataset).set({ status: "active", activatedAt: sql`now()`, activatedBy: actor }).where(eq(itemDataset.id, previous.id));
    await tx.insert(auditLog).values({
      actor,
      action: "dataset.rollback",
      target: `item_dataset:${previous.id}`,
      details: { mode, from: current.id, to: previous.id },
    });
    return { from: current.id, to: previous.id };
  });
}

/** Kurzinfo zu Items, z. B. zur Kontrolle eines Imports. */
export async function itemSummary(db: Database, datasetId: number, extIds: string[], lang: Lang = "de") {
  if (extIds.length === 0) return [];
  return db
    .select({ extId: item.extId, name: itemName.name, types: item.types })
    .from(item)
    .leftJoin(itemName, and(eq(itemName.datasetId, item.datasetId), eq(itemName.extId, item.extId), eq(itemName.lang, lang)))
    .where(and(eq(item.datasetId, datasetId), inArray(item.extId, extIds)));
}
