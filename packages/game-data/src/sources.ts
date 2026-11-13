import type { NormalizedDataset } from "@tbh/data-adapters";
import type { ItemSources, Offer, ProcurementContext, TraderInfo } from "./procurement.ts";

/** Beschaffungsdaten direkt aus einem normalisierten Datensatz (Tests, Vorschau). */
export function sourcesFromNormalized(dataset: NormalizedDataset): { context: ProcurementContext; sources: Map<string, ItemSources> } {
  const traders = new Map<string, TraderInfo>(
    dataset.traders.map((t) => [
      t.extId,
      { id: t.extId, names: t.names, levels: t.levels.map((l) => ({ level: l.level, requiredPlayerLevel: l.requiredPlayerLevel, requiredReputation: l.requiredReputation })) },
    ]),
  );
  const barters = new Map<string, Offer[]>();
  for (const b of dataset.barters) {
    const list = barters.get(b.offered.itemExtId) ?? [];
    list.push({ kind: "barter", traderId: b.traderExtId, traderLevel: b.minTraderLevel, taskId: b.taskExtId, price: null, currency: null, priceRub: null, buyLimit: b.buyLimit });
    barters.set(b.offered.itemExtId, list);
  }
  const sources = new Map<string, ItemSources>();
  for (const i of dataset.items) {
    const buy: Offer[] = i.traderOffers.map((o) => ({
      kind: "buy",
      traderId: o.traderExtId,
      traderLevel: o.minTraderLevel,
      taskId: o.taskExtId,
      price: o.price,
      currency: o.currency,
      priceRub: o.priceRub,
      buyLimit: o.buyLimit,
    }));
    sources.set(i.extId, { itemId: i.extId, offers: [...buy, ...(barters.get(i.extId) ?? [])], fleaLevel: i.minLevelForFlea, noFlea: i.types.includes("noFlea") });
  }
  return { context: { traders, fleaMinPlayerLevel: dataset.fleaMinPlayerLevel }, sources };
}
