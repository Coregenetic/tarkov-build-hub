import { findNameIssues } from "./name-issues.ts";
import type { NameIssue } from "./name-issues.ts";
import type { Lang, NormalizedDataset } from "./types.ts";

export interface ValidationReport {
  itemCount: number;
  gunCount: number;
  presetCount: number;
  itemsWithSlots: number;
  slotCount: number;
  allowedLinkCount: number;
  /** Erlaubt-Verweise auf Items, die im Datensatz nicht vorkommen. */
  danglingAllowed: number;
  danglingAllowedSamples: string[];
  danglingContains: number;
  missingNames: Partial<Record<Lang, number>>;
  rejectedCount: number;
  traderCount: number;
  traderOfferCount: number;
  barterCount: number;
  taskCount: number;
  /** Händlerangebote und Tausch, deren Aufgabe nicht in den Daten steht. */
  unknownTaskRefs: number;
  fleaMinPlayerLevel: number | null;
  nameIssues: Record<NameIssue["kind"], number>;
  nameIssueList: NameIssue[];
  errors: string[];
  warnings: string[];
}

export interface ValidationThresholds {
  /** Mindestanzahl Items, sonst gilt der Abruf als kaputt. */
  minItems: number;
  minGuns: number;
  /** Höchstanteil fehlender Namen je Sprache, bevor gewarnt wird. */
  maxMissingNameRatio: number;
  /** Höchstanteil hängender Erlaubt-Verweise, bevor es ein Fehler ist. */
  maxDanglingRatio: number;
}

export const DEFAULT_THRESHOLDS: ValidationThresholds = {
  minItems: 1000,
  minGuns: 50,
  maxMissingNameRatio: 0.02,
  maxDanglingRatio: 0.01,
};

export function validateDataset(
  dataset: NormalizedDataset,
  rejectedCount: number,
  thresholds: ValidationThresholds = DEFAULT_THRESHOLDS,
): ValidationReport {
  const ids = new Set(dataset.items.map((i) => i.extId));
  const report: ValidationReport = {
    itemCount: dataset.items.length,
    gunCount: 0,
    presetCount: 0,
    itemsWithSlots: 0,
    slotCount: 0,
    allowedLinkCount: 0,
    danglingAllowed: 0,
    danglingAllowedSamples: [],
    danglingContains: 0,
    missingNames: {},
    rejectedCount,
    traderCount: dataset.traders.length,
    traderOfferCount: 0,
    barterCount: dataset.barters.length,
    taskCount: dataset.tasks.length,
    unknownTaskRefs: 0,
    fleaMinPlayerLevel: dataset.fleaMinPlayerLevel,
    nameIssues: { cyrillic: 0, caliber: 0 },
    nameIssueList: [],
    errors: [],
    warnings: [],
  };

  const langs = new Set<Lang>();
  for (const item of dataset.items) for (const l of Object.keys(item.names) as Lang[]) langs.add(l);

  for (const item of dataset.items) {
    if (item.types.includes("gun")) report.gunCount++;
    if (item.types.includes("preset")) report.presetCount++;
    if (item.slots.length > 0) report.itemsWithSlots++;
    report.slotCount += item.slots.length;
    for (const slot of item.slots) {
      for (const allowed of slot.filter.allowedItems) {
        report.allowedLinkCount++;
        if (!ids.has(allowed)) {
          report.danglingAllowed++;
          if (report.danglingAllowedSamples.length < 10) report.danglingAllowedSamples.push(`${item.extId}/${slot.nameId} → ${allowed}`);
        }
      }
    }
    for (const c of item.contains) if (!ids.has(c.itemExtId)) report.danglingContains++;
    for (const lang of langs) {
      if (!item.names[lang]) report.missingNames[lang] = (report.missingNames[lang] ?? 0) + 1;
    }
  }

  const traderIds = new Set(dataset.traders.map((t) => t.extId));
  const taskIds = new Set(dataset.tasks.map((t) => t.extId));
  let unknownTraders = 0;
  for (const item of dataset.items) {
    for (const offer of item.traderOffers) {
      report.traderOfferCount++;
      if (!traderIds.has(offer.traderExtId)) unknownTraders++;
      if (offer.taskExtId && !taskIds.has(offer.taskExtId)) report.unknownTaskRefs++;
    }
  }
  for (const barter of dataset.barters) {
    if (!traderIds.has(barter.traderExtId)) unknownTraders++;
    if (barter.taskExtId && !taskIds.has(barter.taskExtId)) report.unknownTaskRefs++;
  }

  report.nameIssueList = findNameIssues(dataset);
  for (const issue of report.nameIssueList) report.nameIssues[issue.kind]++;

  if (report.itemCount < thresholds.minItems) {
    report.errors.push(`Nur ${report.itemCount} Items, erwartet mindestens ${thresholds.minItems}. Abruf vermutlich unvollständig.`);
  }
  if (report.gunCount < thresholds.minGuns) {
    report.errors.push(`Nur ${report.gunCount} Waffen, erwartet mindestens ${thresholds.minGuns}.`);
  }
  if (report.allowedLinkCount > 0 && report.danglingAllowed / report.allowedLinkCount > thresholds.maxDanglingRatio) {
    report.errors.push(`${report.danglingAllowed} von ${report.allowedLinkCount} Erlaubt-Verweisen zeigen auf fehlende Items.`);
  } else if (report.danglingAllowed > 0) {
    report.warnings.push(`${report.danglingAllowed} Erlaubt-Verweise zeigen auf Items, die nicht im Datensatz sind (werden bei der Prüfung als unbekannt behandelt).`);
  }
  if (report.danglingContains > 0) {
    report.warnings.push(`${report.danglingContains} Preset-Bestandteile verweisen auf fehlende Items.`);
  }
  for (const lang of langs) {
    const missing = report.missingNames[lang] ?? 0;
    if (missing / Math.max(1, report.itemCount) > thresholds.maxMissingNameRatio) {
      report.warnings.push(`${missing} Items ohne Namen in „${lang}“.`);
    }
  }
  if (report.traderCount === 0) {
    report.errors.push("Keine Händler in den Daten. Beschaffung wäre leer.");
  } else if (report.traderOfferCount === 0) {
    report.errors.push("Keine Händlerangebote in den Daten. Beschaffung wäre leer.");
  }
  if (unknownTraders > 0) report.warnings.push(`${unknownTraders} Angebote verweisen auf unbekannte Händler.`);
  if (report.unknownTaskRefs > 0) report.warnings.push(`${report.unknownTaskRefs} Angebote verweisen auf unbekannte Aufgaben.`);
  if (report.fleaMinPlayerLevel === null) report.warnings.push("Allgemeines Flohmarkt-Level fehlt in den Daten.");
  if (report.nameIssueList.length > 0) {
    report.warnings.push(
      `${report.nameIssueList.length} auffällige Item-Namen (${report.nameIssues.cyrillic} mit kyrillischen Zeichen, ${report.nameIssues.caliber} mit abweichendem Kaliber).`,
    );
  }
  if (rejectedCount > 0) {
    report.warnings.push(`${rejectedCount} Items wurden wegen unbekanntem Format übersprungen.`);
  }
  return report;
}
