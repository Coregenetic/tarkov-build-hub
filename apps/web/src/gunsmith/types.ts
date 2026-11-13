/**
 * Daten, die der Gunsmith im Browser braucht. Alles echt aus dem aktiven Datensatz,
 * vom Server zusammengestellt (siehe lib/gunsmith-server.ts).
 */
import type { BuildNode, PlainItem } from "@tbh/compat-engine";
import type { Offer, TraderInfo } from "@tbh/game-data/procurement";

export type Lang = "de" | "en";
export type NamePair = { name: string; short: string };

export interface BundleSlot {
  id: string;
  nameId: string;
  nameKey: string | null;
}

export interface BundleItem {
  /** Für die Kompatibilitäts-Engine. */
  plain: PlainItem;
  names: Partial<Record<Lang, NamePair>>;
  /** Freigestelltes Bild für die Aufbauansicht. */
  img: string | null;
  /** Größeres Bild für Karten. */
  img512: string | null;
  /** Inventargröße in Feldern. */
  w: number;
  h: number;
  weight: number | null;
  /** Flohmarkt Ø 24 h in Rubel, null = kein Preis in den Daten. */
  price: number | null;
  ergonomics: number | null;
  recoilModifier: number | null;
  accuracyModifier: number | null;
  slots: BundleSlot[];
  /** Nur bei Magazinen: erlaubte Munition (Schnittmenge mit der Waffe). */
  allowedAmmo?: string[];
  capacity?: number | null;
}

export interface AmmoInfo {
  id: string;
  names: Partial<Record<Lang, NamePair>>;
  img: string | null;
  damage: number | null;
  penetration: number | null;
  armorDamage: number | null;
  /** Anteil, z. B. 0.05 = +5 %. */
  recoilModifier: number | null;
  accuracyModifier: number | null;
  speed: number | null;
  projectiles: number | null;
  tracer: boolean;
  price: number | null;
}

export interface WeaponBase {
  id: string;
  ergonomics: number | null;
  recoilVertical: number | null;
  recoilHorizontal: number | null;
  caliber: string | null;
  fireRate: number | null;
  defaultAmmo: string | null;
  allowedAmmo: string[];
}

export interface ItemSourcesLite {
  offers: readonly Offer[];
  fleaLevel: number | null;
  noFlea: boolean;
}

export interface WeaponBundle {
  datasetId: number;
  mode: "pvp" | "pve";
  patch: string | null;
  dataAsOf: string;
  weapon: WeaponBase;
  items: Record<string, BundleItem>;
  ammo: AmmoInfo[];
  slotNames: Record<string, Partial<Record<Lang, string>>>;
  defaultBuild: BuildNode;
  /** Vorlagen des Spiels für diese Waffe. */
  presets: { id: string; names: Partial<Record<Lang, NamePair>>; build: BuildNode }[];
  procurement: {
    traders: TraderInfo[];
    fleaMinPlayerLevel: number | null;
    sources: Record<string, ItemSourcesLite>;
    taskNames: Record<string, Partial<Record<Lang, string>>>;
  };
}
