import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizeTarkovDev, parseTranslations } from "@tbh/data-adapters";
import { fleaPlayerLevel, summarizeProcurement, type ItemSources, type ProcurementContext } from "../src/procurement.ts";
import { sourcesFromNormalized } from "../src/sources.ts";

/** Echte Daten: Fixture-Ausschnitt aus json.tarkov.dev (regular, 13.11.2026). */
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data-adapters", "test", "fixtures", "m4a1");
const load = async (n: string) => JSON.parse(await readFile(path.join(dir, n), "utf8")) as unknown;

const MECHANIC = "5a7c2eca46aef81a7ca2145d";
const PEACEKEEPER = "5935c25fb3acc3127c3d8cd9";
const SKIER = "58330581ace78e27b8b10cee";
const M4A1 = "5447a9cd4bdc2dbd208b4567";
const STANAG = "55d4887d4bdc2d962f8b4570";
const SF3P = "5c7fb51d2e2216001219ce11";
const MINI_MONSTER = "55d6190f4bdc2d87028b4567";
const BUFFER = "5649be884bdc2d79388b4577";
const HANDGUARD = "5ae30db85acfc408fb139a05";
const BARREL = "55d3632e4bdc2d972f8b4569";
const GRIP = "55d4b9964bdc2d1d4e8b456e";

let context: ProcurementContext;
let sources: Map<string, ItemSources>;
const parts = (...ids: string[]) => ids.map((id) => sources.get(id)!);

beforeAll(async () => {
  const { dataset } = normalizeTarkovDev({
    mode: "pvp",
    sourceUrl: "x",
    fetchedAt: "2026-11-13T15:00:00.000Z",
    itemsJson: await load("items.json"),
    translations: {},
    tradersJson: await load("traders.json"),
    traderTranslations: { de: parseTranslations(await load("traders_de.json")) },
    bartersJson: await load("barters.json"),
  });
  ({ context, sources } = sourcesFromNormalized(dataset));
});

describe("Beschaffung mit echten Händlerdaten", () => {
  it("braucht für M4A1 mit SF3P und MINI MONSTER Mechanic LL3 und Peacekeeper LL3 ab Spielerlevel 26", () => {
    const s = summarizeProcurement(context, parts(M4A1, STANAG, SF3P, MINI_MONSTER, BUFFER, HANDGUARD, BARREL, GRIP));
    expect(s.traderRoute.complete).toBe(true);
    expect(s.traderRoute.playerLevel).toBe(26);
    expect(s.traderRoute.traderLevels).toEqual([
      { traderId: PEACEKEEPER, level: 3, requiredPlayerLevel: 19, requiredReputation: 2.2 },
      { traderId: MECHANIC, level: 3, requiredPlayerLevel: 26, requiredReputation: 2.3 },
    ]);
    expect(s.fleaRoute).toEqual({ complete: true, playerLevel: 25, notOnFlea: [] });
  });

  it("nimmt beim Pufferrohr Peacekeeper statt Skier, weil Peacekeeper ohnehin gebraucht wird", () => {
    const s = summarizeProcurement(context, parts(STANAG, BUFFER));
    const buffer = s.parts.find((p) => p.itemId === BUFFER)!;
    expect(buffer.offer).toMatchObject({ traderId: PEACEKEEPER, traderLevel: 2, kind: "buy" });
    expect(buffer.alternatives.map((a) => [a.traderId, a.traderLevel])).toEqual([[SKIER, 2]]);
  });

  it("zeigt beim MINI MONSTER den echten Tausch bei Skier als Alternative, wählt aber Mechanic, wenn der ohnehin LL3 braucht", () => {
    const withM4 = summarizeProcurement(context, parts(M4A1, MINI_MONSTER)).parts.find((p) => p.itemId === MINI_MONSTER)!;
    expect(withM4.offer).toMatchObject({ kind: "buy", traderId: MECHANIC, traderLevel: 3, price: 108750, currency: "RUB" });
    expect(withM4.alternatives).toMatchObject([{ kind: "barter", traderId: SKIER, traderLevel: 2, requiredPlayerLevel: 7 }]);

    // Allein betrachtet ist der Tausch früher erreichbar (Spielerlevel 7 statt 26).
    const alone = summarizeProcurement(context, parts(MINI_MONSTER));
    expect(alone.parts[0]!.offer).toMatchObject({ kind: "barter", traderId: SKIER, requiredPlayerLevel: 7 });
    expect(alone.traderRoute.barterOnly).toEqual([]);
  });

  it("behandelt Flohmarkt-Level 0 als allgemeine Freischaltung und noFlea als nicht handelbar", () => {
    expect(fleaPlayerLevel({ fleaLevel: 0, noFlea: false }, 15)).toBe(15);
    expect(fleaPlayerLevel({ fleaLevel: 25, noFlea: false }, 15)).toBe(25);
    expect(fleaPlayerLevel({ fleaLevel: 0, noFlea: true }, 15)).toBeNull();
    expect(fleaPlayerLevel({ fleaLevel: 0, noFlea: false }, null)).toBeNull();
  });

  it("meldet Teile ohne Angebot und nicht handelbare Teile, statt sie zu verschweigen", () => {
    const ghost: ItemSources = { itemId: "ohne-angebot", offers: [], fleaLevel: 0, noFlea: true };
    const s = summarizeProcurement(context, [...parts(M4A1), ghost]);
    expect(s.traderRoute).toMatchObject({ complete: false, missing: ["ohne-angebot"] });
    expect(s.fleaRoute).toMatchObject({ complete: false, notOnFlea: ["ohne-angebot"], playerLevel: 25 });
  });

  it("stellt Angebote mit Aufgabe hinter freie Angebote und sammelt die Aufgaben", () => {
    const item: ItemSources = {
      itemId: "x",
      fleaLevel: 0,
      noFlea: false,
      offers: [
        { kind: "buy", traderId: MECHANIC, traderLevel: 1, taskId: "aufgabe", price: 1, currency: "RUB", priceRub: 1, buyLimit: null },
        { kind: "buy", traderId: PEACEKEEPER, traderLevel: 2, taskId: null, price: 1, currency: "USD", priceRub: null, buyLimit: null },
      ],
    };
    expect(summarizeProcurement(context, [item]).parts[0]!.offer).toMatchObject({ traderId: PEACEKEEPER, taskId: null });
    const onlyTask: ItemSources = { ...item, offers: [item.offers[0]!] };
    expect(summarizeProcurement(context, [onlyTask]).traderRoute.tasks).toEqual(["aufgabe"]);
  });
});
