import type { Lang, NormalizedDataset } from "./types.ts";

/**
 * Prüft Item-Namen der Quelle auf Fehler, die Suche und Anzeige stören.
 * Es wird nichts verändert – Funde landen im Prüfbericht, die Korrektur
 * entscheidet ein Admin (eigener Anzeigename).
 */

export type NameIssueKind = "cyrillic" | "caliber";

export interface NameIssue {
  itemExtId: string;
  lang: Lang;
  field: "name" | "shortName";
  kind: NameIssueKind;
  value: string;
  /** Betroffene Zeichen bzw. Kaliberangaben. */
  detail: string;
  /** Korrekturvorschlag, nur wenn er sich eindeutig ableiten lässt. */
  suggestion: string | null;
}

const CYRILLIC = /[Ѐ-ӿ]/g;

/** Kyrillische Buchstaben, die genauso aussehen wie lateinische. */
const HOMOGLYPHS: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X",
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x",
};

function codepoint(c: string): string {
  return `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

export function cyrillicIssue(value: string): { detail: string; suggestion: string | null } | null {
  const found = value.match(CYRILLIC);
  if (!found) return null;
  const unique = [...new Set(found)];
  const replaceable = unique.every((c) => c in HOMOGLYPHS);
  return {
    detail: unique.map((c) => `${c} (${codepoint(c)})`).join(", "),
    suggestion: replaceable ? value.replace(CYRILLIC, (c) => HOMOGLYPHS[c] ?? c) : null,
  };
}

const CALIBER_PROP = /^Caliber(\d+)x(\d+)/;
const CALIBER_IN_NAME = /(\d+)(?:([.,])(\d+))?\s*[xх×]\s*(\d+)/g;

/**
 * Vergleicht das Kaliber im Namen mit dem Kaliber-Feld der Waffe.
 * Nur eindeutige Fälle (Muster „5,56x45“) werden geprüft.
 */
export function caliberIssue(value: string, caliberProperty: unknown): { detail: string; suggestion: string | null } | null {
  if (typeof caliberProperty !== "string") return null;
  const prop = CALIBER_PROP.exec(caliberProperty);
  if (!prop) return null;
  const [, wantBore = "", wantCase = ""] = prop;
  for (const m of value.matchAll(CALIBER_IN_NAME)) {
    const [whole, intPart = "", sep, frac = "", caseLen = ""] = m;
    const bore = intPart + frac;
    if (bore === wantBore && caseLen === wantCase) continue;
    // Vorschlag in derselben Schreibweise (Dezimaltrenner an derselben Stelle).
    let suggestion: string | null = null;
    if (wantBore.length === bore.length) {
      const fixedBore = sep ? `${wantBore.slice(0, intPart.length)}${sep}${wantBore.slice(intPart.length)}` : wantBore;
      suggestion = value.replace(whole, whole.replace(`${intPart}${sep ?? ""}${frac}`, fixedBore).replace(caseLen, wantCase));
    }
    return { detail: `Name: ${whole.trim()}, Daten: ${caliberProperty}`, suggestion };
  }
  return null;
}

export function findNameIssues(dataset: NormalizedDataset): NameIssue[] {
  const issues: NameIssue[] = [];
  for (const item of dataset.items) {
    for (const lang of Object.keys(item.names) as Lang[]) {
      const names = item.names[lang];
      if (!names) continue;
      for (const field of ["name", "shortName"] as const) {
        const value = names[field];
        const cyr = cyrillicIssue(value);
        if (cyr) issues.push({ itemExtId: item.extId, lang, field, kind: "cyrillic", value, ...cyr });
        if (item.types.includes("gun")) {
          const cal = caliberIssue(value, item.properties["caliber"]);
          if (cal) issues.push({ itemExtId: item.extId, lang, field, kind: "caliber", value, ...cal });
        }
      }
    }
  }
  return issues;
}
