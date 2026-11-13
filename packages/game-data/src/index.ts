import { and, eq, inArray } from "drizzle-orm";
import { createGameData, itemFromPlain, type GameData, type PlainItem, type PlainSlot } from "@tbh/compat-engine";
import type { NormalizedDataset, NormalizedItem } from "@tbh/data-adapters";
import { item, itemConflict, itemDataset, itemSlot, slotAllowedItem, slotFilter, type Database } from "@tbh/db";

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Preis für Summen: Flohmarkt-Durchschnitt der letzten 24 h laut Quelle. */
function priceOf(avg24h: number | null): number | null {
  return avg24h !== null && avg24h > 0 ? avg24h : null;
}

function plainFromNormalized(i: NormalizedItem): PlainItem {
  return {
    id: i.extId,
    categories: i.categories,
    slots: i.slots.map((s) => ({
      id: s.extId,
      nameId: s.nameId,
      required: s.required,
      allowedItems: s.filter.allowedItems,
      allowedCategories: s.filter.allowedCategories,
      excludedItems: s.filter.excludedItems,
      excludedCategories: s.filter.excludedCategories,
    })),
    conflictingItems: i.conflictingItems,
    conflictingCategories: i.conflictingCategories,
    conflictingSlotIds: i.conflictingSlotIds,
    modifiers: {
      ergonomics: num(i.properties["ergonomics"]),
      recoilModifier: num(i.properties["recoilModifier"]),
      weight: i.weight,
      price: priceOf(i.avg24hPrice),
    },
  };
}

/** GameData direkt aus einem normalisierten Datensatz (Tests, Vorschau vor dem Import). */
export function gameDataFromNormalized(datasetId: string | number, dataset: NormalizedDataset): GameData {
  return createGameData(datasetId, dataset.items.map((i) => itemFromPlain(plainFromNormalized(i))));
}

/**
 * Lädt einen gespeicherten Datensatz vollständig in den Speicher.
 * Etwa 5.500 Items und 41.000 Verweise – passt bequem in den Arbeitsspeicher und wird je Datensatz gecacht.
 */
export async function loadGameData(db: Database, datasetId: number): Promise<GameData> {
  const [ds] = await db.select({ id: itemDataset.id }).from(itemDataset).where(eq(itemDataset.id, datasetId));
  if (!ds) throw new Error(`Datensatz #${datasetId} existiert nicht.`);

  const [items, slots, allowed, filters, conflicts] = await Promise.all([
    db
      .select({
        extId: item.extId,
        categories: item.categories,
        weight: item.weight,
        avg24hPrice: item.avg24hPrice,
        properties: item.properties,
        conflictingCategories: item.conflictingCategories,
        conflictingSlotIds: item.conflictingSlotIds,
      })
      .from(item)
      .where(eq(item.datasetId, datasetId)),
    db.select().from(itemSlot).where(eq(itemSlot.datasetId, datasetId)),
    db
      .select({ itemExtId: slotAllowedItem.itemExtId, slotExtId: slotAllowedItem.slotExtId, allowedExtId: slotAllowedItem.allowedExtId })
      .from(slotAllowedItem)
      .where(eq(slotAllowedItem.datasetId, datasetId)),
    db.select().from(slotFilter).where(eq(slotFilter.datasetId, datasetId)),
    db
      .select({ itemExtId: itemConflict.itemExtId, conflictingExtId: itemConflict.conflictingExtId })
      .from(itemConflict)
      .where(eq(itemConflict.datasetId, datasetId)),
  ]);

  const slotKey = (itemId: string, slotId: string) => `${itemId}\u0000${slotId}`;
  const slotMap = new Map<string, PlainSlot & { sort: number; itemExtId: string }>();
  for (const s of slots) {
    slotMap.set(slotKey(s.itemExtId, s.slotExtId), {
      id: s.slotExtId,
      nameId: s.nameId,
      required: s.required,
      sort: s.sort,
      itemExtId: s.itemExtId,
      allowedItems: [],
      allowedCategories: [],
      excludedItems: [],
      excludedCategories: [],
    });
  }
  for (const a of allowed) (slotMap.get(slotKey(a.itemExtId, a.slotExtId))?.allowedItems as string[] | undefined)?.push(a.allowedExtId);
  for (const f of filters) {
    const target = slotMap.get(slotKey(f.itemExtId, f.slotExtId));
    if (!target) continue;
    const list = (f.rule === "allowed_category" ? target.allowedCategories : f.rule === "excluded_item" ? target.excludedItems : target.excludedCategories) as string[];
    list.push(f.value);
  }
  const slotsByItem = new Map<string, (PlainSlot & { sort: number })[]>();
  for (const s of slotMap.values()) {
    const list = slotsByItem.get(s.itemExtId) ?? [];
    list.push(s);
    slotsByItem.set(s.itemExtId, list);
  }
  const conflictsByItem = new Map<string, string[]>();
  for (const c of conflicts) {
    const list = conflictsByItem.get(c.itemExtId) ?? [];
    list.push(c.conflictingExtId);
    conflictsByItem.set(c.itemExtId, list);
  }

  return createGameData(
    datasetId,
    items.map((i) => {
      const props = i.properties as Record<string, unknown>;
      return itemFromPlain({
        id: i.extId,
        categories: i.categories,
        slots: (slotsByItem.get(i.extId) ?? []).sort((a, b) => a.sort - b.sort),
        conflictingItems: conflictsByItem.get(i.extId) ?? [],
        conflictingCategories: i.conflictingCategories,
        conflictingSlotIds: i.conflictingSlotIds,
        modifiers: {
          ergonomics: num(props["ergonomics"]),
          recoilModifier: num(props["recoilModifier"]),
          weight: i.weight,
          price: priceOf(i.avg24hPrice),
        },
      });
    }),
  );
}

/** Aktiven Datensatz eines Modus finden. */
export async function activeDatasetId(db: Database, mode: "pvp" | "pve"): Promise<number | null> {
  const [row] = await db
    .select({ id: itemDataset.id })
    .from(itemDataset)
    .where(and(eq(itemDataset.mode, mode), inArray(itemDataset.status, ["active"])));
  return row?.id ?? null;
}

export * from "./procurement.ts";
export { sourcesFromNormalized } from "./sources.ts";
export { loadProcurementData, type ProcurementData } from "./procurement-db.ts";
export {
  loadDisplayNames,
  listNameOverrides,
  setNameOverride,
  removeNameOverride,
  validateOverrideValue,
  NameOverrideError,
  type DisplayName,
  type NameField,
  type NameLang,
  type Actor,
} from "./names.ts";
