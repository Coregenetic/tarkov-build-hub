"use client";

import type { BuildNode, BuildPath, Issue } from "@tbh/compat-engine";
import type { GunsmithMessages } from "@/gunsmith/messages";
import type { Lang, WeaponBundle } from "@/gunsmith/types";
import { issueText, pathKey, pickName, slotLabel } from "@/gunsmith/view";
import s from "./gunsmith.module.css";

interface Props {
  bundle: WeaponBundle;
  build: BuildNode;
  lang: Lang;
  t: GunsmithMessages;
  issues: readonly Issue[];
  onPick: (parentPath: BuildPath, slotId: string) => void;
}

/** Vollständige Slot-Liste als Baum – zugängliche Alternative zur Aufbauansicht. */
export function SlotTree({ bundle, build, lang, t, issues, onPick }: Props) {
  const errors = issues.filter((i) => i.severity === "error");
  const incomplete = issues.filter((i) => i.severity === "incomplete");

  const renderNode = (node: BuildNode, path: string[]): React.ReactNode => {
    const item = bundle.items[node.itemId];
    if (!item) return null;
    return (
      <ul>
        {item.slots.map((slot) => {
          const child = node.slots?.[slot.id];
          const childPath = [...path, slot.id];
          const hasError = errors.some((i) => pathKey(i.path) === pathKey(childPath));
          return (
            <li key={slot.id}>
              <button type="button" className={s.treeRow} onClick={() => onPick(path, slot.id)}>
                <span className={s.treeSlot}>{slotLabel(bundle, node.itemId, slot.id, lang)}</span>
                <span className={child ? undefined : s.treeEmpty} style={hasError ? { color: "var(--bad)" } : undefined}>
                  {child ? pickName(bundle.items[child.itemId]?.names, lang).name : `– ${t.empty_slot}`}
                </span>
              </button>
              {child && renderNode(child, childPath)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <>
      <div className={s.drawerHead}>
        <div>
          <h2 id="drawer-title" className={s.drawerTitle}>
            {t.all_slots}
          </h2>
          <span className={s.drawerSub}>{t.all_slots_hint}</span>
        </div>
      </div>
      {(errors.length > 0 || incomplete.length > 0) && (
        <div className={`${s.notice} ${errors.length ? s.noticeBad : s.noticeWarn}`} style={{ margin: "0 0 14px" }} role="alert">
          <strong>{t.issues_title}:</strong>
          {[...errors, ...incomplete].slice(0, 6).map((i, n) => {
            const at = i.itemId ? pickName(bundle.items[i.itemId]?.names, lang).short : i.parentItemId ? pickName(bundle.items[i.parentItemId]?.names, lang).short : "";
            return (
              <span key={n}>
                {at ? `${at}: ` : ""}
                {issueText(i, bundle, lang, t)}
              </span>
            );
          })}
        </div>
      )}
      <div className={s.tree}>{renderNode(build, [])}</div>
    </>
  );
}
