import { describe, expect, it } from "vitest";
import {
  assembleFromParts,
  BuildPathError,
  createGameData,
  installPart,
  itemFromPlain,
  removePart,
  validateBuild,
  type PlainItem,
} from "../src/index.js";

/**
 * Regeltests mit KÜNSTLICHEN Daten (IDs wie "gun", "mount").
 * Sie prüfen nur die Logik der Engine, nicht Tarkov-Fakten –
 * echte Fälle stehen in packages/game-data/test/engine-real-data.test.ts.
 */
const items: PlainItem[] = [
  {
    id: "gun",
    categories: ["cat-weapon"],
    slots: [
      { id: "s-top", nameId: "mod_mount", required: false, allowedItems: ["mount"] },
      { id: "s-grip", nameId: "mod_pistol_grip", required: true, allowedCategories: ["cat-grip"], excludedItems: ["grip-banned"] },
      { id: "s-stock", nameId: "mod_stock", required: false, allowedCategories: ["cat-stock"], excludedCategories: ["cat-stock-folding"] },
    ],
  },
  { id: "mount", slots: [{ id: "s-mount-scope", nameId: "mod_scope", required: false, allowedItems: ["scope-big", "scope-small"] }] },
  { id: "scope-big", conflictingSlotIds: ["s-stock"] },
  { id: "scope-small" },
  { id: "grip-a", categories: ["cat-grip"] },
  { id: "grip-banned", categories: ["cat-grip"] },
  { id: "stock-fixed", categories: ["cat-stock"], conflictingCategories: ["cat-grip-special"] },
  { id: "stock-folding", categories: ["cat-stock", "cat-stock-folding"] },
  { id: "grip-special", categories: ["cat-grip", "cat-grip-special"] },
];
const data = createGameData("synthetic", items.map(itemFromPlain));

describe("Slot-Filter", () => {
  it("lässt Items über erlaubte Kategorien zu", () => {
    const r = validateBuild(data, { itemId: "gun", slots: { "s-grip": { itemId: "grip-a" } } });
    expect(r.valid).toBe(true);
    expect(r.complete).toBe(true);
  });

  it("schließt einzelne Items trotz erlaubter Kategorie aus", () => {
    const r = validateBuild(data, { itemId: "gun", slots: { "s-grip": { itemId: "grip-banned" } } });
    expect(r.issues.map((i) => i.code)).toEqual(["excluded"]);
  });

  it("schließt ganze Kategorien aus", () => {
    const r = validateBuild(data, { itemId: "gun", slots: { "s-grip": { itemId: "grip-a" }, "s-stock": { itemId: "stock-folding" } } });
    expect(r.issues.map((i) => i.code)).toEqual(["excluded"]);
  });

  it("meldet Teile in Slots, die das Eltern-Teil nicht hat", () => {
    const r = validateBuild(data, { itemId: "gun", slots: { "s-grip": { itemId: "grip-a" }, "s-nope": { itemId: "mount" } } });
    expect(r.issues.map((i) => i.code)).toEqual(["unknown_slot"]);
  });
});

describe("Konflikte und Sperren", () => {
  it("erkennt Kategorie-Konflikte", () => {
    const r = validateBuild(data, { itemId: "gun", slots: { "s-grip": { itemId: "grip-special" }, "s-stock": { itemId: "stock-fixed" } } });
    const issue = r.issues.find((i) => i.code === "conflict_category");
    expect(issue).toBeDefined();
    expect(new Set([issue!.itemId, issue!.otherItemId])).toEqual(new Set(["grip-special", "stock-fixed"]));
  });

  it("meldet einen belegten Slot, den ein anderes Teil sperrt", () => {
    const r = validateBuild(data, {
      itemId: "gun",
      slots: {
        "s-grip": { itemId: "grip-a" },
        "s-top": { itemId: "mount", slots: { "s-mount-scope": { itemId: "scope-big" } } },
        "s-stock": { itemId: "stock-fixed" },
      },
    });
    expect(r.issues).toEqual([
      expect.objectContaining({ code: "blocked_slot", itemId: "stock-fixed", otherItemId: "scope-big", otherPath: ["s-top", "s-mount-scope"] }),
    ]);
  });

  it("ein gesperrter, aber leerer Slot ist kein Fehler", () => {
    const r = validateBuild(data, {
      itemId: "gun",
      slots: { "s-grip": { itemId: "grip-a" }, "s-top": { itemId: "mount", slots: { "s-mount-scope": { itemId: "scope-big" } } } },
    });
    expect(r.valid).toBe(true);
  });
});

describe("Unbekannte Teile", () => {
  it("kennzeichnet Unterteile eines unbekannten Teils als nicht prüfbar", () => {
    const r = validateBuild(data, {
      itemId: "gun",
      slots: { "s-grip": { itemId: "grip-a" }, "s-top": { itemId: "ghost", slots: { x: { itemId: "scope-small" } } } },
    });
    expect(r.issues.map((i) => i.code)).toEqual(["unknown_item", "parent_unknown"]);
    expect(r.nodes.filter((n) => n.status === "unknown")).toHaveLength(2);
  });
});

describe("Bearbeiten des Baums", () => {
  it("verändert den ursprünglichen Build nie", () => {
    const original = { itemId: "gun", slots: { "s-grip": { itemId: "grip-a" } } };
    const copy = JSON.parse(JSON.stringify(original));
    installPart(original, [], "s-top", "mount", data);
    removePart(original, [], "s-grip");
    expect(original).toEqual(copy);
  });

  it("verweigert ungültige Pfade", () => {
    expect(() => installPart({ itemId: "gun" }, ["s-top"], "s-mount-scope", "scope-small")).toThrow(BuildPathError);
  });

  it("Abnehmen aus einem leeren Slot ändert nichts und meldet nichts", () => {
    const { build, detached } = removePart({ itemId: "gun" }, [], "s-top");
    expect(build).toEqual({ itemId: "gun", slots: {} });
    expect(detached).toEqual([]);
  });

  it("meldet beim Zusammensetzen Teile, die nirgends passen", () => {
    const { build, leftover } = assembleFromParts(data, "gun", ["grip-a", "mount", "scope-small", "grip-banned"]);
    expect(leftover).toEqual(["grip-banned"]);
    expect(validateBuild(data, build).valid).toBe(true);
  });
});
