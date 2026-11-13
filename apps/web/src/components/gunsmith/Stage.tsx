"use client";

import { useEffect, useRef, useState } from "react";
import type { BuildNode } from "@tbh/compat-engine";
import type { Layout } from "@/gunsmith/layout";
import type { GunsmithMessages } from "@/gunsmith/messages";
import type { Lang, WeaponBundle } from "@/gunsmith/types";
import { pickName, slotLabel } from "@/gunsmith/view";
import s from "./gunsmith.module.css";

interface Props {
  bundle: WeaponBundle;
  build: BuildNode;
  layout: Layout;
  lang: Lang;
  t: GunsmithMessages;
  focusedKey: string | null;
  errorPaths: Set<string>;
  onPick: (path: string[]) => void;
  /** Auf die volle Breite einpassen (Handy: Übersicht, gewählt wird in der Liste). */
  fit?: boolean;
  /** Nur ansehen (Build-Seite): keine Auswahl, kein Hinweis. */
  readOnly?: boolean;
}

const CAPTION = 18;

/** Aufbauansicht: Kästen aus layoutBuild, als Ganzes auf die verfügbare Breite skaliert. */
export function Stage({ bundle, build, layout, lang, t, focusedKey, errorPaths, onPick, fit = false, readOnly = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(1100);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAvailable(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auf schmalen Bildschirmen nicht unter 0,72 verkleinern – dann lieber seitlich scrollen.
  const scale = fit ? Math.min(1, available / layout.width) : Math.max(0.72, Math.min(1.55, available / layout.width));
  const parentOf = (path: string[]) => {
    let node: BuildNode | undefined = build;
    for (const id of path.slice(0, -1)) node = node?.slots?.[id];
    return node;
  };
  const extra = layout.boxes.filter((b) => b.zone === "extra");
  const extraTop = extra.length ? Math.min(...extra.map((b) => b.y)) : null;

  return (
    <div className={s.stageWrap} ref={wrap}>
      <div className={s.stageOuter} style={{ width: layout.width * scale, height: layout.height * scale }}>
        <div className={s.stage} style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
          <span className={s.axisLine} style={{ left: 4, right: 4, top: layout.axisY }} aria-hidden="true" />
          {extraTop !== null && (
            <span className={s.extraLabel} style={{ left: 8, top: extraTop - 16 }}>
              {t.extra_parts}
            </span>
          )}
          {layout.boxes.map((b) => {
            const isRoot = b.path.length === 0;
            const parent = isRoot ? undefined : parentOf(b.path);
            const slotName = !isRoot && parent && b.slotId ? slotLabel(bundle, parent.itemId, b.slotId, lang) : t.weapon;
            const item = b.itemId ? bundle.items[b.itemId] : undefined;
            const name = b.itemId ? pickName(item?.names, lang) : null;
            const focused = focusedKey === b.key;
            const error = errorPaths.has(b.key);
            const cls = [s.box, focused ? s.boxFocus : "", error ? s.boxError : "", !b.itemId ? s.boxEmpty : ""].join(" ");
            const capCls = [s.caption, focused ? s.captionFocus : "", error ? s.captionError : ""].join(" ");
            return (
              <div key={b.key || "root"}>
                {readOnly ? (
                  <span className={cls} style={{ left: b.x, top: b.y, width: b.w, height: b.h, cursor: "default", boxShadow: "none" }} title={name ? `${slotName}: ${name.name}` : undefined}>
                    {name ? item?.img ? <img src={item.img} alt={`${slotName}: ${name.name}`} loading="lazy" decoding="async" /> : <span>{name.short}</span> : null}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={cls}
                    style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                    aria-label={name ? `${slotName}: ${name.name}` : `${slotName}: ${t.empty_slot}`}
                    aria-pressed={focused}
                    onClick={() => onPick(b.path)}
                  >
                    {name ? item?.img ? <img src={item.img} alt="" loading="lazy" decoding="async" /> : <span>{name.short}</span> : <span aria-hidden="true">+</span>}
                  </button>
                )}
                <span className={capCls} style={{ left: b.x - 5, top: b.y + b.h + 1, width: b.w + 10, height: CAPTION }} aria-hidden="true">
                  {name ? name.short : `+ ${slotName}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {!readOnly && <p className={s.hint}>{fit ? t.stage_hint_narrow : t.stage_hint}</p>}
    </div>
  );
}
