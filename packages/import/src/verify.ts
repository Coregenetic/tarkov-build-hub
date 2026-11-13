import { and, eq } from "drizzle-orm";
import { assembleFromParts, validateBuild, type Issue } from "@tbh/compat-engine";
import { item, itemContains, itemName, type Database } from "@tbh/db";
import { loadGameData } from "@tbh/game-data";

export interface PresetCheck {
  presetId: string;
  name: string | null;
  baseItemId: string;
  valid: boolean;
  complete: boolean;
  /** Anbauteile ohne passenden Slot (Munition zählt nicht dazu). */
  leftover: string[];
  issues: Issue[];
}

export interface PresetVerification {
  datasetId: number;
  /** Nur Presets, deren Basis eine Waffe ist. Westen, Helme usw. gehören nicht zum Gunsmith. */
  total: number;
  valid: number;
  complete: number;
  fullyAssembled: number;
  /** Patronen in Presets – sie stecken im Magazin, nicht in einem Anbau-Slot. */
  ammoRounds: number;
  skippedNonWeapon: number;
  problems: PresetCheck[];
}

/**
 * Prüft alle Waffen-Presets eines Datensatzes mit der Kompatibilitäts-Engine.
 * Presets sind vom Spiel zusammengestellte Waffen – sie müssen gültig sein.
 * Jede Abweichung zeigt entweder einen Fehler der Engine oder der Daten.
 */
export async function verifyPresets(db: Database, datasetId: number, lang = "de"): Promise<PresetVerification> {
  const data = await loadGameData(db, datasetId);
  const rows = await db
    .select({ extId: item.extId, types: item.types, properties: item.properties, name: itemName.name })
    .from(item)
    .leftJoin(itemName, and(eq(itemName.datasetId, item.datasetId), eq(itemName.extId, item.extId), eq(itemName.lang, lang)))
    .where(eq(item.datasetId, datasetId));
  const typesById = new Map(rows.map((r) => [r.extId, r.types]));
  const presets = rows.filter((r) => r.types.includes("preset"));

  const contains = await db
    .select({ itemExtId: itemContains.itemExtId, containedExtId: itemContains.containedExtId, count: itemContains.count, sort: itemContains.sort })
    .from(itemContains)
    .where(eq(itemContains.datasetId, datasetId));
  const parts = new Map<string, { id: string; count: number }[]>();
  for (const c of contains.sort((a, b) => a.sort - b.sort)) {
    const list = parts.get(c.itemExtId) ?? [];
    list.push({ id: c.containedExtId, count: c.count });
    parts.set(c.itemExtId, list);
  }

  const result: PresetVerification = {
    datasetId,
    total: 0,
    valid: 0,
    complete: 0,
    fullyAssembled: 0,
    ammoRounds: 0,
    skippedNonWeapon: 0,
    problems: [],
  };

  for (const p of presets) {
    const baseItemId = (p.properties as Record<string, unknown>)["baseItem"];
    if (typeof baseItemId !== "string" || !typesById.get(baseItemId)?.includes("gun")) {
      result.skippedNonWeapon++;
      continue;
    }
    result.total++;
    const modParts: string[] = [];
    for (const part of parts.get(p.extId) ?? []) {
      if (part.id === baseItemId) continue;
      if (typesById.get(part.id)?.includes("ammo")) {
        result.ammoRounds += part.count;
        continue;
      }
      for (let i = 0; i < part.count; i++) modParts.push(part.id);
    }
    const { build, leftover } = assembleFromParts(data, baseItemId, modParts);
    const check = validateBuild(data, build);
    if (check.valid) result.valid++;
    if (check.complete) result.complete++;
    if (leftover.length === 0) result.fullyAssembled++;
    if (!check.valid || !check.complete || leftover.length > 0) {
      result.problems.push({ presetId: p.extId, name: p.name, baseItemId, valid: check.valid, complete: check.complete, leftover, issues: check.issues });
    }
  }
  return result;
}
