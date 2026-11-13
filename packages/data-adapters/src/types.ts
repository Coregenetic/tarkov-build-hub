/**
 * Normalisierte, quellenunabhängige Spieldaten.
 * Jeder Adapter (heute: tarkov.dev) liefert genau diese Form.
 * Nichts hier wird geraten: Felder, die die Quelle nicht liefert, sind null.
 */

export type GameMode = "pvp" | "pve";
export type Lang = "de" | "en";
export const LANGS: readonly Lang[] = ["de", "en"] as const;

export interface ItemName {
  name: string;
  shortName: string;
}

export interface SlotFilter {
  allowedItems: string[];
  allowedCategories: string[];
  excludedItems: string[];
  excludedCategories: string[];
}

export interface NormalizedSlot {
  /** ID des Slots aus der Quelle (eindeutig je Eltern-Item). */
  extId: string;
  /** Technischer Slot-Name, z. B. "mod_muzzle". */
  nameId: string;
  /** Übersetzungsschlüssel des Anzeigenamens, z. B. "MOD_MUZZLE". */
  nameKey: string | null;
  required: boolean;
  sort: number;
  filter: SlotFilter;
}

export interface ImageLinks {
  icon: string | null;
  grid: string | null;
  base: string | null;
  inspect: string | null;
  image512: string | null;
  image8x: string | null;
}

/** Kaufangebot eines Händlers (buyFromTrader). */
export interface TraderOffer {
  traderExtId: string;
  minTraderLevel: number;
  price: number;
  currency: string;
  priceRub: number | null;
  /** Aufgabe, die das Angebot freischaltet, sonst null. */
  taskExtId: string | null;
  buyLimit: number | null;
}

export interface NormalizedItem {
  extId: string;
  normalizedName: string;
  types: string[];
  categories: string[];
  propertiesType: string | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  basePrice: number | null;
  avg24hPrice: number | null;
  low24hPrice: number | null;
  lastScan: string | null;
  sourceUpdatedAt: string | null;
  images: ImageLinks;
  /** Alle übrigen Eigenschaften unverändert, ohne Slots (die sind normalisiert). */
  properties: Record<string, unknown>;
  slots: NormalizedSlot[];
  conflictingItems: string[];
  conflictingCategories: string[];
  conflictingSlotIds: string[];
  /** Enthaltene Items (z. B. Teile eines Presets). */
  contains: { itemExtId: string; count: number }[];
  names: Partial<Record<Lang, ItemName>>;
  /** Eigene Flohmarkt-Sperre des Items laut Quelle (0 = keine eigene Sperre). */
  minLevelForFlea: number | null;
  traderOffers: TraderOffer[];
}

export interface TraderLevel {
  level: number;
  requiredPlayerLevel: number;
  requiredReputation: number;
  requiredCommerce: number;
}

export interface NormalizedCategory {
  extId: string;
  normalizedName: string;
  parentExtId: string | null;
  names: Partial<Record<Lang, string>>;
}

export interface NormalizedTrader {
  extId: string;
  normalizedName: string;
  currency: string | null;
  names: Partial<Record<Lang, string>>;
  levels: TraderLevel[];
}

export interface NormalizedTask {
  extId: string;
  traderExtId: string | null;
  minPlayerLevel: number | null;
  wikiLink: string | null;
  names: Partial<Record<Lang, string>>;
}

export interface ItemCount {
  itemExtId: string;
  count: number;
}

/** Tauschangebot eines Händlers. */
export interface NormalizedBarter {
  extId: string;
  traderExtId: string;
  minTraderLevel: number;
  taskExtId: string | null;
  buyLimit: number | null;
  offered: ItemCount;
  required: ItemCount[];
}

export interface SlotName {
  key: string;
  names: Partial<Record<Lang, string>>;
}

export interface NormalizedDataset {
  mode: GameMode;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  /** Jüngstes "updated" aller Items laut Quelle. */
  sourceUpdatedAt: string | null;
  items: NormalizedItem[];
  slotNames: SlotName[];
  /** Allgemeine Flohmarkt-Freischaltung (Spielerlevel) laut Quelle. */
  fleaMinPlayerLevel: number | null;
  categories: NormalizedCategory[];
  traders: NormalizedTrader[];
  tasks: NormalizedTask[];
  barters: NormalizedBarter[];
}

export interface RawPayloads {
  items: Uint8Array;
  translations: Partial<Record<Lang, Uint8Array>>;
  /** Weitere Dateien der Quelle: traders, traders_de, barters, tasks … */
  extra: Record<string, Uint8Array>;
}

export interface FetchedDataset {
  dataset: NormalizedDataset;
  raw: RawPayloads;
  /** SHA-256 über alle Rohdaten, um identische Importe zu erkennen. */
  checksum: string;
}
