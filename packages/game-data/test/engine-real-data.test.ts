import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assembleFromParts,
  checkCandidates,
  getNode,
  installPart,
  removePart,
  sumModifiers,
  validateBuild,
  type BuildNode,
  type BuildPath,
  type GameData,
} from "@tbh/compat-engine";
import { fetchTarkovDevDataset, type NormalizedDataset } from "@tbh/data-adapters";
import { gameDataFromNormalized } from "../src/index.js";

/**
 * Engine-Tests ausschließlich mit echten Daten (Ausschnitt aus json.tarkov.dev, Stand 13.11.2026).
 * Erwartete Ergebnisse stammen aus den Slot- und Konfliktlisten der Quelle, nicht aus Annahmen.
 */
const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data-adapters", "test", "fixtures", "m4a1");

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PRESET = "5af08cf886f774223c269184";
const UPPER = "55d355e64bdc2d962f8b4569";
const BARREL_370 = "55d3632e4bdc2d972f8b4569";
const A2_FLASH_HIDER = "544a38634bdc2d58388b4568";
const SF3P = "5c7fb51d2e2216001219ce11";
const MINI_MONSTER = "55d6190f4bdc2d87028b4567";
const WAVE = "5cff9e5ed7ad1a09407397d4";
const WAVE_QD = "5cff9e84d7ad1a049e54ed55";
const M4_HANDGUARD = "5ae30db85acfc408fb139a05";
const M16A2_HANDGUARD = "68a63cc0c92ee33ffa01bf5c";
const A2_GRIP = "55d4b9964bdc2d1d4e8b456e";

let dataset: NormalizedDataset;
let data: GameData;

function slotIdOf(itemId: string, nameId: string): string {
  const slot = data.getItem(itemId)!.slots.find((s) => s.nameId === nameId);
  if (!slot) throw new Error(`${itemId} hat keinen Slot ${nameId}`);
  return slot.id;
}

/** Pfad zu einem verbauten Item im Build suchen. */
function pathTo(build: BuildNode, itemId: string, path: BuildPath = []): BuildPath | null {
  if (build.itemId === itemId) return path;
  for (const [slotId, child] of Object.entries(build.slots ?? {})) {
    const found = pathTo(child, itemId, [...path, slotId]);
    if (found) return found;
  }
  return null;
}

function presetBuild(): BuildNode {
  const preset = dataset.items.find((i) => i.extId === PRESET)!;
  const { build, leftover } = assembleFromParts(data, M4A1, preset.contains.map((c) => c.itemExtId));
  expect(leftover).toEqual([]);
  return build;
}

/** Preset-Variante aus dem Design: A2 → SF3P, dazu SOCOM556-MINI MONSTER. */
function sf3pVariant(): BuildNode {
  const build = presetBuild();
  const muzzlePath = pathTo(build, A2_FLASH_HIDER)!;
  const parentPath = muzzlePath.slice(0, -1);
  const muzzleSlot = muzzlePath.at(-1)!;
  let next = installPart(build, parentPath, muzzleSlot, SF3P, data).build;
  next = installPart(next, muzzlePath, slotIdOf(SF3P, "mod_muzzle"), MINI_MONSTER, data).build;
  return next;
}

beforeAll(async () => {
  dataset = (await fetchTarkovDevDataset({ mode: "pvp", fromDir: fixtureDir })).dataset;
  data = gameDataFromNormalized("fixture", dataset);
});

describe("Standard-Preset der M4A1", () => {
  it("lässt sich aus der Teileliste vollständig zusammensetzen und ist gültig und komplett", () => {
    const build = presetBuild();
    const result = validateBuild(data, build);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.nodes).toHaveLength(13);
  });

  it("setzt Lauf und Mündung in die richtige Ebene", () => {
    const build = presetBuild();
    expect(pathTo(build, BARREL_370)).toEqual([slotIdOf(M4A1, "mod_reciever"), slotIdOf(UPPER, "mod_barrel")]);
    expect(pathTo(build, A2_FLASH_HIDER)).toEqual([
      slotIdOf(M4A1, "mod_reciever"),
      slotIdOf(UPPER, "mod_barrel"),
      slotIdOf(BARREL_370, "mod_muzzle"),
    ]);
  });
});

describe("Dämpfer und Mündung (echter Fall aus dem Gunsmith-Entwurf)", () => {
  it("SF3P mit SOCOM556-MINI MONSTER ist gültig", () => {
    const result = validateBuild(data, sf3pVariant());
    expect(result.valid).toBe(true);
    expect(result.complete).toBe(true);
  });

  it("Tausch auf DD WAVE: der Dämpfer bleibt dran, wird aber als nicht erlaubt markiert", () => {
    const build = sf3pVariant();
    const muzzlePath = pathTo(build, SF3P)!;
    const { build: swapped, detached } = installPart(build, muzzlePath.slice(0, -1), muzzlePath.at(-1)!, WAVE, data);
    expect(detached).toEqual([]);

    const result = validateBuild(data, swapped);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      code: "not_allowed",
      itemId: MINI_MONSTER,
      parentItemId: WAVE,
      slotNameId: "mod_muzzle",
    });
    const node = result.nodes.find((n) => n.itemId === MINI_MONSTER)!;
    expect(node.status).toBe("error");
  });

  it("schlägt für den WAVE-Dämpfer-Slot den WAVE QD vor, nicht den MINI MONSTER", () => {
    const build = sf3pVariant();
    const muzzlePath = pathTo(build, SF3P)!;
    const { build: swapped } = installPart(build, muzzlePath.slice(0, -1), muzzlePath.at(-1)!, WAVE, data);
    const checks = checkCandidates(data, swapped, muzzlePath, slotIdOf(WAVE, "mod_muzzle"), [WAVE_QD, MINI_MONSTER]);
    expect(checks.find((c) => c.itemId === WAVE_QD)!.fits).toBe(true);
    const mini = checks.find((c) => c.itemId === MINI_MONSTER)!;
    expect(mini.fits).toBe(false);
    expect(mini.issues[0]!.code).toBe("not_allowed");
  });

  it("summiert die Modifikatoren der Teile wie auf der Build-Seite", () => {
    const sums = sumModifiers(data, sf3pVariant());
    expect(sums.partCount).toBe(13);
    expect(sums.ergonomics).toBe(-1);
    expect(sums.recoilModifier).toBe(-0.339);
    expect(sums.missingPrice).toBe(0);
  });
});

describe("Konflikte", () => {
  it("erkennt den einseitig eingetragenen Konflikt M16A2-Handschutz ↔ 370-mm-Lauf", () => {
    const build = presetBuild();
    const hgPath = pathTo(build, M4_HANDGUARD)!;
    const { build: swapped, detached } = installPart(build, hgPath.slice(0, -1), hgPath.at(-1)!, M16A2_HANDGUARD, data);

    // Der Handschutz selbst ist im Slot erlaubt – das Problem ist allein der Konflikt.
    const result = validateBuild(data, swapped);
    const conflict = result.issues.find((i) => i.code === "conflict_item");
    expect(conflict).toBeDefined();
    expect(new Set([conflict!.itemId, conflict!.otherItemId])).toEqual(new Set([M16A2_HANDGUARD, BARREL_370]));
    expect(result.issues.some((i) => i.code === "not_allowed" && i.itemId === M16A2_HANDGUARD)).toBe(false);

    // Unterteile ohne passenden Slot am neuen Handschutz werden gemeldet, nicht still entfernt.
    for (const d of detached) expect(getNode(build, [...hgPath, d.slotId])).toBeDefined();
  });

  it("meldet den Konflikt schon in der Teile-Auswahl", () => {
    const build = presetBuild();
    const hgPath = pathTo(build, M4_HANDGUARD)!;
    const [check] = checkCandidates(data, build, hgPath.slice(0, -1), hgPath.at(-1)!, [M16A2_HANDGUARD]);
    expect(check!.fits).toBe(false);
    expect(check!.issues.map((i) => i.code)).toContain("conflict_item");
  });
});

describe("Vollständigkeit und unbekannte Daten", () => {
  it("fehlender Pistolengriff macht den Build unvollständig, aber nicht ungültig", () => {
    const build = presetBuild();
    const { build: without } = removePart(build, [], slotIdOf(M4A1, "mod_pistol_grip"));
    const result = validateBuild(data, without);
    expect(result.valid).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ code: "missing_required", slotNameId: "mod_pistol_grip", itemId: M4A1 })]);
    expect(pathTo(without, A2_GRIP)).toBeNull();
  });

  it("ein Item, das es im Datensatz nicht gibt, wird als unbekannt gekennzeichnet", () => {
    const build = presetBuild();
    const { build: odd } = installPart(build, [], slotIdOf(M4A1, "mod_pistol_grip"), "000000000000000000000000");
    const result = validateBuild(data, odd);
    expect(result.valid).toBe(false);
    expect(result.nodes.find((n) => n.itemId === "000000000000000000000000")!.status).toBe("unknown");
  });
});
