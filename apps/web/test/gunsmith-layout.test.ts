import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleFromParts, installPart, type BuildNode } from "@tbh/compat-engine";
import { normalizeTarkovDev, parseTranslations, type NormalizedDataset } from "@tbh/data-adapters";
import { gameDataFromNormalized } from "@tbh/game-data";
import { layoutBuild, overlaps, zoneOf, type LayoutItem } from "../src/gunsmith/layout.ts";
import { allowedAmmoFor, computeStats } from "../src/gunsmith/stats.ts";
import type { BundleItem, WeaponBase } from "../src/gunsmith/types.ts";

/** Echte Daten: M4A1-Ausschnitt aus json.tarkov.dev (13.11.2026). */
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "data-adapters", "test", "fixtures", "m4a1");
const load = async (n: string) => JSON.parse(await readFile(path.join(dir, n), "utf8")) as unknown;

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PRESET = "5af08cf886f774223c269184";
const SF3P = "5c7fb51d2e2216001219ce11";
const MINI_MONSTER = "55d6190f4bdc2d87028b4567";

let dataset: NormalizedDataset;
let build: BuildNode;
let layoutItems: Record<string, LayoutItem>;

beforeAll(async () => {
  ({ dataset } = normalizeTarkovDev({
    mode: "pvp",
    sourceUrl: "x",
    fetchedAt: "2026-11-13T15:00:00.000Z",
    itemsJson: await load("items.json"),
    translations: { de: parseTranslations(await load("items_de.json")) },
  }));
  const data = gameDataFromNormalized(1, dataset);
  const preset = dataset.items.find((i) => i.extId === PRESET)!;
  build = assembleFromParts(data, M4A1, preset.contains.map((c) => c.itemExtId).filter((id) => id !== M4A1)).build;
  layoutItems = Object.fromEntries(dataset.items.map((i) => [i.extId, { w: i.width ?? 1, h: i.height ?? 1, slots: i.slots.map((s) => ({ id: s.extId, nameId: s.nameId })) }]));
});

const findBox = (l: ReturnType<typeof layoutBuild>, itemId: string) => l.boxes.find((b) => b.itemId === itemId)!;

describe("Aufbauansicht", () => {
  it("ordnet Slot-Namen den Bereichen zu", () => {
    expect(zoneOf("mod_stock", null)).toBe("left");
    expect(zoneOf("mod_muzzle_000", "mod_muzzle")).toBe("axis");
    expect(zoneOf("mod_scope", null)).toBe("top");
    expect(zoneOf("mod_pistol_grip", null)).toBe("bottom");
    expect(zoneOf("mod_handguard", "mod_handguard")).toBe("bottom");
    expect(zoneOf("mod_something_new", null)).toBe("extra");
  });

  it("zeigt jedes verbaute Teil der echten M4A1-Vorlage genau einmal und ohne Überlappung", () => {
    const l = layoutBuild(build, layoutItems);
    const count = (n: BuildNode): number => 1 + Object.values(n.slots ?? {}).reduce((s, c) => s + count(c), 0);
    expect(l.boxes).toHaveLength(count(build));
    expect(new Set(l.boxes.map((b) => b.key)).size).toBe(l.boxes.length);
    for (let i = 0; i < l.boxes.length; i++) for (let j = i + 1; j < l.boxes.length; j++) expect(overlaps(l.boxes[i]!, l.boxes[j]!), `${l.boxes[i]!.key} / ${l.boxes[j]!.key}`).toBe(false);
  });

  it("legt Schaft links, Mündung rechts, Spannhebel oben und Magazin unten ab", () => {
    const l = layoutBuild(build, layoutItems);
    const weapon = findBox(l, M4A1);
    const stock = l.boxes.find((b) => b.slotNameId === "mod_stock_000")!;
    const muzzle = l.boxes.find((b) => b.slotNameId === "mod_muzzle")!;
    const charge = l.boxes.find((b) => b.slotNameId === "mod_charge")!;
    const mag = l.boxes.find((b) => b.slotNameId === "mod_magazine")!;
    expect(stock.x).toBeLessThan(weapon.x);
    expect(muzzle.x).toBeGreaterThan(weapon.x + weapon.w);
    expect(charge.y + charge.h).toBeLessThanOrEqual(weapon.y);
    expect(mag.y).toBeGreaterThanOrEqual(weapon.y + weapon.h);
  });

  it("setzt den Dämpfer hinter die Mündung und zeigt leere Slots nur auf Wunsch", () => {
    let b = build;
    const muzzlePath = findPath(build, "mod_muzzle");
    b = installPart(b, muzzlePath.slice(0, -1), muzzlePath.at(-1)!, SF3P, gameDataFromNormalized(1, dataset)).build;
    const sf3pSlot = dataset.items.find((i) => i.extId === SF3P)!.slots[0]!.extId;
    const withSupp = installPart(b, muzzlePath, sf3pSlot, MINI_MONSTER).build;
    const l = layoutBuild(withSupp, layoutItems);
    expect(findBox(l, MINI_MONSTER).x).toBeGreaterThan(findBox(l, SF3P).x);

    const empty = layoutBuild(b, layoutItems, { showEmpty: (s) => s.nameId.startsWith("mod_muzzle") });
    expect(empty.boxes.some((x) => x.itemId === null && x.slotNameId === "mod_muzzle_000")).toBe(false); // SF3P-Slot heißt anders
    expect(empty.boxes.filter((x) => x.itemId === null).length).toBeGreaterThan(0);
  });
});

function findPath(node: BuildNode, nameId: string, path: string[] = []): string[] {
  for (const [slotId, child] of Object.entries(node.slots ?? {})) {
    const item = dataset.items.find((i) => i.extId === node.itemId);
    if (item?.slots.find((s) => s.extId === slotId)?.nameId === nameId) return [...path, slotId];
    const found = findPath(child, nameId, [...path, slotId]);
    if (found.length) return found;
  }
  return [];
}

describe("Werte", () => {
  const weapon: WeaponBase = { id: M4A1, ergonomics: 48, recoilVertical: 119, recoilHorizontal: 342, caliber: "Caliber556x45NATO", fireRate: 800, defaultAmmo: null, allowedAmmo: ["a", "b", "c"] };
  const item = (o: Partial<BundleItem>): BundleItem => ({ plain: {} as BundleItem["plain"], names: {}, img: null, img512: null, w: 1, h: 1, weight: 0.1, price: 1000, ergonomics: 0, recoilModifier: 0, accuracyModifier: 0, slots: [], ...o });

  it("addiert Ergonomie und wendet Rückstoß-Modifikatoren von Teilen und Munition an", () => {
    const items = { [M4A1]: item({ weight: 2.6 }), x: item({ ergonomics: -9, recoilModifier: -0.07 }), y: item({ ergonomics: 5, recoilModifier: -0.03, price: null }) };
    const s = computeStats({ itemId: M4A1, slots: { a: { itemId: "x", slots: { b: { itemId: "y" } } } } }, items, weapon, { recoilModifier: 0.05, accuracyModifier: 0.02 } as never);
    expect(s.ergonomics).toBe(44);
    expect(s.recoilModifier).toBe(-0.05);
    expect(s.recoilVertical).toBe(Math.round(119 * 0.95));
    expect(s.weight).toBe(2.8);
    expect(s.partsPrice).toBe(1000);
    expect(s.partsWithoutPrice).toBe(1);
  });

  it("schränkt Munition auf Waffe ∩ Magazin ein", () => {
    const items = { [M4A1]: item({}), mag: item({ allowedAmmo: ["b", "c"] }) };
    expect(allowedAmmoFor({ itemId: M4A1 }, items, weapon)).toEqual(["a", "b", "c"]);
    expect(allowedAmmoFor({ itemId: M4A1, slots: { m: { itemId: "mag" } } }, items, weapon)).toEqual(["b", "c"]);
  });
});
