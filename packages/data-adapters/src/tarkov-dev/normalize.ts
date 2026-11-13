import {
  rawBartersFileSchema,
  rawItemSchema,
  rawItemsFileSchema,
  rawTasksFileSchema,
  rawTradersFileSchema,
  rawTranslationFileSchema,
} from "./raw-schema.ts";
import type { RawItem } from "./raw-schema.ts";
import type {
  GameMode,
  ItemName,
  Lang,
  NormalizedBarter,
  NormalizedDataset,
  NormalizedItem,
  NormalizedSlot,
  NormalizedTask,
  NormalizedTrader,
  SlotName,
} from "../types.ts";

export type TranslationTable = Map<string, string>;

export class SourceFormatError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "SourceFormatError";
  }
}

/** Liest eine Übersetzungsdatei (items_de, items_en) in eine flache Tabelle. */
export function parseTranslations(json: unknown): TranslationTable {
  const parsed = rawTranslationFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new SourceFormatError("Übersetzungsdatei hat ein unbekanntes Format", [parsed.error.message]);
  }
  const table: TranslationTable = new Map();
  for (const [key, value] of Object.entries(parsed.data.data)) {
    if (typeof value === "string") table.set(key, value);
  }
  return table;
}

function lookup(table: TranslationTable | undefined, key: string | null | undefined): string | null {
  if (!table || !key) return null;
  const value = table.get(key);
  return value && value !== key ? value : null;
}

function nameFor(item: RawItem, table: TranslationTable | undefined): ItemName | null {
  // Die Quelle liefert in items.json nur Schlüssel wie "<id> Name".
  const name = lookup(table, item.name ?? `${item.id} Name`);
  const shortName = lookup(table, item.shortName ?? `${item.id} ShortName`);
  if (!name) return null;
  return { name, shortName: shortName ?? name };
}

function toNullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface NormalizeInput {
  mode: GameMode;
  sourceUrl: string;
  fetchedAt: string;
  itemsJson: unknown;
  translations: Partial<Record<Lang, TranslationTable>>;
  /** traders-Datei der Quelle; fehlt sie, bleibt die Händlerliste leer. */
  tradersJson?: unknown;
  traderTranslations?: Partial<Record<Lang, TranslationTable>>;
  bartersJson?: unknown;
  tasksJson?: unknown;
  taskTranslations?: Partial<Record<Lang, TranslationTable>>;
}

function namesFrom(tables: Partial<Record<Lang, TranslationTable>> | undefined, key: string): Partial<Record<Lang, string>> {
  const names: Partial<Record<Lang, string>> = {};
  for (const lang of Object.keys(tables ?? {}) as Lang[]) {
    const value = lookup(tables?.[lang], key);
    if (value) names[lang] = value;
  }
  return names;
}

function normalizeTraders(input: NormalizeInput): NormalizedTrader[] {
  if (input.tradersJson === undefined) return [];
  const parsed = rawTradersFileSchema.safeParse(input.tradersJson);
  if (!parsed.success) throw new SourceFormatError("traders-Datei hat ein unbekanntes Format", [parsed.error.message]);
  return Object.values(parsed.data.data)
    .map((t) => ({
      extId: t.id,
      normalizedName: t.normalizedName,
      currency: t.currency ?? null,
      names: namesFrom(input.traderTranslations, t.name ?? `${t.id} Nickname`),
      levels: t.levels
        .map((l) => ({
          level: l.level,
          requiredPlayerLevel: l.requiredPlayerLevel,
          requiredReputation: l.requiredReputation,
          requiredCommerce: l.requiredCommerce,
        }))
        .sort((a, b) => a.level - b.level),
    }))
    .sort((a, b) => a.extId.localeCompare(b.extId));
}

function normalizeBarters(input: NormalizeInput): NormalizedBarter[] {
  if (input.bartersJson === undefined) return [];
  const parsed = rawBartersFileSchema.safeParse(input.bartersJson);
  if (!parsed.success) throw new SourceFormatError("barters-Datei hat ein unbekanntes Format", [parsed.error.message]);
  return parsed.data.data
    .map((b) => ({
      extId: b.id,
      traderExtId: b.trader,
      minTraderLevel: b.minTraderLevel,
      taskExtId: b.taskUnlock ?? null,
      buyLimit: toNullableNumber(b.buyLimit),
      offered: { itemExtId: b.offeredItem.item, count: b.offeredItem.count },
      required: b.requiredItems.map((r) => ({ itemExtId: r.item, count: r.count })),
    }))
    .sort((a, b) => a.extId.localeCompare(b.extId));
}

function normalizeTasks(input: NormalizeInput): NormalizedTask[] {
  if (input.tasksJson === undefined) return [];
  const parsed = rawTasksFileSchema.safeParse(input.tasksJson);
  if (!parsed.success) throw new SourceFormatError("tasks-Datei hat ein unbekanntes Format", [parsed.error.message]);
  return Object.values(parsed.data.data.tasks)
    .map((t) => ({
      extId: t.id,
      traderExtId: t.trader ?? null,
      minPlayerLevel: toNullableNumber(t.minPlayerLevel),
      wikiLink: t.wikiLink ?? null,
      names: namesFrom(input.taskTranslations, t.name ?? `${t.id} name`),
    }))
    .sort((a, b) => a.extId.localeCompare(b.extId));
}

export interface NormalizeResult {
  dataset: NormalizedDataset;
  /** Items, die das Schema nicht erfüllen; werden nicht importiert, aber gemeldet. */
  rejected: { id: string; reason: string }[];
}

export function normalizeTarkovDev(input: NormalizeInput): NormalizeResult {
  const file = rawItemsFileSchema.safeParse(input.itemsJson);
  if (!file.success) {
    throw new SourceFormatError("items-Datei hat ein unbekanntes Format", [file.error.message]);
  }

  const items: NormalizedItem[] = [];
  const rejected: { id: string; reason: string }[] = [];
  const slotKeys = new Set<string>();
  let newest: string | null = null;

  for (const [key, value] of Object.entries(file.data.data.items)) {
    const parsed = rawItemSchema.safeParse(value);
    if (!parsed.success) {
      rejected.push({ id: key, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      continue;
    }
    const raw = parsed.data;
    if (raw.updated && (!newest || raw.updated > newest)) newest = raw.updated;

    const { slots: rawSlots, ...restProperties } = raw.properties ?? {};
    const slots: NormalizedSlot[] = (rawSlots ?? []).map((slot, index) => {
      if (slot.name) slotKeys.add(slot.name);
      return {
        extId: slot.id,
        nameId: slot.nameId,
        nameKey: slot.name ?? null,
        required: slot.required === true,
        sort: index,
        filter: {
          allowedItems: [...new Set(slot.filters?.allowedItems ?? [])],
          allowedCategories: [...new Set(slot.filters?.allowedCategories ?? [])],
          excludedItems: [...new Set(slot.filters?.excludedItems ?? [])],
          excludedCategories: [...new Set(slot.filters?.excludedCategories ?? [])],
        },
      };
    });

    const names: Partial<Record<Lang, ItemName>> = {};
    for (const lang of Object.keys(input.translations) as Lang[]) {
      const n = nameFor(raw, input.translations[lang]);
      if (n) names[lang] = n;
    }

    items.push({
      extId: raw.id,
      normalizedName: raw.normalizedName,
      types: raw.types,
      categories: raw.categories,
      propertiesType: raw.properties?.propertiesType ?? null,
      width: toNullableNumber(raw.width),
      height: toNullableNumber(raw.height),
      weight: toNullableNumber(raw.weight),
      basePrice: toNullableNumber(raw.basePrice),
      avg24hPrice: toNullableNumber(raw.avg24hPrice),
      low24hPrice: toNullableNumber(raw.low24hPrice),
      lastScan: raw.lastScan ?? null,
      sourceUpdatedAt: raw.updated ?? null,
      images: {
        icon: raw.iconLink ?? null,
        grid: raw.gridImageLink ?? null,
        base: raw.baseImageLink ?? null,
        inspect: raw.inspectImageLink ?? null,
        image512: raw.image512pxLink ?? null,
        image8x: raw.image8xLink ?? null,
      },
      properties: restProperties as Record<string, unknown>,
      slots,
      conflictingItems: [...new Set(raw.conflictingItems)],
      conflictingCategories: [...new Set(raw.conflictingCategories)],
      conflictingSlotIds: [...new Set(raw.conflictingSlotIds)],
      contains: raw.containsItems.map((c) => ({ itemExtId: c.item, count: c.count })),
      names,
      minLevelForFlea: toNullableNumber(raw.minLevelForFlea),
      traderOffers: raw.buyFromTrader.map((o) => ({
        traderExtId: o.trader,
        minTraderLevel: o.minTraderLevel,
        price: o.price,
        currency: o.currency,
        priceRub: toNullableNumber(o.priceRUB),
        taskExtId: o.taskUnlock ?? null,
        buyLimit: toNullableNumber(o.buyLimit),
      })),
    });
  }

  const slotNames: SlotName[] = [...slotKeys].sort().map((key) => {
    const names: Partial<Record<Lang, string>> = {};
    for (const lang of Object.keys(input.translations) as Lang[]) {
      const value = lookup(input.translations[lang], key);
      if (value) names[lang] = value;
    }
    return { key, names };
  });

  items.sort((a, b) => a.extId.localeCompare(b.extId));

  return {
    dataset: {
      mode: input.mode,
      source: "tarkov.dev",
      sourceUrl: input.sourceUrl,
      fetchedAt: input.fetchedAt,
      sourceUpdatedAt: newest,
      items,
      slotNames,
      fleaMinPlayerLevel: toNullableNumber(file.data.data.fleaMarket?.minPlayerLevel),
      categories: Object.values(file.data.data.itemCategories ?? {})
        .map((c) => ({
          extId: c.id,
          normalizedName: c.normalizedName,
          parentExtId: c.parent ?? null,
          names: namesFrom(input.translations, c.name ?? `${c.id} Name`),
        }))
        .sort((a, b) => a.extId.localeCompare(b.extId)),
      traders: normalizeTraders(input),
      tasks: normalizeTasks(input),
      barters: normalizeBarters(input),
    },
    rejected,
  };
}
