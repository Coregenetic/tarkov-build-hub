import type { Metadata } from "next";
import { WeaponPicker } from "@/components/gunsmith/WeaponPicker";
import { gunsmithMessages } from "@/gunsmith/messages";
import { getItemLang, getLocale } from "@/lib/i18n";
import { activeDataset, listWeapons } from "@/lib/gunsmith-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gunsmith" };

export default async function GunsmithIndex() {
  const [uiLang, itemLang, ds] = await Promise.all([getLocale(), getItemLang(), activeDataset("pvp")]);
  const t = gunsmithMessages[uiLang];
  if (!ds) {
    return (
      <div className="container" style={{ padding: "48px 32px" }}>
        <h1 className="head" style={{ fontSize: 44, margin: 0 }}>
          {t.pick_title}
        </h1>
        <p style={{ color: "var(--muted)" }}>{t.no_dataset}</p>
      </div>
    );
  }
  const weapons = await listWeapons(ds.id);
  return (
    <div className="container" style={{ padding: "40px 32px 0" }}>
      <h1 className="head" style={{ fontSize: 48, lineHeight: 1, margin: 0 }}>
        {t.pick_title}
      </h1>
      <p style={{ color: "var(--muted)", maxWidth: 640, margin: "10px 0 24px" }}>
        {t.pick_lead} <span style={{ color: "var(--faint)" }}>{ds.mode.toUpperCase()} · Patch {ds.patch ?? "—"}</span>
      </p>
      <WeaponPicker weapons={weapons} lang={itemLang} uiLang={uiLang} t={t} />
    </div>
  );
}
