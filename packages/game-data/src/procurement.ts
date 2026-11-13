/**
 * Beschaffung eines Builds: Wo bekommt man jedes verbaute Teil, ab welcher
 * Händlerstufe bzw. welchem Flohmarkt-Level?
 *
 * Reine Funktionen ohne Abhängigkeiten – laufen im Browser (Live-Anzeige im
 * Gunsmith) und auf dem Server (Build-Seite) mit demselben Ergebnis.
 * Grundlage sind ausschließlich die Händler-, Tausch- und Flohmarktdaten der
 * Quelle. Fehlt ein Angebot, heißt das „kein Angebot in den Daten“, nicht
 * „gibt es nicht“.
 */

export type Lang = "de" | "en";

export interface TraderLevelInfo {
  level: number;
  requiredPlayerLevel: number;
  requiredReputation: number;
}

export interface TraderInfo {
  id: string;
  names: Partial<Record<Lang, string>>;
  levels: readonly TraderLevelInfo[];
}

export interface Offer {
  kind: "buy" | "barter";
  traderId: string;
  traderLevel: number;
  /** Aufgabe, die das Angebot freischaltet. */
  taskId: string | null;
  /** Nur bei Kauf: Preis in Händlerwährung. */
  price: number | null;
  currency: string | null;
  priceRub: number | null;
  buyLimit: number | null;
}

export interface ItemSources {
  itemId: string;
  offers: readonly Offer[];
  /** minLevelForFlea der Quelle (0 = keine eigene Sperre). */
  fleaLevel: number | null;
  /** Typ "noFlea": nicht auf dem Flohmarkt handelbar. */
  noFlea: boolean;
}

export interface ProcurementContext {
  traders: ReadonlyMap<string, TraderInfo>;
  /** Allgemeine Flohmarkt-Freischaltung (Spielerlevel). */
  fleaMinPlayerLevel: number | null;
}

export interface ChosenOffer extends Offer {
  requiredPlayerLevel: number | null;
  requiredReputation: number | null;
}

export interface PartProcurement {
  itemId: string;
  /** Gewähltes Angebot (siehe chooseOffers), null = kein Händler- oder Tauschangebot. */
  offer: ChosenOffer | null;
  /** Weitere Angebote, für „auch bei …“. */
  alternatives: ChosenOffer[];
  flea: { available: boolean; playerLevel: number | null };
}

export interface ProcurementSummary {
  parts: PartProcurement[];
  traderRoute: {
    /** Alle Teile über Händler (Kauf oder Tausch) erhältlich? */
    complete: boolean;
    /** Höchstes nötiges Spielerlevel der gewählten Angebote. */
    playerLevel: number | null;
    /** Nötige Stufe je Händler (höchste gewählte). */
    traderLevels: { traderId: string; level: number; requiredPlayerLevel: number | null; requiredReputation: number | null }[];
    /** Teile ohne Händler- und Tauschangebot. */
    missing: string[];
    /** Aufgaben, die gewählte Angebote freischalten. */
    tasks: string[];
    /** Teile, die nur per Tausch erhältlich sind. */
    barterOnly: string[];
  };
  fleaRoute: {
    complete: boolean;
    /** Höchstes Flohmarkt-Level der handelbaren Teile. */
    playerLevel: number | null;
    notOnFlea: string[];
  };
}

function levelInfo(ctx: ProcurementContext, traderId: string, level: number): TraderLevelInfo | null {
  return ctx.traders.get(traderId)?.levels.find((l) => l.level === level) ?? null;
}

function withRequirements(ctx: ProcurementContext, offer: Offer): ChosenOffer {
  const info = levelInfo(ctx, offer.traderId, offer.traderLevel);
  return { ...offer, requiredPlayerLevel: info?.requiredPlayerLevel ?? null, requiredReputation: info?.requiredReputation ?? null };
}

/** Rangfolge: ohne Aufgabe vor mit Aufgabe, niedriges Spielerlevel, Kauf vor Tausch, niedrige Stufe. */
function rank(a: ChosenOffer, b: ChosenOffer): number {
  return (
    Number(a.taskId !== null) - Number(b.taskId !== null) ||
    (a.requiredPlayerLevel ?? 999) - (b.requiredPlayerLevel ?? 999) ||
    Number(a.kind === "barter") - Number(b.kind === "barter") ||
    a.traderLevel - b.traderLevel ||
    a.traderId.localeCompare(b.traderId)
  );
}

/**
 * Wählt je Teil ein Angebot so, dass möglichst wenige zusätzliche
 * Händlerstufen nötig werden:
 * 1. Teile mit genau einem Angebot legen Mindeststufen je Händler fest.
 * 2. Andere Teile nehmen bevorzugt ein Angebot, das diese Stufen schon abdecken,
 *    sonst das nach rank() beste.
 */
function chooseOffers(ctx: ProcurementContext, parts: readonly ItemSources[]): Map<string, ChosenOffer[]> {
  const sorted = new Map<string, ChosenOffer[]>();
  for (const p of parts) sorted.set(p.itemId, p.offers.map((o) => withRequirements(ctx, o)).sort(rank));

  const fixed = new Map<string, number>();
  for (const offers of sorted.values()) {
    const only = offers.length === 1 ? offers[0] : undefined;
    if (only && only.taskId === null) fixed.set(only.traderId, Math.max(fixed.get(only.traderId) ?? 0, only.traderLevel));
  }
  for (const [itemId, offers] of sorted) {
    const covered = offers.find((o) => o.taskId === null && (fixed.get(o.traderId) ?? 0) >= o.traderLevel);
    if (covered && covered !== offers[0]) sorted.set(itemId, [covered, ...offers.filter((o) => o !== covered)]);
  }
  return sorted;
}

export function fleaPlayerLevel(source: Pick<ItemSources, "fleaLevel" | "noFlea">, fleaMinPlayerLevel: number | null): number | null {
  if (source.noFlea) return null;
  const own = source.fleaLevel ?? 0;
  if (fleaMinPlayerLevel === null) return own > 0 ? own : null;
  return Math.max(own, fleaMinPlayerLevel);
}

export function summarizeProcurement(ctx: ProcurementContext, parts: readonly ItemSources[]): ProcurementSummary {
  const chosen = chooseOffers(ctx, parts);
  const result: PartProcurement[] = parts.map((p) => {
    const offers = chosen.get(p.itemId) ?? [];
    return {
      itemId: p.itemId,
      offer: offers[0] ?? null,
      alternatives: offers.slice(1),
      flea: { available: !p.noFlea, playerLevel: fleaPlayerLevel(p, ctx.fleaMinPlayerLevel) },
    };
  });

  const traderLevels = new Map<string, number>();
  const tasks = new Set<string>();
  const missing: string[] = [];
  const barterOnly: string[] = [];
  let playerLevel: number | null = null;
  for (const part of result) {
    const o = part.offer;
    if (!o) {
      missing.push(part.itemId);
      continue;
    }
    traderLevels.set(o.traderId, Math.max(traderLevels.get(o.traderId) ?? 0, o.traderLevel));
    if (o.taskId) tasks.add(o.taskId);
    if (o.requiredPlayerLevel !== null) playerLevel = Math.max(playerLevel ?? 0, o.requiredPlayerLevel);
    if (o.kind === "barter" && part.alternatives.every((a) => a.kind === "barter")) barterOnly.push(part.itemId);
  }

  const notOnFlea = result.filter((p) => !p.flea.available).map((p) => p.itemId);
  const fleaLevels = result.map((p) => p.flea.playerLevel).filter((l): l is number => l !== null);

  return {
    parts: result,
    traderRoute: {
      complete: missing.length === 0,
      playerLevel,
      traderLevels: [...traderLevels]
        .map(([traderId, level]) => {
          const info = levelInfo(ctx, traderId, level);
          return { traderId, level, requiredPlayerLevel: info?.requiredPlayerLevel ?? null, requiredReputation: info?.requiredReputation ?? null };
        })
        .sort((a, b) => a.traderId.localeCompare(b.traderId)),
      missing,
      tasks: [...tasks].sort(),
      barterOnly,
    },
    fleaRoute: {
      complete: notOnFlea.length === 0 && fleaLevels.length === result.length,
      playerLevel: fleaLevels.length > 0 ? Math.max(...fleaLevels) : null,
      notOnFlea,
    },
  };
}
