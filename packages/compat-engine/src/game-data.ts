import type { GameData, ItemDef, Modifiers, SlotDef } from "./types.js";

/** Einfache GameData aus einer Liste von Items. */
export function createGameData(datasetId: string | number, items: Iterable<ItemDef>): GameData {
  const byId = new Map<string, ItemDef>();
  for (const item of items) byId.set(item.id, item);
  return {
    datasetId,
    getItem: (id) => byId.get(id),
    items: () => byId.values(),
  };
}

export interface PlainSlot {
  id: string;
  nameId: string;
  required: boolean;
  allowedItems?: readonly string[];
  allowedCategories?: readonly string[];
  excludedItems?: readonly string[];
  excludedCategories?: readonly string[];
}

export interface PlainItem {
  id: string;
  categories?: readonly string[];
  slots?: readonly PlainSlot[];
  conflictingItems?: readonly string[];
  conflictingCategories?: readonly string[];
  conflictingSlotIds?: readonly string[];
  modifiers?: Partial<Modifiers>;
}

/** Wandelt serialisierbare Daten (z. B. aus JSON oder der Datenbank) in ItemDef um. */
export function itemFromPlain(plain: PlainItem): ItemDef {
  const slots: SlotDef[] = (plain.slots ?? []).map((s) => ({
    id: s.id,
    nameId: s.nameId,
    required: s.required,
    allowedItems: new Set(s.allowedItems ?? []),
    allowedCategories: new Set(s.allowedCategories ?? []),
    excludedItems: new Set(s.excludedItems ?? []),
    excludedCategories: new Set(s.excludedCategories ?? []),
  }));
  return {
    id: plain.id,
    categories: plain.categories ?? [],
    slots,
    conflictingItems: new Set(plain.conflictingItems ?? []),
    conflictingCategories: new Set(plain.conflictingCategories ?? []),
    conflictingSlotIds: new Set(plain.conflictingSlotIds ?? []),
    modifiers: {
      ergonomics: plain.modifiers?.ergonomics ?? null,
      recoilModifier: plain.modifiers?.recoilModifier ?? null,
      weight: plain.modifiers?.weight ?? null,
      price: plain.modifiers?.price ?? null,
    },
  };
}
