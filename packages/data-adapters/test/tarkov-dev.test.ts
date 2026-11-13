import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  caliberIssue,
  cyrillicIssue,
  fetchTarkovDevDataset,
  findNameIssues,
  normalizeTarkovDev,
  parseTranslations,
  SourceFormatError,
  validateDataset,
} from "../src/index.ts";

/**
 * Fixture = unveränderter Ausschnitt aus json.tarkov.dev (regular, Stand 13.11.2026):
 * (plus AR-15 Colt M16A2 handguard als echter Konfliktfall zum 370-mm-Lauf)
 * Colt M4A1, sein Standard-Preset, dessen Teile sowie SureFire SF3P,
 * SOCOM556-MINI MONSTER, Daniel Defense WAVE und WAVE QD.
 * Dazu unverändert: traders (vollständig), Händler-Spitznamen (de/en), alle
 * Tauschangebote für diese Items plus ein Tausch mit Aufgabe, und diese Aufgabe.
 */
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "m4a1");
const M4A1 = "5447a9cd4bdc2dbd208b4567";
const PRESET = "5af08cf886f774223c269184";
const SF3P = "5c7fb51d2e2216001219ce11";
const MINI_MONSTER = "55d6190f4bdc2d87028b4567";
const WAVE = "5cff9e5ed7ad1a09407397d4";
const WAVE_QD = "5cff9e84d7ad1a049e54ed55";

async function loadJson(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(dir, name), "utf8"));
}

async function normalizeFixture() {
  return normalizeTarkovDev({
    mode: "pvp",
    sourceUrl: "https://json.tarkov.dev/regular/items",
    fetchedAt: "2026-11-13T15:00:00.000Z",
    itemsJson: await loadJson("items.json"),
    translations: {
      de: parseTranslations(await loadJson("items_de.json")),
      en: parseTranslations(await loadJson("items_en.json")),
    },
    tradersJson: await loadJson("traders.json"),
    traderTranslations: {
      de: parseTranslations(await loadJson("traders_de.json")),
      en: parseTranslations(await loadJson("traders_en.json")),
    },
    bartersJson: await loadJson("barters.json"),
    tasksJson: await loadJson("tasks.json"),
    taskTranslations: {
      de: parseTranslations(await loadJson("tasks_de.json")),
      en: parseTranslations(await loadJson("tasks_en.json")),
    },
  });
}

const MECHANIC = "5a7c2eca46aef81a7ca2145d";
const PEACEKEEPER = "5935c25fb3acc3127c3d8cd9";
const STANAG = "55d4887d4bdc2d962f8b4570";

describe("normalizeTarkovDev", () => {
  it("übernimmt alle Items des Ausschnitts ohne Ablehnung", async () => {
    const { dataset, rejected } = await normalizeFixture();
    expect(rejected).toEqual([]);
    expect(dataset.items).toHaveLength(19);
    expect(dataset.mode).toBe("pvp");
  });

  it("bildet die Slots der M4A1 exakt nach der Quelle ab", async () => {
    const { dataset } = await normalizeFixture();
    const m4 = dataset.items.find((i) => i.extId === M4A1)!;
    expect(m4.slots.map((s) => [s.nameId, s.required])).toEqual([
      ["mod_pistol_grip", true],
      ["mod_magazine", false],
      ["mod_reciever", true],
      ["mod_stock", true],
      ["mod_charge", true],
      ["mod_charge_001", false],
    ]);
    expect(m4.slots[0]!.filter.allowedItems).toHaveLength(40);
    expect(m4.properties).not.toHaveProperty("slots");
    expect(m4.properties["ergonomics"]).toBe(48);
  });

  it("übersetzt Item- und Slot-Namen auf Deutsch und Englisch", async () => {
    const { dataset } = await normalizeFixture();
    const m4 = dataset.items.find((i) => i.extId === M4A1)!;
    expect(m4.names.de?.name).toBe("Colt M4A1 5,56x45mm Sturmgewehr");
    expect(m4.names.en?.name).toBe("Colt M4A1 5.56x45 assault rifle");
    const grip = dataset.slotNames.find((s) => s.key === "MOD_PISTOL_GRIP");
    expect(grip?.names.en).toBe("Pistol Grip");
  });

  it("kennt die echte Dämpfer-Kompatibilität der Mündungsteile", async () => {
    const { dataset } = await normalizeFixture();
    const allowedOn = (id: string) =>
      dataset.items.find((i) => i.extId === id)!.slots.flatMap((s) => s.filter.allowedItems);
    expect(allowedOn(SF3P)).toContain(MINI_MONSTER);
    expect(allowedOn(WAVE)).toContain(WAVE_QD);
    expect(allowedOn(WAVE)).not.toContain(MINI_MONSTER);
  });

  it("übernimmt die Bestandteile des Presets", async () => {
    const { dataset } = await normalizeFixture();
    const preset = dataset.items.find((i) => i.extId === PRESET)!;
    expect(preset.types).toContain("preset");
    // Die Quelle listet die Basiswaffe selbst plus 12 Anbauteile.
    expect(preset.contains).toHaveLength(13);
    expect(preset.contains.map((c) => c.itemExtId)).toContain(M4A1);
  });

  it("meldet Items mit kaputtem Format, statt sie still zu übernehmen", () => {
    const { dataset, rejected } = normalizeTarkovDev({
      mode: "pve",
      sourceUrl: "x",
      fetchedAt: "2026-11-13T15:00:00.000Z",
      itemsJson: { data: { items: { a: { id: "a" } } } },
      translations: {},
    });
    expect(dataset.items).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toContain("normalizedName");
  });

  it("bricht bei völlig unbekanntem Dateiformat ab", () => {
    expect(() =>
      normalizeTarkovDev({ mode: "pvp", sourceUrl: "x", fetchedAt: "x", itemsJson: { foo: 1 }, translations: {} }),
    ).toThrow(SourceFormatError);
  });
});

describe("Händler, Tausch und Flohmarkt", () => {
  it("übernimmt die echten Händlerangebote der M4A1 und des MINI MONSTER", async () => {
    const { dataset } = await normalizeFixture();
    const m4 = dataset.items.find((i) => i.extId === M4A1);
    expect(m4?.traderOffers).toEqual([
      { traderExtId: MECHANIC, minTraderLevel: 3, price: 22997, currency: "RUB", priceRub: 22997, taskExtId: null, buyLimit: 5 },
    ]);
    expect(m4?.minLevelForFlea).toBe(25);
    const stanag = dataset.items.find((i) => i.extId === STANAG);
    expect(stanag?.traderOffers.map((o) => [o.traderExtId, o.minTraderLevel, o.currency])).toEqual([[PEACEKEEPER, 2, "USD"]]);
  });

  it("liest Händlerstufen samt Spielerlevel und Ruf und die Namen in beiden Sprachen", async () => {
    const { dataset } = await normalizeFixture();
    const mechanic = dataset.traders.find((t) => t.extId === MECHANIC);
    expect(mechanic?.names).toEqual({ de: "Mechanic", en: "Mechanic" });
    expect(mechanic?.levels.map((l) => [l.level, l.requiredPlayerLevel, l.requiredReputation])).toEqual([
      [1, 1, 0],
      [2, 12, 0.6],
      [3, 26, 2.3],
      [4, 40, 7.6],
    ]);
  });

  it("übernimmt das allgemeine Flohmarkt-Level und Tauschangebote mit Aufgabe", async () => {
    const { dataset } = await normalizeFixture();
    expect(dataset.fleaMinPlayerLevel).toBe(15);
    const withTask = dataset.barters.find((b) => b.taskExtId !== null);
    expect(withTask?.taskExtId).toBe("639670029113f06a7c3b2377");
    const task = dataset.tasks.find((t) => t.extId === withTask?.taskExtId);
    expect(task?.names.de).toBe("Den Brotkrumen folgen");
    expect(task?.names.en).toBeTruthy();
    const mini = dataset.barters.find((b) => b.offered.itemExtId === MINI_MONSTER);
    expect(mini?.required.length).toBeGreaterThan(0);
  });

  it("lehnt eine kaputte traders-Datei ab, statt still ohne Händler weiterzumachen", async () => {
    await expect(
      (async () =>
        normalizeTarkovDev({
          mode: "pvp",
          sourceUrl: "x",
          fetchedAt: "2026-11-13T15:00:00.000Z",
          itemsJson: await loadJson("items.json"),
          translations: {},
          tradersJson: { data: [{ nope: true }] },
        }))(),
    ).rejects.toThrow(SourceFormatError);
  });
});

describe("Namensprüfung", () => {
  // Echte Werte aus items_de (json.tarkov.dev, regular, 13.11.2026).
  it("erkennt kyrillische Buchstaben und schlägt lateinische vor", () => {
    expect(cyrillicIssue("АК-74M")).toEqual({ detail: "А (U+0410), К (U+041A)", suggestion: "AK-74M" });
    expect(cyrillicIssue("Yarygin MP-443 Grach 9х19mm Pistole")?.suggestion).toBe("Yarygin MP-443 Grach 9x19mm Pistole");
    expect(cyrillicIssue("Colt M4A1 5,56x45mm Sturmgewehr")).toBeNull();
  });

  it("macht keinen Vorschlag, wenn echte kyrillische Wörter im Namen stehen", () => {
    expect(cyrillicIssue("Бутылка")?.suggestion).toBeNull();
  });

  it("findet das falsche Kaliber im deutschen Namen der AK-102", () => {
    expect(caliberIssue("Kalashnikov AK-102 5,45x45mm Sturmgewehr", "Caliber556x45NATO")).toEqual({
      detail: "Name: 5,45x45, Daten: Caliber556x45NATO",
      suggestion: "Kalashnikov AK-102 5,56x45mm Sturmgewehr",
    });
    expect(caliberIssue("Kalashnikov AK-102 5.56x45 assault rifle", "Caliber556x45NATO")).toBeNull();
    expect(caliberIssue("Yarygin MP-443 Grach 9x19mm Pistole", "Caliber9x19PARA")).toBeNull();
    expect(caliberIssue("SIG MCX .300 Blackout Sturmgewehr", "Caliber762x35")).toBeNull();
  });

  it("meldet im M4A1-Ausschnitt keine Auffälligkeiten", async () => {
    const { dataset } = await normalizeFixture();
    expect(findNameIssues(dataset)).toEqual([]);
  });
});

describe("fetchTarkovDevDataset", () => {
  it("ruft die richtigen Adressen für PvP ab und bildet eine stabile Prüfsumme", async () => {
    const requested: string[] = [];
    const fakeFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      requested.push(u);
      const file = u.endsWith("/items") ? "items.json" : `${u.split("/").pop()}.json`;
      return new Response(await readFile(path.join(dir, file)));
    }) as typeof fetch;

    const a = await fetchTarkovDevDataset({ mode: "pvp", fetchImpl: fakeFetch });
    const b = await fetchTarkovDevDataset({ mode: "pvp", fromDir: dir });
    expect(requested).toEqual([
      "https://json.tarkov.dev/regular/items",
      "https://json.tarkov.dev/regular/items_de",
      "https://json.tarkov.dev/regular/items_en",
      "https://json.tarkov.dev/regular/traders",
      "https://json.tarkov.dev/regular/traders_de",
      "https://json.tarkov.dev/regular/traders_en",
      "https://json.tarkov.dev/regular/barters",
      "https://json.tarkov.dev/regular/tasks",
      "https://json.tarkov.dev/regular/tasks_de",
      "https://json.tarkov.dev/regular/tasks_en",
    ]);
    expect(Object.keys(a.raw.extra).sort()).toEqual(["barters", "tasks", "tasks_de", "tasks_en", "traders", "traders_de", "traders_en"]);
    expect(a.checksum).toBe(b.checksum);
    expect(a.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(a.dataset.items).toHaveLength(19);
  });

  it("nutzt für PvE den eigenen Pfad und meldet HTTP-Fehler klar", async () => {
    const fakeFetch = (async (url: string | URL | Request) => {
      expect(String(url)).toContain("/pve/");
      return new Response("nope", { status: 503 });
    }) as typeof fetch;
    await expect(fetchTarkovDevDataset({ mode: "pve", fetchImpl: fakeFetch })).rejects.toThrow(/HTTP 503/);
  });
});

describe("validateDataset", () => {
  it("erkennt einen unvollständigen Abruf als Fehler", async () => {
    const { dataset } = await normalizeFixture();
    const report = validateDataset(dataset, 0);
    expect(report.itemCount).toBe(19);
    expect(report.errors.some((e) => e.includes("Abruf vermutlich unvollständig"))).toBe(true);
  });

  it("zählt Waffen, Presets und hängende Verweise korrekt", async () => {
    const { dataset } = await normalizeFixture();
    const report = validateDataset(dataset, 0, { minItems: 1, minGuns: 1, maxMissingNameRatio: 1, maxDanglingRatio: 1 });
    expect(report.gunCount).toBe(1);
    expect(report.presetCount).toBe(1);
    // Der Ausschnitt enthält nur einen Teil der erlaubten Teile, Verweise ins Leere sind also erwartbar.
    expect(report.danglingAllowed).toBeGreaterThan(0);
    expect(report.danglingContains).toBe(0);
    expect(report.traderCount).toBe(16);
    expect(report.traderOfferCount).toBeGreaterThan(0);
    expect(report.unknownTaskRefs).toBe(0);
    expect(report.errors).toEqual([]);
  });

  it("wertet fehlende Händlerdaten als Fehler", async () => {
    const { dataset } = await normalizeFixture();
    const report = validateDataset({ ...dataset, traders: [] }, 0, { minItems: 1, minGuns: 1, maxMissingNameRatio: 1, maxDanglingRatio: 1 });
    expect(report.errors).toContain("Keine Händler in den Daten. Beschaffung wäre leer.");
  });
});
