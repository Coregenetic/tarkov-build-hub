"use client";

import { useMemo, useState } from "react";
import { checkCandidates, getNode, installPart, listSlotCandidates, type BuildNode, type GameData } from "@tbh/compat-engine";
import type { GunsmithMessages } from "@/gunsmith/messages";
import type { Lang, WeaponBundle } from "@/gunsmith/types";
import { issueText, itemMatches, percent, pickName, rubles, signed, slotLabel } from "@/gunsmith/view";
import s from "./gunsmith.module.css";

interface Props {
  bundle: WeaponBundle;
  data: GameData;
  build: BuildNode;
  parentPath: string[];
  slotId: string;
  lang: Lang;
  uiLang: Lang;
  t: GunsmithMessages;
  onInstall: (itemId: string | null) => void;
  onClose: () => void;
}

type Sort = "name" | "price" | "erg" | "recoil";

export function PartPicker({ bundle, data, build, parentPath, slotId, lang, uiLang, t, onInstall, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [onlyFitting, setOnlyFitting] = useState(false);
  const [sort, setSort] = useState<Sort>("name");

  const parent = getNode(build, parentPath);
  const parentDef = parent ? data.getItem(parent.itemId) : undefined;
  const slotDef = parentDef?.slots.find((x) => x.id === slotId);
  const current = parent?.slots?.[slotId];
  const label = parent ? slotLabel(bundle, parent.itemId, slotId, lang) : slotId;

  const candidates = useMemo(() => {
    if (!parentDef || !slotDef) return [];
    const ids = listSlotCandidates(data, slotId, parentDef);
    const checks = checkCandidates(data, build, parentPath, slotId, ids);
    return checks.map((c) => {
      let detached = 0;
      let carried = 0;
      if (current?.slots && c.itemId !== current.itemId) {
        const r = installPart(build, parentPath, slotId, c.itemId, data);
        detached = r.detached.length;
        carried = Object.keys(current.slots).length - detached;
      }
      return { ...c, detached, carried };
    });
  }, [data, build, parentPath, slotId, parentDef, slotDef, current]);

  const shown = useMemo(() => {
    const list = candidates.filter((c) => itemMatches(bundle.items[c.itemId], query.trim()) && (!onlyFitting || c.fits || c.itemId === current?.itemId));
    const it = (id: string) => bundle.items[id];
    const by: Record<Sort, (a: string, b: string) => number> = {
      name: (a, b) => pickName(it(a)?.names, lang).name.localeCompare(pickName(it(b)?.names, lang).name),
      price: (a, b) => (it(a)?.price ?? Infinity) - (it(b)?.price ?? Infinity),
      erg: (a, b) => (it(b)?.ergonomics ?? 0) - (it(a)?.ergonomics ?? 0),
      recoil: (a, b) => (it(a)?.recoilModifier ?? 0) - (it(b)?.recoilModifier ?? 0),
    };
    return list.sort((a, b) => Number(b.itemId === current?.itemId) - Number(a.itemId === current?.itemId) || Number(b.fits) - Number(a.fits) || by[sort](a.itemId, b.itemId));
  }, [candidates, query, onlyFitting, sort, bundle, lang, current]);

  const fitCount = candidates.filter((c) => c.fits).length;

  return (
    <>
      <div className={s.drawerHead}>
        <div>
          <h2 id="drawer-title" className={s.drawerTitle}>
            {label} {t.choose}
          </h2>
          <span className={s.drawerSub}>
            {fitCount} {t.fits} · {candidates.length} {uiLang === "de" ? "in den Daten" : "in the data"}
            {slotDef?.required ? ` · ${t.required_slot}` : ""}
          </span>
        </div>
        <div className={s.tools}>
          <label className={s.search}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5" fill="none" stroke="#9C9A94" strokeWidth="1.5" />
              <path d="M11 11L15 15" stroke="#9C9A94" strokeWidth="1.5" />
            </svg>
            <span className="visually-hidden">{t.search_parts}</span>
            <input type="search" value={query} placeholder={t.search_parts} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="button" className={`${s.chip} ${onlyFitting ? s.chipOn : ""}`} aria-pressed={onlyFitting} onClick={() => setOnlyFitting(!onlyFitting)}>
            {t.only_fitting}
          </button>
          <label className="visually-hidden" htmlFor="part-sort">
            Sort
          </label>
          <select id="part-sort" className={s.select} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="name">{t.sort_name}</option>
            <option value="price">{t.sort_price}</option>
            <option value="erg">{t.sort_erg}</option>
            <option value="recoil">{t.sort_recoil}</option>
          </select>
          <button type="button" className="btn" onClick={onClose}>
            {t.all_slots}
          </button>
        </div>
      </div>

      {candidates.length === 0 ? (
        <p className={s.small}>{t.no_parts}</p>
      ) : (
        <div className={s.cards} role="radiogroup" aria-labelledby="drawer-title">
          {!slotDef?.required && (
            <button type="button" role="radio" aria-checked={!current} className={`${s.card} ${!current ? s.cardSel : ""}`} onClick={() => onInstall(null)}>
              <span className={s.cardImg}>{t.leave_empty}</span>
              <span className={s.cardName}>{t.leave_empty}</span>
              {current?.slots && Object.keys(current.slots).length > 0 && (
                <span className={s.cardFit} style={{ color: "#e0a458" }}>
                  {t.attached_parts}: {Object.keys(current.slots).length} {t.detached_children}
                </span>
              )}
            </button>
          )}
          {shown.map((c) => {
            const item = bundle.items[c.itemId];
            const name = pickName(item?.names, lang);
            const selected = c.itemId === current?.itemId;
            const meta = [
              item?.ergonomics ? `Ergo ${signed(item.ergonomics, uiLang)}` : null,
              item?.recoilModifier ? `${t.sort_recoil} ${percent(item.recoilModifier, uiLang)}` : null,
              item?.price ? rubles(item.price, uiLang) : t.no_price,
            ]
              .filter(Boolean)
              .join(" · ");
            const fitText = selected ? t.installed : c.fits ? t.fits : c.issues.map((i) => issueText(i, bundle, lang, t)).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
            return (
              <button
                key={c.itemId}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`${s.card} ${selected ? s.cardSel : ""} ${!c.fits && !selected ? s.cardNo : ""}`}
                onClick={() => !selected && onInstall(c.itemId)}
                title={name.name}
              >
                <span className={s.cardImg}>{item?.img512 ? <img src={item.img512} alt="" loading="lazy" decoding="async" /> : name.short}</span>
                <span className={s.cardName}>{name.name}</span>
                <span className={s.cardMeta}>{meta}</span>
                <span className={s.cardFit} style={{ color: c.fits || selected ? "var(--ok)" : "var(--bad)" }}>
                  {fitText}
                </span>
                {!selected && (c.detached > 0 || c.carried > 0) && (
                  <span className={s.cardMeta} style={{ color: c.detached > 0 ? "#e0a458" : undefined }}>
                    {t.attached_parts}: {c.detached > 0 ? `${c.detached} ${t.detached_children}` : `${c.carried} ${t.moved_children}`}
                  </span>
                )}
              </button>
            );
          })}
          {shown.length === 0 && <p className={s.small}>{t.no_match}</p>}
        </div>
      )}
    </>
  );
}
