import { and, eq, inArray } from "drizzle-orm";
import { validateBuild, type BuildNode, type GameData, type Issue } from "@tbh/compat-engine";
import { item, type Database } from "@tbh/db";
import { loadProcurementData, summarizeProcurement, type ProcurementSummary } from "@tbh/game-data";
import { allowedAmmoFor, computeStats, type BuildStats, type StatItem } from "@tbh/game-data/stats";
import { collectIds } from "./input.ts";

export interface Evaluation {
  datasetId: number;
  valid: boolean;
  complete: boolean;
  issues: Issue[];
  /** Waffe ist im Datensatz eine Waffe. */
  isWeapon: boolean;
  ammoAllowed: boolean;
  allowedAmmo: string[];
  stats: BuildStats;
  procurement: ProcurementSummary;
  partIds: string[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Bewertet einen Teilebaum gegen einen Datensatz – verbindlich, auf dem Server.
 * Dieselbe Engine und dieselbe Werte-Rechnung wie im Browser.
 */
export async function evaluateTree(db: Database, data: GameData, datasetId: number, tree: BuildNode, ammo: string | null): Promise<Evaluation> {
  const partIds = [...new Set(collectIds(tree))];
  const ids = ammo ? [...partIds, ammo] : partIds;
  const rows = await db
    .select({ extId: item.extId, types: item.types, weight: item.weight, avg24hPrice: item.avg24hPrice, properties: item.properties })
    .from(item)
    .where(and(eq(item.datasetId, datasetId), inArray(item.extId, ids)));
  const byId = new Map(rows.map((r) => [r.extId, r]));

  const items: Record<string, StatItem> = {};
  for (const r of rows) {
    const p = r.properties as Record<string, unknown>;
    items[r.extId] = {
      ergonomics: num(p["ergonomics"]),
      recoilModifier: num(p["recoilModifier"]),
      accuracyModifier: num(p["accuracyModifier"]),
      weight: r.weight,
      price: r.avg24hPrice && r.avg24hPrice > 0 ? r.avg24hPrice : null,
      ...(p["propertiesType"] === "ItemPropertiesMagazine" ? { allowedAmmo: strings(p["allowedAmmo"]) } : {}),
    };
  }
  const weaponRow = byId.get(tree.itemId);
  const wp = (weaponRow?.properties ?? {}) as Record<string, unknown>;
  const weapon = {
    ergonomics: num(wp["ergonomics"]),
    recoilVertical: num(wp["recoilVertical"]),
    recoilHorizontal: num(wp["recoilHorizontal"]),
    allowedAmmo: strings(wp["allowedAmmo"]),
  };
  const ammoRow = ammo ? byId.get(ammo) : undefined;
  const ammoProps = (ammoRow?.properties ?? {}) as Record<string, unknown>;
  const ammoStats = ammoRow?.types.includes("ammo") ? { recoilModifier: num(ammoProps["recoilModifier"]), accuracyModifier: num(ammoProps["accuracyModifier"]) } : null;

  const validation = validateBuild(data, tree);
  const allowedAmmo = allowedAmmoFor(tree, items, weapon);
  const procurementData = await loadProcurementData(db, datasetId, ids);
  const procurement = summarizeProcurement(
    { traders: new Map(procurementData.traders.map((t) => [t.id, t])), fleaMinPlayerLevel: procurementData.fleaMinPlayerLevel },
    ids.map((id) => procurementData.sources.find((s) => s.itemId === id) ?? { itemId: id, offers: [], fleaLevel: null, noFlea: false }),
  );

  return {
    datasetId,
    valid: validation.valid,
    complete: validation.complete,
    issues: validation.issues,
    isWeapon: !!weaponRow?.types.includes("gun"),
    ammoAllowed: ammo === null || (!!ammoStats && allowedAmmo.includes(ammo)),
    allowedAmmo,
    stats: computeStats(tree, items, weapon, ammoStats),
    procurement,
    partIds,
  };
}
