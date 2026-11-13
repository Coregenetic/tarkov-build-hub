"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BuildNode } from "@tbh/compat-engine";
import type { ProcurementSummary } from "@tbh/game-data/procurement";
import type { BuildStats } from "@tbh/game-data/stats";
import { Procurement } from "@/components/gunsmith/Procurement";
import { Stage } from "@/components/gunsmith/Stage";
import s from "@/components/gunsmith/gunsmith.module.css";
import { layoutBuild } from "@/gunsmith/layout";
import type { GunsmithMessages } from "@/gunsmith/messages";
import type { Lang, WeaponBundle } from "@/gunsmith/types";
import { formatNumber, percent, pickName, rubles, slotLabel } from "@/gunsmith/view";
import { Comments, Reactions, ReportButton, type SerializedComment } from "./Community";
import { SITE_TZ } from "@/lib/time";

export interface SerializedView {
  publicId: string;
  owner: { id: number; login: string; displayName: string; avatarUrl: string | null };
  mode: "pvp" | "pve";
  weaponExtId: string;
  visibility: "public" | "unlisted";
  status: "published" | "hidden" | "deleted";
  latestVersion: number;
  createdAt: string;
  version: {
    version: number;
    patchLabel: string | null;
    title: string;
    notes: string;
    purpose: "allround" | "cqb" | "long_range" | "silent" | "budget";
    tree: BuildNode;
    ammoExtId: string | null;
    stats: BuildStats;
    procurement: ProcurementSummary;
    createdAt: string;
  };
  versions: { version: number; patchLabel: string | null; createdAt: string }[];
  forkedFrom: { label: string; publicId: string | null; version: number | null } | null;
  forkCount: number;
}

interface Props {
  view: SerializedView;
  bundle: WeaponBundle;
  uiLang: Lang;
  itemLang: Lang;
  t: GunsmithMessages;
  viewer: { id: number; login: string } | null;
  loginUrl: string | null;
  current: { valid: boolean; patch: string | null; problems: string[] } | null;
  interaction: { liked: boolean; bookmarked: boolean; likeCount: number; commentCount: number };
  comments: SerializedComment[];
}

async function post(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json["message"] === "string" ? json["message"] : String(res.status));
  return json;
}

export function BuildPage({ view, bundle, uiLang, itemLang, t, viewer, loginUrl, current, interaction, comments }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [visibility, setVisibility] = useState(view.visibility);
  const v = view.version;
  const own = viewer?.id === view.owner.id;
  const isLatest = v.version === view.latestVersion;
  const weapon = pickName(bundle.items[view.weaponExtId]?.names, itemLang);
  const ammo = bundle.ammo.find((a) => a.id === v.ammoExtId) ?? null;
  const stats = v.stats;
  const layout = useMemo(() => layoutBuild(v.tree, bundle.items), [v.tree, bundle]);
  const date = (iso: string) => new Date(iso).toLocaleDateString(uiLang === "de" ? "de-DE" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: SITE_TZ });

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.b_error);
    } finally {
      setBusy(false);
    }
  };
  const fork = () =>
    act(async () => {
      const r = await post(`/api/builds/${view.publicId}/fork`, "POST", { version: v.version });
      window.location.assign(`/gunsmith/${view.weaponExtId}?entwurf=${String(r["draftId"])}`);
    });
  const edit = () =>
    act(async () => {
      const r = await post(`/api/builds/${view.publicId}/edit`, "POST");
      window.location.assign(`/gunsmith/${view.weaponExtId}?entwurf=${String(r["draftId"])}`);
    });
  const toggleVisibility = () =>
    act(async () => {
      const next = visibility === "public" ? "unlisted" : "public";
      await post(`/api/builds/${view.publicId}`, "PATCH", { visibility: next });
      setVisibility(next);
    });
  const remove = () =>
    act(async () => {
      await post(`/api/builds/${view.publicId}`, "DELETE");
      window.location.assign(`/u/${view.owner.login}`);
    });

  // Teileliste in Baum-Reihenfolge mit Slot-Namen.
  const parts: { depth: number; slot: string; name: string; img: string | null; id: string }[] = [];
  const walk = (node: BuildNode, depth: number) => {
    const item = bundle.items[node.itemId];
    for (const slot of item?.slots ?? []) {
      const child = node.slots?.[slot.id];
      if (!child) continue;
      const ci = bundle.items[child.itemId];
      parts.push({ depth, slot: slotLabel(bundle, node.itemId, slot.id, itemLang), name: pickName(ci?.names, itemLang).name, img: ci?.img512 ?? null, id: child.itemId });
      walk(child, depth + 1);
    }
  };
  walk(v.tree, 0);

  const statTile = (label: string, value: string, sub?: string) => (
    <div className={s.stat} style={{ borderRight: "1px solid var(--line)" }}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>
        {value} {sub && <span className={s.statSub}>{sub}</span>}
      </span>
    </div>
  );

  return (
    <div className={s.shell} style={{ minHeight: 0 }}>
      <div className="container" style={{ paddingTop: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontSize: 14, color: "var(--faint)" }}>
          {weapon.name} · {view.mode.toUpperCase()} · Patch {v.patchLabel ?? "—"} · {t.version} {v.version}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <h1 className="head" style={{ margin: 0, fontSize: "clamp(34px, 5vw, 52px)", lineHeight: 1.02, overflowWrap: "anywhere" }}>
              {v.title}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", color: "var(--muted)", fontSize: 15 }}>
              <Link href={`/u/${view.owner.login}`} style={{ display: "inline-flex", gap: 8, alignItems: "center", color: "var(--ink)", fontWeight: 600 }}>
                {view.owner.avatarUrl ? (
                  <img src={view.owner.avatarUrl} alt="" width={26} height={26} referrerPolicy="no-referrer" style={{ borderRadius: 5 }} />
                ) : (
                  <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 5, background: "var(--panel-2)" }} />
                )}
                {view.owner.displayName}
              </Link>
              <span>
                · {t.b_published} {date(v.createdAt)}
              </span>
              <span className="tag tag-accent">{t[`purpose_${v.purpose}`]}</span>
              {visibility === "unlisted" && <span className="tag">{t.b_unlisted}</span>}
              {view.status === "hidden" && <span className="tag" style={{ color: "var(--bad)" }}>{t.b_hidden}</span>}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {view.status === "published" && <Reactions publicId={view.publicId} t={t} loggedIn={!!viewer} own={own} loginUrl={loginUrl} initial={interaction} />}
            {viewer ? (
              <button type="button" className="btn btn-primary" onClick={fork} disabled={busy}>
                {t.b_fork}
              </button>
            ) : loginUrl ? (
              <a className="btn btn-primary" href={loginUrl} title={t.b_fork_login}>
                {t.b_fork}
              </a>
            ) : null}
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href.split("#")[0]!);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  setError(t.b_error);
                }
              }}
            >
              <span aria-live="polite">{copied ? t.b_copied : t.b_share}</span>
            </button>
            {viewer && !own && view.status === "published" && <ReportButton targetType="build" target={view.publicId} t={t} />}
            {own && isLatest && (
              <>
                <button type="button" className="btn" onClick={edit} disabled={busy}>
                  {t.b_edit}
                </button>
                <button type="button" className="btn" onClick={toggleVisibility} disabled={busy}>
                  {visibility === "public" ? t.b_make_unlisted : t.b_make_public}
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDelete(true)} disabled={busy} style={{ color: "#f09a78", borderColor: "#5a2e22" }}>
                  {t.b_delete}
                </button>
              </>
            )}
          </div>
        </div>

        {confirmDelete && (
          <div className={`${s.notice} ${s.noticeBad}`} role="alertdialog" aria-label={t.b_delete} style={{ margin: 0 }}>
            <span>{t.b_delete_confirm}</span>
            <button type="button" className="btn" style={{ color: "#f09a78", borderColor: "#5a2e22" }} onClick={remove} disabled={busy}>
              {t.b_delete_yes}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              {t.b_cancel}
            </button>
          </div>
        )}
        {error && (
          <div className={`${s.notice} ${s.noticeBad}`} role="alert" style={{ margin: 0 }}>
            {t.b_error}: {error}
          </div>
        )}
        {!isLatest && (
          <div className={`${s.notice} ${s.noticeWarn}`} style={{ margin: 0 }}>
            {t.b_old_version}{" "}
            <Link href={`/b/${view.publicId}`} className={s.linkBtn}>
              {t.b_to_latest} (v{view.latestVersion})
            </Link>
          </div>
        )}
        {current && (
          <div className={`${s.notice} ${current.valid ? s.noticeOk : s.noticeWarn}`} style={{ margin: 0 }} role="status">
            <strong>{current.valid ? t.b_current_ok : t.b_current_bad}</strong>
            <span>
              {t.b_current_check} Patch {current.patch ?? "—"}
              {current.problems.length ? `: ${current.problems.join(", ")}` : ""}
            </span>
          </div>
        )}
        <div className={s.stats} role="group" aria-label={t.b_stats_note} style={{ alignSelf: "flex-start" }}>
          {statTile(t.stat_erg, stats.ergonomics === null ? "–" : formatNumber(stats.ergonomics, uiLang, 1))}
          {statTile(t.stat_recoil, `${stats.recoilVertical ?? "–"} / ${stats.recoilHorizontal ?? "–"}`, percent(stats.recoilModifier, uiLang))}
          {statTile(t.stat_ammo, ammo ? pickName(ammo.names, itemLang).short : "–", ammo ? `${t.ammo_pen} ${ammo.penetration ?? "–"} · ${ammo.damage ?? "–"}` : undefined)}
          {statTile(t.stat_price, rubles(stats.partsPrice, uiLang))}
          {statTile(t.stat_weight, `${formatNumber(stats.weight, uiLang, 2)} kg`)}
          {statTile(t.stat_buy, `Lvl ${v.procurement.traderRoute.playerLevel ?? "–"}`)}
        </div>
      </div>

      <Stage bundle={bundle} build={v.tree} layout={layout} lang={itemLang} t={t} focusedKey={null} errorPaths={new Set()} onPick={() => undefined} readOnly />

      <div className="container" style={{ display: "flex", flexWrap: "wrap", gap: "32px 48px", paddingTop: 24, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 32 }}>
          {v.notes && (
            <section aria-labelledby="notes">
              <h2 id="notes" className={s.drawerTitle} style={{ marginBottom: 10 }}>
                {t.b_notes}
              </h2>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--ink-2)", maxWidth: 760 }}>{v.notes}</p>
            </section>
          )}
          <section aria-labelledby="parts">
            <h2 id="parts" className={s.drawerTitle} style={{ marginBottom: 10 }}>
              {t.b_parts} <span className={s.small}>({parts.length})</span>
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {parts.map((p, i) => (
                <li key={i} className={s.buyRow} style={{ paddingLeft: p.depth * 14 }}>
                  <span className={s.thumb}>{p.img && <img src={p.img} alt="" loading="lazy" decoding="async" />}</span>
                  <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, minWidth: 0 }}>
                    <span className={s.small}>{p.slot}</span>
                    <Link href={`/builds?teil=${p.id}`} style={{ overflowWrap: "anywhere", color: "var(--ink)" }} title={t.b_with_part}>
                      {p.name}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {view.status === "published" && <Comments publicId={view.publicId} t={t} uiLang={uiLang} loggedIn={!!viewer} loginUrl={loginUrl} viewerId={viewer?.id ?? null} initial={comments} />}
        </div>
        <aside style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 20 }}>
          {view.forkedFrom && (
            <div className="panel" style={{ padding: 16 }}>
              <span className={s.small}>{t.variant_of}</span>
              <div style={{ fontWeight: 600 }}>
                {view.forkedFrom.publicId ? (
                  <Link href={`/b/${view.forkedFrom.publicId}?v=${view.forkedFrom.version}`}>{view.forkedFrom.label}</Link>
                ) : (
                  <span>{view.forkedFrom.label}</span>
                )}
              </div>
            </div>
          )}
          <div className="panel" style={{ padding: 16 }}>
            <span className={s.small}>{t.b_forks}</span>
            <div className="num" style={{ fontWeight: 600, fontSize: 22 }}>
              {view.forkCount}
            </div>
          </div>
          <nav className="panel" aria-labelledby="versions" style={{ padding: 16 }}>
            <h2 id="versions" className="head" style={{ margin: "0 0 8px", fontSize: 20 }}>
              {t.b_versions}
            </h2>
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {view.versions.map((x) => (
                <li key={x.version} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <Link href={x.version === view.latestVersion ? `/b/${view.publicId}` : `/b/${view.publicId}?v=${x.version}`} aria-current={x.version === v.version ? "page" : undefined} style={{ color: x.version === v.version ? "var(--accent)" : "var(--ink)" }}>
                    v{x.version}
                  </Link>{" "}
                  <span className={s.small}>
                    · Patch {x.patchLabel ?? "—"} · {date(x.createdAt)}
                    {x.version === view.latestVersion ? ` · ${t.b_latest}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>

      <section className="container" style={{ marginTop: 40, paddingBottom: 8 }} aria-labelledby="buy-title">
        <div className="panel" style={{ padding: "18px 20px" }}>
          <Procurement bundle={bundle} summary={v.procurement} lang={itemLang} uiLang={uiLang} t={t} headingId="buy-title" subtitle={t.b_buy_note} />
        </div>
        <p className={s.small} style={{ marginTop: 12 }}>
          {t.b_stats_note}. {t.stats_note}
        </p>
      </section>
    </div>
  );
}
