/** Kleine Helfer für die Anzeige im Gunsmith (rein, ohne React). */
import type { BuildNode, BuildPath, Issue } from "@tbh/compat-engine";
import type { GunsmithMessages } from "./messages";
import type { BundleItem, Lang, NamePair, WeaponBundle } from "./types";

export function pickName(names: Partial<Record<Lang, NamePair>> | undefined, lang: Lang): NamePair {
  return names?.[lang] ?? names?.[lang === "de" ? "en" : "de"] ?? { name: "?", short: "?" };
}

export function pickText(names: Partial<Record<Lang, string>> | undefined, lang: Lang, fallback: string): string {
  return names?.[lang] ?? names?.[lang === "de" ? "en" : "de"] ?? fallback;
}

/** Lesbarer Slot-Name, sonst der technische Name ohne „mod_“. */
export function slotLabel(bundle: WeaponBundle, parentItemId: string, slotId: string, lang: Lang): string {
  const slot = bundle.items[parentItemId]?.slots.find((s) => s.id === slotId);
  if (!slot) return slotId;
  const named = slot.nameKey ? bundle.slotNames[slot.nameKey] : undefined;
  if (named) return pickText(named, lang, slot.nameId);
  return slot.nameId.replace(/^mod_/, "").replace(/_/g, " ");
}

export function itemMatches(item: BundleItem | undefined, query: string): boolean {
  if (!query) return true;
  if (!item) return false;
  const q = query.toLocaleLowerCase();
  return Object.values(item.names).some((n) => n && (n.name.toLocaleLowerCase().includes(q) || n.short.toLocaleLowerCase().includes(q)));
}

export function issueText(issue: Issue, bundle: WeaponBundle, lang: Lang, t: GunsmithMessages): string {
  const other = issue.otherItemId ? pickName(bundle.items[issue.otherItemId]?.names, lang).short : "";
  switch (issue.code) {
    case "not_allowed":
      return t.reason_not_allowed;
    case "excluded":
      return t.reason_excluded;
    case "conflict_item":
      return `${t.reason_conflict_item} ${other}`;
    case "conflict_category":
      return `${t.reason_conflict_category} ${other}`;
    case "blocked_slot":
      return `${t.reason_blocked_slot} ${other}`;
    case "missing_required":
      return issue.itemId && issue.slotId ? `${t.reason_missing_required} (${slotLabel(bundle, issue.itemId, issue.slotId, lang)})` : t.reason_missing_required;
    default:
      return t.reason_unknown;
  }
}

export function flattenIds(node: BuildNode, out: string[] = []): string[] {
  out.push(node.itemId);
  for (const child of Object.values(node.slots ?? {})) flattenIds(child, out);
  return out;
}

export const pathKey = (path: BuildPath) => path.join("/");

export function formatNumber(v: number, lang: Lang, digits = 0): string {
  return v.toLocaleString(lang === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function signed(v: number, lang: Lang, digits = 1): string {
  if (v === 0) return "0";
  return `${v > 0 ? "+" : "−"}${formatNumber(Math.abs(v), lang, digits)}`;
}

export function percent(fraction: number, lang: Lang): string {
  const v = Math.round(fraction * 1000) / 10;
  return v === 0 ? "0 %" : `${signed(v, lang, 1)} %`;
}

export function rubles(v: number, lang: Lang): string {
  return `${formatNumber(v, lang)} ₽`;
}
