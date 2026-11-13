"use client";

import { useEffect, useRef, useState } from "react";
import type { Issue } from "@tbh/compat-engine";
import type { GunsmithMessages } from "@/gunsmith/messages";
import type { Lang, WeaponBundle } from "@/gunsmith/types";
import { issueText, pickName } from "@/gunsmith/view";
import s from "./gunsmith.module.css";

export const PURPOSES = ["allround", "cqb", "long_range", "silent", "budget"] as const;
export type Purpose = (typeof PURPOSES)[number];

export interface PublishMeta {
  title: string;
  notes: string;
  purpose: Purpose | null;
  visibility: "public" | "unlisted";
}

interface Props {
  bundle: WeaponBundle;
  lang: Lang;
  t: GunsmithMessages;
  initial: PublishMeta;
  checks: { valid: boolean; complete: boolean; ammo: boolean };
  provenance: string | null;
  partCount: number;
  onCancel: (meta: PublishMeta) => void;
  /** Speichert den Entwurf und veröffentlicht; liefert Fehlermeldung und Probleme oder leitet weiter. */
  onSubmit: (meta: PublishMeta) => Promise<{ message: string; issues: Issue[] } | null>;
}

export function PublishDialog({ bundle, lang, t, initial, checks, provenance, partCount, onCancel, onSubmit }: Props) {
  const [meta, setMeta] = useState<PublishMeta>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; issues: Issue[] } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel(meta);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const title = meta.title.trim();
  const titleOk = title.length >= 4 && title.length <= 80 && meta.purpose !== null;
  const ready = checks.valid && checks.complete && checks.ammo && titleOk && !busy;
  const weapon = pickName(bundle.items[bundle.weapon.id]?.names, lang);

  const check = (ok: boolean, label: string) => (
    <li style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span
        aria-hidden="true"
        style={{ width: 20, height: 20, borderRadius: 10, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: ok ? "var(--ok-bg)" : "var(--bad-bg)", color: ok ? "var(--ok)" : "var(--bad)" }}
      >
        {ok ? "✓" : "!"}
      </span>
      <span>
        <span className="visually-hidden">{ok ? "OK: " : "Fehlt: "}</span>
        {label}
      </span>
    </li>
  );

  return (
    <>
      <div className={s.backdrop} onClick={() => onCancel(meta)} aria-hidden="true" />
      <form
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pub-title"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          setBusy(true);
          setError(null);
          const result = await onSubmit({ ...meta, title });
          if (result) {
            setError(result);
            setBusy(false);
          }
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
          <h2 id="pub-title" className={s.drawerTitle} style={{ fontSize: 30 }}>
            {t.pub_title}
          </h2>
        </div>
        <div style={{ padding: 22, display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="pub-name" style={{ fontSize: 14, fontWeight: 600 }}>
                {t.pub_name}
              </label>
              <input
                id="pub-name"
                ref={titleRef}
                className={s.field}
                value={meta.title}
                maxLength={80}
                required
                minLength={4}
                aria-describedby="pub-name-hint"
                onChange={(e) => setMeta({ ...meta, title: e.target.value })}
              />
              <span id="pub-name-hint" className={s.small}>
                {t.pub_name_hint} · {title.length}/80
              </span>
            </div>
            <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
              <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t.pub_purpose}</legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PURPOSES.map((p) => (
                  <label key={p} className={`${s.chip} ${meta.purpose === p ? s.chipOn : ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <input type="radio" name="purpose" value={p} checked={meta.purpose === p} onChange={() => setMeta({ ...meta, purpose: p })} style={{ accentColor: "var(--accent)", margin: 0 }} />
                    {t[`purpose_${p}`]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="pub-notes" style={{ fontSize: 14, fontWeight: 600 }}>
                {t.pub_notes} <span style={{ fontWeight: 400, color: "var(--faint)" }}>({t.pub_optional})</span>
              </label>
              <textarea id="pub-notes" className={s.field} rows={5} maxLength={2000} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} style={{ resize: "vertical", padding: "10px 12px", height: "auto" }} />
              <span className={s.small} style={{ textAlign: "right" }}>
                {meta.notes.length} / 2000
              </span>
            </div>
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t.pub_visibility}</legend>
              {(["public", "unlisted"] as const).map((v) => (
                <label key={v} style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 32 }}>
                  <input type="radio" name="visibility" checked={meta.visibility === v} onChange={() => setMeta({ ...meta, visibility: v })} style={{ accentColor: "var(--accent)", marginTop: 5 }} />
                  <span>
                    {v === "public" ? t.pub_public : t.pub_unlisted} <span style={{ color: "var(--faint)" }}>– {v === "public" ? t.pub_public_sub : t.pub_unlisted_sub}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          <aside style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="panel" style={{ padding: 14, background: "var(--bg)" }}>
              <div style={{ height: 96, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                {bundle.items[bundle.weapon.id]?.img512 && <img src={bundle.items[bundle.weapon.id]!.img512!} alt="" style={{ maxWidth: "90%", maxHeight: 90, objectFit: "contain" }} />}
              </div>
              <h3 className="head" style={{ margin: "0 0 8px", fontSize: 18 }}>
                {t.pub_fixed}
              </h3>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: 13 }}>
                <dt style={{ color: "var(--faint)" }}>{t.weapon}</dt>
                <dd style={{ margin: 0 }}>{weapon.short}</dd>
                <dt style={{ color: "var(--faint)" }}>Patch</dt>
                <dd style={{ margin: 0 }}>
                  {bundle.patch ?? "—"} · {bundle.mode.toUpperCase()}
                </dd>
                <dt style={{ color: "var(--faint)" }}>{t.data_as_of}</dt>
                <dd style={{ margin: 0 }}>{new Date(bundle.dataAsOf).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB")}</dd>
                <dt style={{ color: "var(--faint)" }}>{t.parts}</dt>
                <dd className="num" style={{ margin: 0 }}>
                  {partCount}
                </dd>
                {provenance && (
                  <>
                    <dt style={{ color: "var(--faint)" }}>{t.variant_of}</dt>
                    <dd style={{ margin: 0 }}>{provenance}</dd>
                  </>
                )}
              </dl>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
              {check(checks.valid, t.pub_check_valid)}
              {check(checks.complete, t.pub_check_complete)}
              {check(checks.ammo, t.pub_check_ammo)}
              {check(titleOk, t.pub_check_title)}
            </ul>
            {error && (
              <div className={`${s.notice} ${s.noticeBad}`} role="alert" style={{ margin: 0 }}>
                <strong>{t.pub_server_rejected}</strong>
                <span>{error.message}</span>
                {error.issues.slice(0, 5).map((i, n) => (
                  <span key={n}>{issueText(i, bundle, lang, t)}</span>
                ))}
              </div>
            )}
          </aside>
        </div>
        <div style={{ padding: "16px 22px", borderTop: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <p className={s.small} style={{ flex: "1 1 280px", margin: 0 }}>
            {t.pub_fixed_text}
          </p>
          <button type="button" className="btn" onClick={() => onCancel(meta)}>
            {t.pub_cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready} aria-disabled={!ready}>
            {busy ? t.pub_busy : t.pub_submit}
          </button>
        </div>
      </form>
    </>
  );
}
