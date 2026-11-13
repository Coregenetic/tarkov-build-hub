/**
 * Datenform, die die Engine braucht. Bewusst unabhängig von Datenbank und Quelle:
 * Server und Browser füllen sie aus demselben Datensatz.
 */

export interface SlotDef {
  /** Slot-ID aus der Quelle, eindeutig je Eltern-Item. */
  id: string;
  /** Technischer Name, z. B. "mod_muzzle". */
  nameId: string;
  required: boolean;
  allowedItems: ReadonlySet<string>;
  allowedCategories: ReadonlySet<string>;
  excludedItems: ReadonlySet<string>;
  excludedCategories: ReadonlySet<string>;
}

export interface Modifiers {
  ergonomics: number | null;
  /** Rückstoß-Modifikator als Anteil, z. B. -0.04 für −4 %. */
  recoilModifier: number | null;
  weight: number | null;
  price: number | null;
}

export interface ItemDef {
  id: string;
  /** Kategorien inklusive aller übergeordneten, wie die Quelle sie liefert. */
  categories: readonly string[];
  slots: readonly SlotDef[];
  /** Items, mit denen dieses Item nicht zusammen verbaut werden kann (oft nur einseitig eingetragen). */
  conflictingItems: ReadonlySet<string>;
  conflictingCategories: ReadonlySet<string>;
  /** Slots, die dieses Item blockiert, sobald es verbaut ist. */
  conflictingSlotIds: ReadonlySet<string>;
  modifiers: Modifiers;
}

export interface GameData {
  /** Kennung des Datensatzes, gegen den geprüft wird. */
  readonly datasetId: string | number;
  getItem(id: string): ItemDef | undefined;
  items(): Iterable<ItemDef>;
}

/** Ein Knoten im Build: ein verbautes Item und was in seinen Slots steckt (Schlüssel = Slot-ID). */
export interface BuildNode {
  itemId: string;
  slots?: Readonly<Record<string, BuildNode>>;
}

/** Weg vom Wurzel-Item zu einem Knoten als Folge von Slot-IDs. Leer = die Waffe selbst. */
export type BuildPath = readonly string[];

export type IssueCode =
  | "unknown_item"
  | "unknown_slot"
  | "parent_unknown"
  | "not_allowed"
  | "excluded"
  | "conflict_item"
  | "conflict_category"
  | "blocked_slot"
  | "missing_required";

export type Severity = "error" | "incomplete";

export interface Issue {
  code: IssueCode;
  severity: Severity;
  /** Knoten, an dem das Problem angezeigt wird. */
  path: BuildPath;
  itemId: string | null;
  /** Betroffener Slot (Eltern-Slot bzw. fehlender Pflicht-Slot). */
  slotId: string | null;
  slotNameId: string | null;
  parentItemId: string | null;
  /** Gegenstück bei Konflikten und Sperren. */
  otherItemId: string | null;
  otherPath: BuildPath | null;
}

export type NodeStatus = "ok" | "error" | "unknown";

export interface NodeReport {
  path: BuildPath;
  itemId: string;
  parentItemId: string | null;
  slotId: string | null;
  slotNameId: string | null;
  status: NodeStatus;
  issues: Issue[];
}

export interface ValidationResult {
  datasetId: string | number;
  /** Keine Kompatibilitätsfehler. */
  valid: boolean;
  /** Alle Pflicht-Slots belegt (Waffe funktionsfähig). */
  complete: boolean;
  issues: Issue[];
  nodes: NodeReport[];
}
