import type { Metadata } from "next";
import Link from "next/link";
import { safeReturnTo } from "@tbh/auth";
import { loadDisplayNames } from "@tbh/game-data";
import { getItemLangSetting, getLocale } from "@/lib/i18n";
import { activeDataset } from "@/lib/gunsmith-server";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Einstellungen · Settings", robots: { index: false } };

/** Beispiel-Items für die Vorschau (echte IDs aus den Spieldaten). */
const PREVIEW = [
  "5447a9cd4bdc2dbd208b4567", // Colt M4A1
  "55d3632e4bdc2d972f8b4569", // 370-mm-Lauf
  "55d4887d4bdc2d962f8b4570", // STANAG
  "55d6190f4bdc2d87028b4567", // MINI MONSTER
  "54527a984bdc2d4e668b4567", // M855
];

const text = {
  de: {
    title: "Einstellungen",
    ui: "Sprache der Seite",
    uiHelp: "Menüs, Texte und Hinweise.",
    items: "Item-Namen",
    itemsHelp: "Wie Waffen, Teile und Munition heißen. Unabhängig von der Seitensprache – praktisch, wenn du das Spiel auf Englisch spielst.",
    auto: "Wie die Seitensprache",
    de: "Deutsch",
    deSub: "Deutsche Spielnamen, sofern übersetzt",
    en: "Englisch",
    enSub: "Originalnamen wie im englischen Client",
    save: "Speichern",
    saved: "Gespeichert.",
    back: "Zurück",
    search: "Die Suche findet Items immer in beiden Sprachen.",
    stored: "Die Wahl wird in diesem Browser gespeichert (Cookie).",
    preview: "Vorschau",
  },
  en: {
    title: "Settings",
    ui: "Site language",
    uiHelp: "Menus, texts and hints.",
    items: "Item names",
    itemsHelp: "How weapons, parts and ammo are named. Independent of the site language – handy if you play the game in English.",
    auto: "Same as site language",
    de: "German",
    deSub: "German in-game names where translated",
    en: "English",
    enSub: "Original names as in the English client",
    save: "Save",
    saved: "Saved.",
    back: "Back",
    search: "Search always finds items in both languages.",
    stored: "Your choice is stored in this browser (cookie).",
    preview: "Preview",
  },
} as const;

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const back = safeReturnTo(typeof sp["back"] === "string" ? sp["back"] : null);
  const [locale, itemSetting, ds] = await Promise.all([getLocale(), getItemLangSetting(), activeDataset("pvp")]);
  const t = text[locale];
  const itemLang = itemSetting === "auto" ? locale : itemSetting;
  const names = ds ? await loadDisplayNames(db(), ds.id, itemLang, PREVIEW) : new Map();

  const radio = (name: string, value: string, checked: boolean, label: string, sub?: string) => (
    <label className="panel" style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", cursor: "pointer", borderColor: checked ? "var(--accent)" : undefined }}>
      <input type="radio" name={name} value={value} defaultChecked={checked} style={{ accentColor: "var(--accent)", width: 18, height: 18 }} />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {sub && <span style={{ fontSize: 13, color: "var(--faint)" }}>{sub}</span>}
      </span>
    </label>
  );

  return (
    <div className="container" style={{ padding: "40px 32px 0", display: "flex", flexWrap: "wrap", gap: "32px 48px", alignItems: "flex-start" }}>
      <form action="/einstellungen/speichern" method="post" style={{ flex: "1 1 420px", maxWidth: 560, display: "flex", flexDirection: "column", gap: 28 }}>
        <h1 className="head" style={{ margin: 0, fontSize: 48, lineHeight: 1 }}>
          {t.title}
        </h1>
        {sp["saved"] === "1" && (
          <p role="status" className="tag tag-ok" style={{ margin: 0, alignSelf: "flex-start" }}>
            {t.saved}
          </p>
        )}
        <input type="hidden" name="back" value={back} />
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <legend className="head" style={{ fontSize: 22, marginBottom: 4 }}>
            {t.ui}
          </legend>
          <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--muted)" }}>{t.uiHelp}</p>
          {radio("ui", "de", locale === "de", "Deutsch")}
          {radio("ui", "en", locale === "en", "English")}
        </fieldset>
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <legend className="head" style={{ fontSize: 22, marginBottom: 4 }}>
            {t.items}
          </legend>
          <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--muted)" }}>{t.itemsHelp}</p>
          {radio("items", "auto", itemSetting === "auto", t.auto)}
          {radio("items", "de", itemSetting === "de", t.de, t.deSub)}
          {radio("items", "en", itemSetting === "en", t.en, t.enSub)}
        </fieldset>
        <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)" }}>{t.search}</p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" className="btn btn-primary">
            {t.save}
          </button>
          <Link href={back} className="btn">
            {t.back}
          </Link>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--faint)" }}>{t.stored}</p>
      </form>
      {names.size > 0 && (
        <aside className="panel" aria-labelledby="vorschau" style={{ flex: "1 1 360px", maxWidth: 560, padding: "14px 18px" }}>
          <h2 id="vorschau" className="head" style={{ margin: "0 0 8px", fontSize: 20 }}>
            {t.preview}
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {PREVIEW.map((id) => (
              <li key={id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                {names.get(id)?.name ?? id}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
