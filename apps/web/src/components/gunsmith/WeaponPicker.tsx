"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GunsmithMessages } from "@/gunsmith/messages";
import type { Lang } from "@/gunsmith/types";
import { pickName, pickText } from "@/gunsmith/view";
import type { WeaponListEntry } from "@/lib/gunsmith-server";
import s from "./gunsmith.module.css";

interface Props {
  weapons: WeaponListEntry[];
  lang: Lang;
  uiLang: Lang;
  t: GunsmithMessages;
}

export function WeaponPicker({ weapons, lang, uiLang, t }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const w of weapons) {
      if (!w.categoryId) continue;
      const entry = map.get(w.categoryId) ?? { label: pickText(w.category, uiLang, w.categoryId), count: 0 };
      entry.count++;
      map.set(w.categoryId, entry);
    }
    return [...map].sort((a, b) => b[1].count - a[1].count);
  }, [weapons, uiLang]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return weapons
      .filter((w) => !category || w.categoryId === category)
      .filter((w) => !q || Object.values(w.names).some((n) => n && (n.name.toLocaleLowerCase().includes(q) || n.short.toLocaleLowerCase().includes(q))))
      .sort((a, b) => pickName(a.names, lang).short.localeCompare(pickName(b.names, lang).short));
  }, [weapons, query, category, lang]);

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <label className={s.search} title={t.pick_search_hint}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="#9C9A94" strokeWidth="1.5" />
            <path d="M11 11L15 15" stroke="#9C9A94" strokeWidth="1.5" />
          </svg>
          <span className="visually-hidden">{t.pick_search}</span>
          <input type="search" value={query} placeholder={t.pick_search} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div role="radiogroup" aria-label="Kategorie" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" role="radio" aria-checked={category === null} className={`${s.chip} ${category === null ? s.chipOn : ""}`} onClick={() => setCategory(null)}>
            {t.pick_all} ({weapons.length})
          </button>
          {categories.map(([id, c]) => (
            <button key={id} type="button" role="radio" aria-checked={category === id} className={`${s.chip} ${category === id ? s.chipOn : ""}`} onClick={() => setCategory(id)}>
              {c.label} ({c.count})
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>{t.pick_none}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {shown.map((w) => {
            const n = pickName(w.names, lang);
            return (
              <li key={w.id}>
                <Link href={`/gunsmith/${w.id}`} className={s.card} style={{ height: "100%" }}>
                  <span className={s.cardImg} style={{ height: 110 }}>
                    {w.img && <img src={w.img} alt="" loading="lazy" decoding="async" style={{ maxHeight: 96 }} />}
                  </span>
                  <span className={s.cardName} style={{ fontSize: 16 }}>
                    {n.short}
                  </span>
                  <span className={s.cardMeta}>{n.name}</span>
                  <span className={s.cardMeta}>
                    {pickText(w.category, uiLang, "")}
                    {w.presetCount > 0 ? ` · ${w.presetCount} ${t.pick_presets}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
