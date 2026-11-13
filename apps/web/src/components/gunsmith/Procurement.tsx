"use client";

import type { ChosenOffer, ProcurementSummary } from "@tbh/game-data/procurement";
import type { GunsmithMessages } from "@/gunsmith/messages";
import type { Lang, WeaponBundle } from "@/gunsmith/types";
import { formatNumber, pickName, pickText } from "@/gunsmith/view";
import s from "./gunsmith.module.css";

interface Props {
  bundle: WeaponBundle;
  summary: ProcurementSummary;
  lang: Lang;
  uiLang: Lang;
  t: GunsmithMessages;
  onClose: () => void;
}

export function Procurement({ bundle, summary, lang, uiLang, t, onClose }: Props) {
  const traderName = (id: string) => pickText(bundle.procurement.traders.find((tr) => tr.id === id)?.names, lang, id);
  const itemInfo = (id: string) => {
    const item = bundle.items[id];
    const ammo = bundle.ammo.find((a) => a.id === id);
    const n = pickName(item?.names ?? ammo?.names, lang);
    return { name: n.name, short: n.short, img: item?.img512 ?? ammo?.img ?? null };
  };
  const short = (id: string) => pickName(bundle.items[id]?.names ?? bundle.ammo.find((a) => a.id === id)?.names, lang).short;
  const offerLabel = (o: ChosenOffer) => `${traderName(o.traderId)} LL${o.traderLevel}${o.kind === "barter" ? ` · ${t.buy_barter}` : ""}`;
  const requirement = (o: ChosenOffer) => {
    const parts: string[] = [];
    if (o.traderLevel === 1 || o.requiredPlayerLevel === null) parts.push(t.buy_instant);
    else parts.push(`Lvl ${o.requiredPlayerLevel} · ${t.buy_rep} ${formatNumber(o.requiredReputation ?? 0, uiLang, 2)}`);
    if (o.taskId) parts.push(`${t.buy_task}: ${pickText(bundle.procurement.taskNames[o.taskId], lang, o.taskId)}`);
    return parts.join(" · ");
  };
  const tr = summary.traderRoute;
  const fl = summary.fleaRoute;
  const levels = tr.traderLevels.map((l) => `${traderName(l.traderId)} LL${l.level}`).join(" · ");

  return (
    <>
      <div className={s.drawerHead}>
        <div>
          <h2 id="drawer-title" className={s.drawerTitle}>
            {t.buy_title}
          </h2>
          <span className={s.drawerSub}>{t.buy_sub}</span>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          {t.back_to_parts}
        </button>
      </div>
      <div className={s.buySummary}>
        <div className={s.buyTile}>
          <span className={s.small}>{tr.missing.length ? `${t.buy_trader_missing} ${tr.missing.map(short).join(", ")}` : t.buy_trader_all}</span>
          <strong style={{ color: tr.missing.length ? "#e0a458" : undefined }}>
            {t.buy_player_level} {tr.playerLevel ?? "–"}
          </strong>
          <span className={s.small}>{levels}</span>
        </div>
        <div className={s.buyTile}>
          <span className={s.small}>{t.buy_flea_all}</span>
          <strong style={{ color: fl.notOnFlea.length ? "#e0a458" : undefined }}>{fl.notOnFlea.length ? t.buy_flea_not : `${t.buy_player_level} ${fl.playerLevel ?? "–"}`}</strong>
          <span className={s.small}>{fl.notOnFlea.length ? `${fl.notOnFlea.map(short).join(", ")}: ${t.buy_not_on_flea}` : ""}</span>
        </div>
        {tr.tasks.length > 0 && (
          <div className={s.buyTile}>
            <span className={s.small}>{t.buy_task}</span>
            <strong>{tr.tasks.map((id) => pickText(bundle.procurement.taskNames[id], lang, id)).join(", ")}</strong>
          </div>
        )}
      </div>
      <ul className={s.buyRows} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {summary.parts.map((p, index) => {
          const info = itemInfo(p.itemId);
          return (
            <li key={`${p.itemId}-${index}`} className={s.buyRow}>
              <span className={s.thumb}>{info.img && <img src={info.img} alt="" loading="lazy" decoding="async" />}</span>
              <span className={s.buyName} title={info.name}>
                {info.short}
              </span>
              <span className={s.buyTrader}>
                {p.offer ? (
                  <>
                    <strong style={{ fontSize: 13 }}>{offerLabel(p.offer)}</strong>
                    <span className={s.small}>
                      {requirement(p.offer)}
                      {p.alternatives.length > 0 && ` · ${t.buy_also} ${p.alternatives.map(offerLabel).join(", ")}`}
                    </span>
                  </>
                ) : (
                  <strong style={{ fontSize: 13, color: "var(--bad)" }}>{t.buy_no_offer}</strong>
                )}
              </span>
              <span className={s.buyFlea} style={{ color: p.flea.available ? "var(--muted)" : "#e0a458" }}>
                {p.flea.available ? `${t.buy_flea_from} ${p.flea.playerLevel ?? "–"}` : t.buy_not_on_flea}
              </span>
            </li>
          );
        })}
      </ul>
      <p className={s.small} style={{ marginTop: 10 }}>
        {t.buy_note}
      </p>
    </>
  );
}
