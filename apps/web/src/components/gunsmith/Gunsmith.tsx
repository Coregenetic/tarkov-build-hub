"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createGameData,
  installPart,
  itemFromPlain,
  removePart,
  validateBuild,
  type BuildNode,
  type BuildPath,
} from "@tbh/compat-engine";
import { layoutBuild, type LayoutSlot } from "@/gunsmith/layout";
import type { GunsmithMessages } from "@/gunsmith/messages";
import { allowedAmmoFor, computeStats } from "@/gunsmith/stats";
import type { Lang, WeaponBundle } from "@/gunsmith/types";
import { flattenIds, formatNumber, pathKey, percent, pickName, rubles, slotLabel } from "@/gunsmith/view";
import { summarizeProcurement } from "@tbh/game-data/procurement";
import { AmmoPicker } from "./AmmoPicker";
import { PartPicker } from "./PartPicker";
import { Procurement } from "./Procurement";
import { Sheet } from "./Sheet";
import { SlotTree } from "./SlotTree";
import { Stage } from "./Stage";
import s from "./gunsmith.module.css";

export type Focus = { kind: "none" } | { kind: "ammo" } | { kind: "buy" } | { kind: "slot"; parentPath: string[]; slotId: string };

interface Draft {
  build: BuildNode;
  ammo: string | null;
  title: string;
}

interface Props {
  bundle: WeaponBundle;
  uiLang: Lang;
  itemLang: Lang;
  t: GunsmithMessages;
}

/** Slots, die auch leer als „+“-Kasten erscheinen. */
const PRIMARY_EMPTY = /^mod_(scope|muzzle|stock|pistol_?grip|magazine|foregrip|handguard|barrel|reciever|charge|sight_rear|gas_block)/;

/** true auf schmalen Bildschirmen (gleiche Grenze wie im CSS). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

const draftKey = (b: WeaponBundle) => `tbh:draft:v1:${b.mode}:${b.weapon.id}`;

export function Gunsmith({ bundle, uiLang, itemLang, t }: Props) {
  const data = useMemo(() => createGameData(bundle.datasetId, Object.values(bundle.items).map((i) => itemFromPlain(i.plain))), [bundle]);
  const weaponName = pickName(bundle.items[bundle.weapon.id]?.names, itemLang);
  const initialAmmo = bundle.weapon.defaultAmmo && bundle.ammo.some((a) => a.id === bundle.weapon.defaultAmmo) ? bundle.weapon.defaultAmmo : (bundle.ammo[0]?.id ?? null);
  const initial: Draft = { build: bundle.defaultBuild, ammo: initialAmmo, title: "" };

  const [draft, setDraft] = useState<Draft>(initial);
  const [past, setPast] = useState<Draft[]>([]);
  const [future, setFuture] = useState<Draft[]>([]);
  const [focus, setFocus] = useState<Focus>({ kind: "none" });
  const [detachedNote, setDetachedNote] = useState<string[] | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const loaded = useRef(false);
  const narrow = useNarrow();

  // Entwurf aus diesem Browser wiederherstellen (nur einmal, nach dem ersten Rendern).
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const raw = window.localStorage.getItem(draftKey(bundle));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Draft & { savedAt?: string };
      if (parsed && typeof parsed === "object" && parsed.build?.itemId === bundle.weapon.id) {
        setDraft({ build: parsed.build, ammo: typeof parsed.ammo === "string" ? parsed.ammo : initialAmmo, title: typeof parsed.title === "string" ? parsed.title.slice(0, 80) : "" });
        setRestored(parsed.savedAt ?? "");
      }
    } catch {
      /* Speicher nicht verfügbar oder kaputt: mit der Vorlage starten. */
    }
  }, []);

  // Automatisch speichern.
  useEffect(() => {
    if (!loaded.current) return;
    const handle = window.setTimeout(() => {
      try {
        const at = new Date();
        window.localStorage.setItem(draftKey(bundle), JSON.stringify({ ...draft, savedAt: at.toISOString() }));
        setSavedAt(at);
      } catch {
        setSavedAt(null);
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [draft, bundle]);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const commit = useCallback((next: Draft) => {
    setPast((p) => [...p, draftRef.current].slice(-50));
    setFuture([]);
    setDraft(next);
  }, []);

  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([draft, ...future]);
    setDraft(prev);
    setDetachedNote(null);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, draft]);
    setDraft(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const validation = useMemo(() => validateBuild(data, draft.build), [data, draft.build]);
  const errorPaths = useMemo(() => {
    const set = new Set<string>();
    for (const i of validation.issues) {
      if (i.severity !== "error") continue;
      set.add(pathKey(i.path));
      if (i.otherPath) set.add(pathKey(i.otherPath));
    }
    return set;
  }, [validation]);

  const ammoIds = useMemo(() => allowedAmmoFor(draft.build, bundle.items, bundle.weapon), [draft.build, bundle]);
  const ammo = bundle.ammo.find((a) => a.id === draft.ammo) ?? null;
  const ammoFits = draft.ammo !== null && ammoIds.includes(draft.ammo);
  const stats = useMemo(() => computeStats(draft.build, bundle.items, bundle.weapon, ammo), [draft.build, bundle, ammo]);

  const procurement = useMemo(() => {
    const ids = flattenIds(draft.build);
    if (draft.ammo) ids.push(draft.ammo);
    const context = { traders: new Map(bundle.procurement.traders.map((tr) => [tr.id, tr])), fleaMinPlayerLevel: bundle.procurement.fleaMinPlayerLevel };
    const parts = ids.map((id) => ({ itemId: id, ...(bundle.procurement.sources[id] ?? { offers: [], fleaLevel: null, noFlea: false }) }));
    return summarizeProcurement(context, parts);
  }, [draft.build, draft.ammo, bundle]);

  const layout = useMemo(() => {
    // Slots, die ein verbautes Teil blockiert, sind nicht frei – dort keinen „+“-Kasten zeigen.
    const blocked = new Set<string>();
    for (const id of flattenIds(draft.build)) for (const slotId of bundle.items[id]?.plain.conflictingSlotIds ?? []) blocked.add(slotId);
    return layoutBuild(draft.build, bundle.items, {
      showEmpty: (slot: LayoutSlot, parentItemId: string) => {
        if (blocked.has(slot.id)) return false;
        const def = bundle.items[parentItemId]?.plain.slots?.find((x) => x.id === slot.id);
        if (!def) return false;
        if (def.required) return true;
        // Nur Haupt-Slots; Zweit-Slots wie mod_charge_001 oder mod_stock_003 erscheinen in der Slot-Liste.
        return PRIMARY_EMPTY.test(slot.nameId) && !/_00[1-9]$/.test(slot.nameId);
      },
    });
  }, [draft.build, bundle]);

  const install = (parentPath: string[], slotId: string, itemId: string | null) => {
    if (itemId === null) {
      commit({ ...draft, build: removePart(draft.build, parentPath, slotId).build });
      setDetachedNote(null);
      return;
    }
    const result = installPart(draft.build, parentPath, slotId, itemId, data);
    commit({ ...draft, build: result.build });
    setDetachedNote(result.detached.length > 0 ? result.detached.map((d) => pickName(bundle.items[d.node.itemId]?.names, itemLang).short) : null);
  };

  const status = !validation.valid ? "error" : validation.complete ? "ok" : "incomplete";
  const statusLabel = status === "ok" ? t.status_ok : status === "error" ? t.status_error : t.status_incomplete;
  const statusColor = status === "ok" ? "var(--ok)" : status === "error" ? "var(--bad)" : "#e0a458";

  const crumbs: string[] = [weaponName.short];
  if (focus.kind === "slot") {
    let node: BuildNode | undefined = draft.build;
    for (const slotId of [...focus.parentPath, focus.slotId]) {
      if (!node) break;
      crumbs.push(slotLabel(bundle, node.itemId, slotId, itemLang));
      node = node.slots?.[slotId];
    }
  } else if (focus.kind === "ammo") crumbs.push(t.stat_ammo);
  else if (focus.kind === "buy") crumbs.push(t.stat_buy);

  const focusedKey = focus.kind === "slot" ? pathKey([...focus.parentPath, focus.slotId]) : null;
  const fleaLevel = procurement.fleaRoute.notOnFlea.length ? "–" : procurement.fleaRoute.playerLevel ?? "–";

  return (
    <div className={s.shell}>
      <div className={s.bar}>
        <div className={s.titleWrap}>
          <span className={s.kicker}>
            {t.draft} · {weaponName.name}
          </span>
          <label htmlFor="build-title" className="visually-hidden">
            {t.title_label}
          </label>
          <input
            id="build-title"
            className={s.title}
            value={draft.title}
            maxLength={80}
            placeholder={`${weaponName.short} – ${t.title_placeholder}`}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        {bundle.presets.length > 1 && (
          <>
            <label htmlFor="preset" className="visually-hidden">
              {t.template}
            </label>
            <select
              id="preset"
              className={s.select}
              value=""
              onChange={(e) => {
                const p = bundle.presets.find((x) => x.id === e.target.value);
                if (p) commit({ ...draft, build: p.build });
              }}
            >
              <option value="">{t.template} …</option>
              {bundle.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {pickName(p.names, itemLang).name}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="button" className="btn" onClick={undo} disabled={past.length === 0} aria-keyshortcuts="Control+Z" aria-label={t.undo} title={t.undo}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 4L2 7L5 10M2.5 7H10a4 4 0 0 1 0 8H8" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span className={s.btnText}>{t.undo}</span>
        </button>
        <button type="button" className="btn" onClick={redo} disabled={future.length === 0} aria-keyshortcuts="Control+Shift+Z" aria-label={t.redo} title={t.redo}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M11 4L14 7L11 10M13.5 7H6a4 4 0 0 0 0 8h2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span className={s.btnText}>{t.redo}</span>
        </button>
        <span className={s.saved} aria-live="polite">
          {bundle.mode.toUpperCase()} · Patch {bundle.patch ?? "—"}
          {savedAt ? ` · ${t.saved_local}` : ""}
        </span>
        <span className={`btn ${s.hideNarrow}`} aria-disabled="true" title={t.publish_soon}>
          {t.publish}
        </span>
      </div>

      {restored !== null && (
        <div className={`${s.notice} ${s.noticeOk}`} role="status">
          <span>
            {t.restored}
            {restored ? ` (${new Date(restored).toLocaleString(uiLang === "de" ? "de-DE" : "en-GB", { dateStyle: "short", timeStyle: "short" })})` : ""}
          </span>
          <button
            type="button"
            className={s.linkBtn}
            onClick={() => {
              commit(initial);
              setRestored(null);
            }}
          >
            {t.start_over}
          </button>
        </div>
      )}

      <div className={s.top}>
        <ol className={s.crumbs} aria-label="Pfad">
          {crumbs.map((c, i) => (
            <li key={i} className={i === crumbs.length - 1 && i > 0 ? s.current : undefined}>
              {c}
            </li>
          ))}
        </ol>
        <div className={s.stats} role="group" aria-label="Werte">
          <div className={s.stat}>
            <span className={s.statLabel}>{t.stat_erg}</span>
            <span className={s.statValue}>{stats.ergonomics === null ? "–" : formatNumber(stats.ergonomics, uiLang, 1)}</span>
          </div>
          <div className={s.stat} title={t.stat_recoil_hint}>
            <span className={s.statLabel}>
              {t.stat_recoil} <span className="visually-hidden">{t.stat_recoil_hint}</span>
            </span>
            <span className={s.statValue}>
              {stats.recoilVertical ?? "–"} / {stats.recoilHorizontal ?? "–"} <span className={s.statSub}>{percent(stats.recoilModifier, uiLang)}</span>
            </span>
          </div>
          <button type="button" className={`${s.stat} ${focus.kind === "ammo" ? s.statActive : ""}`} onClick={() => setFocus({ kind: "ammo" })} aria-pressed={focus.kind === "ammo"}>
            <span className={s.statLabel}>{t.stat_ammo}</span>
            <span className={s.statValue} style={ammo && !ammoFits ? { color: "var(--bad)" } : undefined}>
              {ammo ? pickName(ammo.names, itemLang).short : "–"}{" "}
              {ammo && (
                <span className={s.statSub}>
                  {t.ammo_pen} {ammo.penetration ?? "–"} · {ammo.damage ?? "–"}
                </span>
              )}
            </span>
          </button>
          <div className={s.stat}>
            <span className={s.statLabel}>{t.stat_price}</span>
            <span className={s.statValue}>
              {rubles(stats.partsPrice, uiLang)}
              {stats.partsWithoutPrice > 0 && (
                <span className={s.statSub}>
                  {" "}
                  · {stats.partsWithoutPrice} {t.no_price}
                </span>
              )}
            </span>
          </div>
          <button type="button" className={`${s.stat} ${focus.kind === "buy" ? s.statActive : ""}`} onClick={() => setFocus({ kind: "buy" })} aria-pressed={focus.kind === "buy"}>
            <span className={s.statLabel}>{t.stat_buy}</span>
            <span className={s.statValue}>
              Lvl {procurement.traderRoute.playerLevel ?? "–"}{" "}
              <span className={s.statSub}>
                {uiLang === "de" ? "Händler" : "traders"} · Flea {fleaLevel}
              </span>
            </span>
          </button>
          <div className={s.status} role="status" style={{ color: statusColor }}>
            <span className={s.dot} style={{ background: statusColor }} />
            {statusLabel}
          </div>
        </div>
      </div>

      {detachedNote && (
        <div className={`${s.notice} ${s.noticeWarn}`} role="status">
          <span>
            {t.detached_notice} {detachedNote.join(", ")}
          </span>
          <button type="button" className={s.linkBtn} onClick={undo}>
            {t.undo}
          </button>
        </div>
      )}

      <Stage
        bundle={bundle}
        build={draft.build}
        layout={layout}
        lang={itemLang}
        t={t}
        focusedKey={focusedKey}
        errorPaths={errorPaths}
        fit={narrow}
        onPick={(path) => {
          if (path.length === 0) setFocus({ kind: "none" });
          else setFocus({ kind: "slot", parentPath: path.slice(0, -1), slotId: path.at(-1)! });
        }}
      />

      {(() => {
        const close = () => setFocus({ kind: "none" });
        const panel =
          focus.kind === "slot" ? (
            <PartPicker
              key={focusedKey}
              bundle={bundle}
              data={data}
              build={draft.build}
              parentPath={focus.parentPath}
              slotId={focus.slotId}
              lang={itemLang}
              uiLang={uiLang}
              t={t}
              onInstall={(id) => {
                install(focus.parentPath, focus.slotId, id);
                if (narrow) close();
              }}
              onClose={close}
            />
          ) : focus.kind === "ammo" ? (
            <AmmoPicker
              bundle={bundle}
              allowed={ammoIds}
              selected={draft.ammo}
              lang={itemLang}
              uiLang={uiLang}
              t={t}
              onSelect={(id) => {
                commit({ ...draft, ammo: id });
                if (narrow) close();
              }}
              onClose={close}
            />
          ) : focus.kind === "buy" ? (
            <Procurement bundle={bundle} summary={procurement} lang={itemLang} uiLang={uiLang} t={t} onClose={close} />
          ) : null;
        const tree = (
          <SlotTree
            bundle={bundle}
            build={draft.build}
            lang={itemLang}
            t={t}
            issues={validation.issues}
            onPick={(parentPath: BuildPath, slotId: string) => setFocus({ kind: "slot", parentPath: [...parentPath], slotId })}
          />
        );
        return (
          <section className={s.drawer} aria-labelledby="drawer-title">
            <span className={s.grip} aria-hidden="true" />
            {narrow ? tree : (panel ?? tree)}
            {narrow && panel && <Sheet onClose={close} closeLabel={uiLang === "de" ? "Schließen" : "Close"}>{panel}</Sheet>}
            <p className={s.small} style={{ marginTop: 16 }}>
              {t.stats_note} {t.data_as_of}: {new Date(bundle.dataAsOf).toLocaleString(uiLang === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" })} · tarkov.dev
            </p>
          </section>
        );
      })()}
    </div>
  );
}

