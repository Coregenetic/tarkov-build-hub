import { and, eq, inArray } from "drizzle-orm";
import { barter, item, itemDataset, trader, traderOffer, type Database } from "@tbh/db";
import type { ItemSources, Offer, TraderInfo } from "./procurement.ts";

/** Serialisierbare Beschaffungsdaten (für Server-Komponenten und den Browser). */
export interface ProcurementData {
  traders: TraderInfo[];
  fleaMinPlayerLevel: number | null;
  sources: ItemSources[];
}

export async function loadProcurementData(db: Database, datasetId: number, extIds: readonly string[]): Promise<ProcurementData> {
  const ids = [...new Set(extIds)];
  const [ds] = await db.select({ flea: itemDataset.fleaMinPlayerLevel }).from(itemDataset).where(eq(itemDataset.id, datasetId));
  if (!ds) throw new Error(`Datensatz #${datasetId} existiert nicht.`);
  if (ids.length === 0) return { traders: [], fleaMinPlayerLevel: ds.flea, sources: [] };

  const [traders, items, offers, barters] = await Promise.all([
    db.select().from(trader).where(eq(trader.datasetId, datasetId)),
    db
      .select({ extId: item.extId, types: item.types, flea: item.minLevelForFlea })
      .from(item)
      .where(and(eq(item.datasetId, datasetId), inArray(item.extId, ids))),
    db
      .select()
      .from(traderOffer)
      .where(and(eq(traderOffer.datasetId, datasetId), inArray(traderOffer.itemExtId, ids)))
      .orderBy(traderOffer.itemExtId, traderOffer.sort),
    db
      .select()
      .from(barter)
      .where(and(eq(barter.datasetId, datasetId), inArray(barter.offeredExtId, ids)))
      .orderBy(barter.extId),
  ]);

  const offersByItem = new Map<string, Offer[]>();
  const push = (id: string, o: Offer) => {
    const list = offersByItem.get(id) ?? [];
    list.push(o);
    offersByItem.set(id, list);
  };
  for (const o of offers) {
    push(o.itemExtId, { kind: "buy", traderId: o.traderExtId, traderLevel: o.minTraderLevel, taskId: o.taskExtId, price: o.price, currency: o.currency, priceRub: o.priceRub, buyLimit: o.buyLimit });
  }
  for (const b of barters) {
    push(b.offeredExtId, { kind: "barter", traderId: b.traderExtId, traderLevel: b.minTraderLevel, taskId: b.taskExtId, price: null, currency: null, priceRub: null, buyLimit: b.buyLimit });
  }

  type Level = { level: number; requiredPlayerLevel: number; requiredReputation: number };
  return {
    fleaMinPlayerLevel: ds.flea,
    traders: traders.map((t) => ({
      id: t.extId,
      names: t.names as TraderInfo["names"],
      levels: (t.levels as Level[]).map((l) => ({ level: l.level, requiredPlayerLevel: l.requiredPlayerLevel, requiredReputation: l.requiredReputation })),
    })),
    sources: items.map((i) => ({ itemId: i.extId, offers: offersByItem.get(i.extId) ?? [], fleaLevel: i.flea, noFlea: i.types.includes("noFlea") })),
  };
}
