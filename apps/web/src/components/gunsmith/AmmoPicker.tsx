"use client";

import type { GunsmithMessages } from "@/gunsmith/messages";
import type { Lang, WeaponBundle } from "@/gunsmith/types";
import { percent, pickName, rubles } from "@/gunsmith/view";
import s from "./gunsmith.module.css";

interface Props {
  bundle: WeaponBundle;
  allowed: string[];
  selected: string | null;
  lang: Lang;
  uiLang: Lang;
  t: GunsmithMessages;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function AmmoPicker({ bundle, allowed, selected, lang, uiLang, t, onSelect, onClose }: Props) {
  const list = bundle.ammo.filter((a) => allowed.includes(a.id) || a.id === selected);
  return (
    <>
      <div className={s.drawerHead}>
        <div>
          <h2 id="drawer-title" className={s.drawerTitle}>
            {t.ammo_title}
          </h2>
          <span className={s.drawerSub}>{t.ammo_sub}</span>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          {t.all_slots}
        </button>
      </div>
      {list.length === 0 ? (
        <p className={s.small}>{t.ammo_none}</p>
      ) : (
        <div className={s.cards} role="radiogroup" aria-labelledby="drawer-title">
          {list.map((a) => {
            const on = a.id === selected;
            const fits = allowed.includes(a.id);
            const name = pickName(a.names, lang);
            return (
              <button key={a.id} type="button" role="radio" aria-checked={on} className={`${s.card} ${on ? s.cardSel : ""} ${!fits ? s.cardNo : ""}`} onClick={() => onSelect(a.id)}>
                <span className={s.cardImg}>{a.img ? <img src={a.img} alt="" loading="lazy" decoding="async" /> : name.short}</span>
                <span className={s.cardName}>{name.name}</span>
                <span className={s.cardMeta}>
                  {t.ammo_damage} {a.damage ?? "–"}
                  {a.projectiles && a.projectiles > 1 ? ` × ${a.projectiles}` : ""} · {t.ammo_pen} {a.penetration ?? "–"} · {t.ammo_armor} {a.armorDamage ?? "–"}
                </span>
                <span className={s.cardMeta}>
                  {t.ammo_recoil} {percent(a.recoilModifier ?? 0, uiLang)} · {t.ammo_acc} {percent(a.accuracyModifier ?? 0, uiLang)} · {a.speed ?? "–"} {t.ammo_speed}
                </span>
                <span className={s.cardFit} style={{ color: fits ? "var(--ink-2)" : "var(--bad)" }}>
                  {!fits ? t.reason_not_allowed : a.price ? rubles(a.price, uiLang) : t.no_price}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
