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
}

export interface RawPayloads {
  items: Uint8Array;
  translations: Partial<Record<Lang, Uint8Array>>;
}

export interface FetchedDataset {
  dataset: NormalizedDataset;
  raw: RawPayloads;
  /** SHA-256 über alle Rohdaten, um identische Importe zu erkennen. */
  checksum: string;
}
