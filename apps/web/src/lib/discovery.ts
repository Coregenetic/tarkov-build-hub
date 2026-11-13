import "server-only";
import type { SearchHit } from "@tbh/builds";
import type { BuildCardItem } from "@/components/builds/BuildCards";
import type { Locale, Messages } from "./i18n";
import { caliberLabels, weaponCards } from "./gunsmith-server";

/** Karten aus Suchtreffern: Waffenname und Bild aus dem aktiven Datensatz, Kaliber lesbar. */
export async function cardsFromHits(hits: SearchHit[], datasetId: number | null, itemLang: Locale, locale: Locale, t: Messages): Promise<BuildCardItem[]> {
  const [weapons, calibers] = datasetId ? await Promise.all([weaponCards(datasetId, hits.map((h) => h.weaponExtId), itemLang), caliberLabels(datasetId)]) : [new Map(), new Map<string, string>()];
  const nf = new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB");
  return hits.map((h) => {
    const w = weapons.get(h.weaponExtId);
    const stats = [
      h.ergonomics !== null ? `Ergo ${nf.format(Math.round(h.ergonomics))}` : null,
      h.recoilVertical !== null ? `${locale === "de" ? "Rückstoß" : "Recoil"} ${h.recoilVertical}` : null,
      h.partsPrice !== null ? `${nf.format(h.partsPrice)} ₽` : null,
    ].filter(Boolean);
    return {
      href: `/b/${h.publicId}`,
      title: h.title,
      weapon: [w?.name.short, h.caliber ? (calibers.get(h.caliber) ?? h.caliber.replace(/^Caliber/, "")) : null].filter(Boolean).join(" · "),
      img: w?.img ?? null,
      meta: `${t[`purpose_${h.purpose}`]} · Patch ${h.patchLabel ?? "—"} · ${t.s_by} ${h.owner.displayName}`,
      detail: `${stats.join(" · ")}${h.forkCount > 0 ? ` · ${h.forkCount} ${h.forkCount === 1 ? t.variant_one : t.variants}` : ""}`,
      badge: null,
    };
  });
}
