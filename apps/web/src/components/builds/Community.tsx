"use client";

import { useState } from "react";
import s from "@/components/gunsmith/gunsmith.module.css";
import type { GunsmithMessages } from "@/gunsmith/messages";
import { SITE_TZ } from "@/lib/time";

export interface SerializedComment {
  id: number;
  body: string;
  status: "visible" | "hidden" | "deleted";
  createdAt: string;
  editedAt: string | null;
  author: { id: number; login: string; displayName: string; avatarUrl: string | null };
  canEdit: boolean;
}

const REASONS = ["spam", "offensive", "wrong_info", "other"] as const;

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json["message"] === "string" ? json["message"] : String(res.status));
  return json;
}

/** Gefällt mir und Merken (Kopfzeile der Build-Seite). */
export function Reactions(props: { publicId: string; t: GunsmithMessages; loggedIn: boolean; own: boolean; loginUrl: string | null; initial: { liked: boolean; bookmarked: boolean; likeCount: number } }) {
  const { publicId, t } = props;
  const [state, setState] = useState(props.initial);
  const [error, setError] = useState<string | null>(null);
  if (!props.loggedIn) {
    return props.loginUrl ? (
      <a className="btn" href={props.loginUrl} title={t.c_login}>
        ♥ {state.likeCount}
      </a>
    ) : (
      <span className="btn" aria-label={`${t.c_like}: ${state.likeCount}`}>
        ♥ {state.likeCount}
      </span>
    );
  }
  const toggle = async (kind: "like" | "bookmark") => {
    setError(null);
    const on = kind === "like" ? !state.liked : !state.bookmarked;
    try {
      const r = await call(`/api/builds/${publicId}/${kind}`, on ? "POST" : "DELETE");
      setState((x) => (kind === "like" ? { ...x, liked: on, likeCount: Number(r["likeCount"] ?? x.likeCount) } : { ...x, bookmarked: on }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };
  return (
    <>
      {!props.own && (
        <button type="button" className="btn" aria-pressed={state.liked} onClick={() => toggle("like")} style={state.liked ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
          ♥ {state.liked ? t.c_liked : t.c_like} · {state.likeCount}
        </button>
      )}
      <button type="button" className="btn" aria-pressed={state.bookmarked} onClick={() => toggle("bookmark")} style={state.bookmarked ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
        {state.bookmarked ? t.c_bookmarked : t.c_bookmark}
      </button>
      {error && (
        <span role="alert" style={{ color: "var(--bad)", fontSize: 14 }}>
          {error}
        </span>
      )}
    </>
  );
}

/** Melden-Dialog für Build oder Kommentar. */
export function ReportButton({ targetType, target, t, small }: { targetType: "build" | "comment"; target: string | number; t: GunsmithMessages; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (done) return <span className={s.small}>{done}</span>;
  return (
    <>
      <button type="button" className={small ? s.linkBtn : "btn"} onClick={() => setOpen(true)} style={small ? { fontSize: 13, color: "var(--faint)" } : undefined}>
        {t.c_report}
      </button>
      {open && (
        <>
          <div className={s.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
          <form
            className={s.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            style={{ width: "min(480px, calc(100vw - 24px))", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reason) return;
              setError(null);
              try {
                await call("/api/reports", "POST", { targetType, target, reason, note });
                setDone(t.c_report_done);
                setOpen(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Fehler");
              }
            }}
          >
            <h2 id="report-title" className={s.drawerTitle}>
              {t.c_report_title}
            </h2>
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t.c_report_reason}</legend>
              {REASONS.map((r) => (
                <label key={r} style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 34 }}>
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} style={{ accentColor: "var(--accent)" }} />
                  {t[`reason_${r}`]}
                </label>
              ))}
            </fieldset>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
              {t.c_report_note}
              <textarea className={s.field} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} style={{ height: "auto", padding: "8px 12px" }} />
            </label>
            {error && (
              <p role="alert" style={{ margin: 0, color: "var(--bad)" }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {t.b_cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={!reason}>
                {t.c_report_send}
              </button>
            </div>
          </form>
        </>
      )}
    </>
  );
}

/** Kommentare unter einem Build. Text wird nur als Text gezeigt (kein HTML, keine Links). */
export function Comments(props: { publicId: string; t: GunsmithMessages; uiLang: "de" | "en"; loggedIn: boolean; loginUrl: string | null; viewerId: number | null; initial: SerializedComment[] }) {
  const { t } = props;
  const [comments, setComments] = useState(props.initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const fmt = (iso: string) => new Date(iso).toLocaleString(props.uiLang === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: SITE_TZ });

  const reload = async () => {
    const res = await fetch(`/b/${props.publicId}/kommentare`, { cache: "no-store" });
    if (res.ok) setComments((await res.json()) as SerializedComment[]);
  };

  return (
    <section aria-labelledby="comments-title">
      <h2 id="comments-title" className={s.drawerTitle} style={{ marginBottom: 12 }}>
        {t.c_comments} <span className={s.small}>({comments.filter((c) => c.status === "visible").length})</span>
      </h2>
      {comments.length === 0 && <p className={s.small}>{t.c_none}</p>}
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {comments.map((c) => (
          <li key={c.id} className="panel" style={{ padding: "12px 14px", opacity: c.status === "hidden" ? 0.6 : 1 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
              <a href={`/u/${c.author.login}`} style={{ fontWeight: 600, color: "var(--ink)" }}>
                {c.author.displayName}
              </a>
              <span className={s.small}>
                {fmt(c.createdAt)}
                {c.editedAt ? ` · ${t.c_edited}` : ""}
              </span>
              {c.status === "hidden" && <span className="tag" style={{ color: "var(--bad)" }}>{t.c_hidden}</span>}
              <span style={{ flex: 1 }} />
              {c.canEdit && (
                <button type="button" className={s.linkBtn} style={{ fontSize: 13 }} onClick={() => setEditing({ id: c.id, body: c.body })}>
                  {t.c_edit}
                </button>
              )}
              {props.viewerId === c.author.id && (
                <button
                  type="button"
                  className={s.linkBtn}
                  style={{ fontSize: 13, color: "var(--faint)" }}
                  onClick={async () => {
                    try {
                      await call(`/api/comments/${c.id}`, "DELETE");
                      setComments((x) => x.filter((y) => y.id !== c.id));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Fehler");
                    }
                  }}
                >
                  {t.c_delete}
                </button>
              )}
              {props.loggedIn && props.viewerId !== c.author.id && c.status === "visible" && <ReportButton targetType="comment" target={c.id} t={t} small />}
            </div>
            {editing?.id === c.id ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await call(`/api/comments/${c.id}`, "PATCH", { body: editing.body });
                    setEditing(null);
                    await reload();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Fehler");
                  }
                }}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <label className="visually-hidden" htmlFor={`edit-${c.id}`}>
                  {t.c_edit}
                </label>
                <textarea id={`edit-${c.id}`} className={s.field} rows={3} maxLength={1000} value={editing.body} onChange={(e) => setEditing({ id: c.id, body: e.target.value })} style={{ height: "auto", padding: "8px 12px" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn btn-primary">
                    {t.c_save}
                  </button>
                  <button type="button" className="btn" onClick={() => setEditing(null)}>
                    {t.b_cancel}
                  </button>
                </div>
              </form>
            ) : (
              <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--ink-2)" }}>{c.body}</p>
            )}
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      {props.loggedIn ? (
        <form
          style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setBusy(true);
            setError(null);
            try {
              await call(`/api/builds/${props.publicId}/comments`, "POST", { body: text });
              setText("");
              await reload();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Fehler");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="new-comment" className="visually-hidden">
            {t.c_comments}
          </label>
          <textarea id="new-comment" className={s.field} rows={3} maxLength={1000} placeholder={t.c_comment_ph} value={text} onChange={(e) => setText(e.target.value)} style={{ height: "auto", padding: "10px 12px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className={s.small}>{text.length} / 1000</span>
            <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
              {t.c_send}
            </button>
          </div>
        </form>
      ) : props.loginUrl ? (
        <p style={{ marginTop: 14 }}>
          <a href={props.loginUrl}>{t.c_login}</a>
        </p>
      ) : null}
    </section>
  );
}
