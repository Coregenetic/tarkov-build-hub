import type { Lang, NormalizedDataset } from "./types.js";

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
  if (rejectedCount > 0) {
    report.warnings.push(`${rejectedCount} Items wurden wegen unbekanntem Format übersprungen.`);
  }
  return report;
}
