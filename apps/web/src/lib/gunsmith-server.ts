import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { assembleFromParts, listSlotCandidates, type BuildNode, type GameData, type PlainItem } from "@tbh/compat-engine";
import { gamePatch, item, itemCategory, itemContains, itemDataset, itemName, itemSlot, slotName, task } from "@tbh/db";
import { loadDisplayNames, loadGameData, loadProcurementData } from "@tbh/game-data";
import type { AmmoInfo, BundleItem, Lang, NamePair, WeaponBundle } from "@/gunsmith/types";
import { db } from "./server";

/* Spieldaten je Datensatz einmal laden und im Prozess halten (Datensätze ändern sich nie). */
const g = globalThis as unknown as { tbhGameData?: Map<number, Promise<GameData>>; tbhBundles?: Map<string, Promise<WeaponBundle>> };
g.tbhGameData ??= new Map();
g.tbhBundles ??= new Map();

export function getGameData(datasetId: number): Promise<GameData> {
  let p = g.tbhGameData!.get(datasetId);
  if (!p) {
    p = loadGameData(db(), datasetId);
    p.catch(() => g.tbhGameData!.delete(datasetId));
    g.tbhGameData!.set(datasetId, p);
  }
  return p;
}

export interface ActiveDataset {
  id: number;
  mode: "pvp" | "pve";
  patch: string | null;
  fetchedAt: Date;
}

export async function activeDataset(mode: "pvp" | "pve" = "pvp"): Promise<ActiveDataset | null> {
  const [row] = await db()
    .select({ id: itemDataset.id, mode: itemDataset.mode, patch: gamePatch.label, fetchedAt: itemDataset.fetchedAt })
    .from(itemDataset)
    .leftJoin(gamePatch, eq(gamePatch.id, itemDataset.patchId))
    .where(and(eq(itemDataset.mode, mode), eq(itemDataset.status, "active")));
  return row ?? null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function namePairs(de: Map<string, { name: string; shortName: string }>, en: Map<string, { name: string; shortName: string }>, id: string) {
  const out: Partial<Record<Lang, NamePair>> = {};
  const d = de.get(id);
  const e = en.get(id);
  if (d) out.de = { name: d.name, short: d.shortName };
  if (e) out.en = { name: e.name, short: e.shortName };
  return out;
}

export interface WeaponListEntry {
  id: string;
  names: Partial<Record<Lang, NamePair>>;
  img: string | null;
  categoryId: string | null;
  category: Partial<Record<Lang, string>>;
  caliber: string | null;
  presetCount: number;
}

/** Alle Waffen des Datensatzes für die Waffenwahl. */
export async function listWeapons(datasetId: number): Promise<WeaponListEntry[]> {
  const rows = await db()
    .select({ extId: item.extId, types: item.types, categories: item.categories, images: item.images, properties: item.properties })
    .from(item)
    .where(eq(item.datasetId, datasetId));
  const guns = rows.filter((r) => r.types.includes("gun"));
  const ids = guns.map((r) => r.extId);
  const [de, en, cats] = await Promise.all([
    loadDisplayNames(db(), datasetId, "de", ids),
    loadDisplayNames(db(), datasetId, "en", ids),
    db().select().from(itemCategory).where(eq(itemCategory.datasetId, datasetId)),
  ]);
  const catNames = new Map(cats.map((c) => [c.extId, c.names as Partial<Record<Lang, string>>]));
  return guns.map((r) => {
    const props = r.properties as Record<string, unknown>;
    const images = r.images as Record<string, string | null>;
    const categoryId = r.categories[0] ?? null;
    return {
      id: r.extId,
      names: namePairs(de, en, r.extId),
      img: images["image512"] ?? images["base"] ?? null,
      categoryId,
      category: (categoryId && catNames.get(categoryId)) || {},
      caliber: str(props["caliber"]),
      presetCount: strings(props["presets"]).length,
    };
  });
}

/** Alle Items, die über Slots von der Waffe aus erreichbar sind. */
function reachableFrom(data: GameData, weaponId: string): Set<string> {
  const seen = new Set<string>([weaponId]);
  const queue = [weaponId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const def = data.getItem(id);
    if (!def) continue;
    for (const slot of def.slots) {
      for (const candidate of listSlotCandidates(data, slot.id, def)) {
        if (!seen.has(candidate)) {
          seen.add(candidate);
          queue.push(candidate);
        }
      }
    }
  }
  return seen;
}

function toPlain(data: GameData, id: string): PlainItem | null {
  const d = data.getItem(id);
  if (!d) return null;
  return {
    id: d.id,
    categories: [...d.categories],
    slots: d.slots.map((s) => ({
      id: s.id,
      nameId: s.nameId,
      required: s.required,
      allowedItems: [...s.allowedItems],
      allowedCategories: [...s.allowedCategories],
      excludedItems: [...s.excludedItems],
      excludedCategories: [...s.excludedCategories],
    })),
    conflictingItems: [...d.conflictingItems],
    conflictingCategories: [...d.conflictingCategories],
    conflictingSlotIds: [...d.conflictingSlotIds],
    modifiers: { ...d.modifiers },
  };
}

export class WeaponNotFoundError extends Error {}

export function getWeaponBundle(datasetId: number, weaponId: string): Promise<WeaponBundle> {
  const key = `${datasetId}:${weaponId}`;
  let p = g.tbhBundles!.get(key);
  if (!p) {
    p = buildWeaponBundle(datasetId, weaponId);
    p.catch(() => g.tbhBundles!.delete(key));
    // Namen können sich durch Admin-Änderungen ändern – nicht ewig halten.
    g.tbhBundles!.set(key, p);
    setTimeout(() => g.tbhBundles!.delete(key), 10 * 60_000).unref?.();
  }
  return p;
}

async function buildWeaponBundle(datasetId: number, weaponId: string): Promise<WeaponBundle> {
  if (!/^[0-9a-f]{24}$/i.test(weaponId)) throw new WeaponNotFoundError();
  const database = db();
  const data = await getGameData(datasetId);
  const weaponDef = data.getItem(weaponId);
  if (!weaponDef) throw new WeaponNotFoundError();

  const [weaponRow] = await database
    .select({ types: item.types, properties: item.properties })
    .from(item)
    .where(and(eq(item.datasetId, datasetId), eq(item.extId, weaponId)));
  if (!weaponRow?.types.includes("gun")) throw new WeaponNotFoundError();
  const wp = weaponRow.properties as Record<string, unknown>;
  const allowedAmmo = strings(wp["allowedAmmo"]);
  const presetIds = strings(wp["presets"]);
  const defaultPreset = str(wp["defaultPreset"]);

  const reachable = reachableFrom(data, weaponId);
  const ids = [...reachable];
  const allIds = [...new Set([...ids, ...allowedAmmo, ...presetIds])];

  const [rows, slotRows, de, en, procurement, presetParts, ds] = await Promise.all([
    database
      .select({
        extId: item.extId,
        types: item.types,
        width: item.width,
        height: item.height,
        weight: item.weight,
        avg24hPrice: item.avg24hPrice,
        images: item.images,
        properties: item.properties,
      })
      .from(item)
      .where(and(eq(item.datasetId, datasetId), inArray(item.extId, allIds))),
    database
      .select({ itemExtId: itemSlot.itemExtId, slotExtId: itemSlot.slotExtId, nameKey: itemSlot.nameKey })
      .from(itemSlot)
      .where(and(eq(itemSlot.datasetId, datasetId), inArray(itemSlot.itemExtId, ids))),
    loadDisplayNames(database, datasetId, "de", allIds),
    loadDisplayNames(database, datasetId, "en", allIds),
    loadProcurementData(database, datasetId, [...ids, ...allowedAmmo]),
    presetIds.length
      ? database
          .select({ itemExtId: itemContains.itemExtId, containedExtId: itemContains.containedExtId, sort: itemContains.sort })
          .from(itemContains)
          .where(and(eq(itemContains.datasetId, datasetId), inArray(itemContains.itemExtId, presetIds)))
      : Promise.resolve([]),
    database
      .select({ mode: itemDataset.mode, fetchedAt: itemDataset.fetchedAt, patch: gamePatch.label })
      .from(itemDataset)
      .leftJoin(gamePatch, eq(gamePatch.id, itemDataset.patchId))
      .where(eq(itemDataset.id, datasetId)),
  ]);

  const nameKeyBySlot = new Map(slotRows.map((s) => [`${s.itemExtId}/${s.slotExtId}`, s.nameKey]));
  const keys = [...new Set(slotRows.map((s) => s.nameKey).filter((k): k is string => !!k))];
  const slotNameRows = keys.length
    ? await database
        .select()
        .from(slotName)
        .where(and(eq(slotName.datasetId, datasetId), inArray(slotName.key, keys)))
    : [];
  const slotNames: WeaponBundle["slotNames"] = {};
  for (const r of slotNameRows) (slotNames[r.key] ??= {})[r.lang as Lang] = r.name;

  const rowById = new Map(rows.map((r) => [r.extId, r]));
  const allowedAmmoSet = new Set(allowedAmmo);
  const items: Record<string, BundleItem> = {};
  for (const id of ids) {
    const row = rowById.get(id);
    const plain = toPlain(data, id);
    if (!row || !plain) continue;
    const props = row.properties as Record<string, unknown>;
    const images = row.images as Record<string, string | null>;
    const entry: BundleItem = {
      plain,
      names: namePairs(de, en, id),
      img: images["base"] ?? images["image512"] ?? null,
      img512: images["image512"] ?? images["base"] ?? null,
      w: row.width ?? 1,
      h: row.height ?? 1,
      weight: row.weight,
      price: row.avg24hPrice && row.avg24hPrice > 0 ? row.avg24hPrice : null,
      ergonomics: num(props["ergonomics"]),
      recoilModifier: num(props["recoilModifier"]),
      accuracyModifier: num(props["accuracyModifier"]),
      slots: (plain.slots ?? []).map((s) => ({ id: s.id, nameId: s.nameId, nameKey: nameKeyBySlot.get(`${id}/${s.id}`) ?? null })),
    };
    if (row.types.includes("mods") && props["propertiesType"] === "ItemPropertiesMagazine") {
      entry.allowedAmmo = strings(props["allowedAmmo"]).filter((a) => allowedAmmoSet.has(a));
      entry.capacity = num(props["capacity"]);
    }
    items[id] = entry;
  }

  const ammo: AmmoInfo[] = allowedAmmo
    .map((id) => {
      const row = rowById.get(id);
      if (!row) return null;
      const p = row.properties as Record<string, unknown>;
      const images = row.images as Record<string, string | null>;
      return {
        id,
        names: namePairs(de, en, id),
        img: images["image512"] ?? images["base"] ?? null,
        damage: num(p["damage"]),
        penetration: num(p["penetrationPower"]),
        armorDamage: num(p["armorDamage"]),
        recoilModifier: num(p["recoilModifier"]),
        accuracyModifier: num(p["accuracyModifier"]),
        speed: num(p["initialSpeed"]),
        projectiles: num(p["projectileCount"]),
        tracer: p["tracer"] === true,
        price: row.avg24hPrice && row.avg24hPrice > 0 ? row.avg24hPrice : null,
      } satisfies AmmoInfo;
    })
    .filter((a): a is AmmoInfo => a !== null)
    .sort((a, b) => (a.penetration ?? 0) - (b.penetration ?? 0));

  // Vorlagen: Teile der Presets mit der Engine zusammensetzen (wie verify-presets).
  const partsByPreset = new Map<string, string[]>();
  for (const pp of [...presetParts].sort((a, b) => a.sort - b.sort)) {
    if (pp.containedExtId === weaponId || allowedAmmoSet.has(pp.containedExtId)) continue;
    const list = partsByPreset.get(pp.itemExtId) ?? [];
    list.push(pp.containedExtId);
    partsByPreset.set(pp.itemExtId, list);
  }
  const presets = presetIds
    .filter((pid) => partsByPreset.has(pid))
    .map((pid) => ({ id: pid, names: namePairs(de, en, pid), build: assembleFromParts(data, weaponId, partsByPreset.get(pid) ?? []).build }));
  const defaultBuild: BuildNode = presets.find((p) => p.id === defaultPreset)?.build ?? presets[0]?.build ?? { itemId: weaponId };

  const taskIds = [...new Set(procurement.sources.flatMap((s) => s.offers.map((o) => o.taskId).filter((t): t is string => !!t)))];
  const taskRows = taskIds.length
    ? await database
        .select({ extId: task.extId, names: task.names })
        .from(task)
        .where(and(eq(task.datasetId, datasetId), inArray(task.extId, taskIds)))
    : [];

  return {
    datasetId,
    mode: ds[0]!.mode,
    patch: ds[0]!.patch,
    dataAsOf: ds[0]!.fetchedAt.toISOString(),
    weapon: {
      id: weaponId,
      ergonomics: num(wp["ergonomics"]),
      recoilVertical: num(wp["recoilVertical"]),
      recoilHorizontal: num(wp["recoilHorizontal"]),
      caliber: str(wp["caliber"]),
      fireRate: num(wp["fireRate"]),
      defaultAmmo: str(wp["defaultAmmo"]),
      allowedAmmo,
    },
    items,
    ammo,
    slotNames,
    defaultBuild,
    presets,
    procurement: {
      traders: procurement.traders,
      fleaMinPlayerLevel: procurement.fleaMinPlayerLevel,
      sources: Object.fromEntries(procurement.sources.map((s) => [s.itemId, { offers: s.offers, fleaLevel: s.fleaLevel, noFlea: s.noFlea }])),
      taskNames: Object.fromEntries(taskRows.map((t) => [t.extId, t.names as Partial<Record<Lang, string>>])),
    },
  };
}

/** Name und Bild für eine Liste von Waffen (Karten auf Profil und später im Feed). */
export async function weaponCards(datasetId: number, ids: readonly string[], lang: Lang): Promise<Map<string, { name: NamePair; img: string | null }>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const [rows, names] = await Promise.all([
    db()
      .select({ extId: item.extId, images: item.images })
      .from(item)
      .where(and(eq(item.datasetId, datasetId), inArray(item.extId, unique))),
    loadDisplayNames(db(), datasetId, lang, unique),
  ]);
  return new Map(
    rows.map((r) => {
      const images = r.images as Record<string, string | null>;
      const n = names.get(r.extId);
      return [r.extId, { name: { name: n?.name ?? "?", short: n?.shortName ?? "?" }, img: images["image512"] ?? images["base"] ?? null }];
    }),
  );
}

const caliberCache = new Map<number, Promise<Map<string, string>>>();

/**
 * Lesbare Kaliber-Namen. Die Quelle liefert nur Codes (Caliber556x45NATO); der Name wird aus den
 * echten Munitionsnamen desselben Kalibers abgeleitet (häufigstes erstes Wort, z. B. „5.56x45mm“).
 */
export function caliberLabels(datasetId: number): Promise<Map<string, string>> {
  let p = caliberCache.get(datasetId);
  if (!p) {
    p = (async () => {
      const rows = await db()
        .select({ caliber: sql<string>`${item.properties}->>'caliber'`, name: itemName.name })
        .from(item)
        .innerJoin(itemName, and(eq(itemName.datasetId, item.datasetId), eq(itemName.extId, item.extId), eq(itemName.lang, "en")))
        .where(and(eq(item.datasetId, datasetId), sql`'ammo' = ANY(${item.types})`, sql`${item.properties}->>'caliber' IS NOT NULL`));
      const counts = new Map<string, Map<string, number>>();
      for (const r of rows) {
        // „.50 AE“ und „.50 BMG“ unterscheiden sich erst im zweiten Wort.
        const words = r.name.split(" ");
        const word = words[0]?.startsWith(".") ? words.slice(0, 2).join(" ") : words[0];
        if (!word) continue;
        const m = counts.get(r.caliber) ?? new Map<string, number>();
        m.set(word, (m.get(word) ?? 0) + 1);
        counts.set(r.caliber, m);
      }
      const out = new Map<string, string>();
      for (const [cal, m] of counts) out.set(cal, [...m].sort((a, b) => b[1] - a[1])[0]![0]);
      return out;
    })();
    p.catch(() => caliberCache.delete(datasetId));
    caliberCache.set(datasetId, p);
  }
  return p;
}
