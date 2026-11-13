import Link from "next/link";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { listUsers } from "@tbh/builds";
import { appUser, auditLog, buildComment, isBannedNow, userSession } from "@tbh/db";
import { AdminAction } from "@/components/admin/AdminAction";
import { Pager } from "@/components/admin/Pager";
import s from "@/components/admin/admin.module.css";
import { fmtDate, fmtDateTime, intParam, requireStaffPage, ROLE_LABEL, strParam } from "@/lib/admin";
import { db } from "@/lib/server";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { staff, isAdmin } = await requireStaffPage();
  const sp = await searchParams;
  const q = strParam(sp["q"]);
  const page = intParam(sp["seite"], 1);
  const selectedId = intParam(sp["u"], 0) || null;
  const { rows, total } = await listUsers(db(), staff, q, page);
  const detail = selectedId ? await loadDetail(selectedId) : null;
  const qs = (p: Record<string, string | number>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(page > 1 ? { seite: String(page) } : {}) });
    for (const [k, v] of Object.entries(p)) u.set(k, String(v));
    return `/admin/nutzer?${u}`;
  };

  return (
    <>
      <header>
        <h1 className={s.h1}>Nutzer</h1>
        <p className={s.lead}>
          Alle Konten kommen über Twitch. Moderatoren sperren für 24 Stunden oder 7 Tage; dauerhafte Sperren, Rollenwechsel und das Entfernen aller Inhalte sind Admins vorbehalten. Admin wird man nur über
          die Server-Konsole.
        </p>
      </header>

      <form action="/admin/nutzer" role="search" style={{ display: "flex", gap: 8 }}>
        <label className="visually-hidden" htmlFor="uq">
          Twitch-Name
        </label>
        <input id="uq" name="q" defaultValue={q} placeholder="Twitch-Name" className={s.input} style={{ width: 240 }} />
        <button className="btn" style={{ minHeight: 40 }}>
          Suchen
        </button>
      </form>

      <div className={selectedId ? s.split : undefined}>
        <div>
          {rows.length === 0 ? (
            <div className={s.card} style={{ padding: "28px 20px" }}>
              Keine Nutzer gefunden.
            </div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Nutzer</th>
                    <th>Rolle</th>
                    <th>Builds</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} style={u.id === selectedId ? { background: "var(--accent-bg)" } : undefined}>
                      <td>
                        <Link href={qs({ u: u.id })} aria-current={u.id === selectedId ? "true" : undefined}>
                          {u.displayName}
                        </Link>
                        <div className={s.small}>seit {fmtDate(u.createdAt)}</div>
                      </td>
                      <td>{ROLE_LABEL[u.role]}</td>
                      <td className="num">{u.builds}</td>
                      <td>
                        {u.banned ? (
                          <span className="tag" style={{ color: "var(--bad)" }}>
                            {u.bannedUntil ? `gesperrt bis ${fmtDateTime(u.bannedUntil)}` : "dauerhaft gesperrt"}
                          </span>
                        ) : (
                          <span className={s.small}>aktiv</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Pager page={page} total={total} perPage={50} href={(p) => qs({ seite: p })} />
          </div>
        </div>

        {selectedId && !detail && (
          <section className={s.card} style={{ padding: 16 }}>
            Nutzer nicht gefunden.
          </section>
        )}
        {detail && (
          <section className={s.card} aria-labelledby="ud">
            <div className={s.cardHead}>
              <h2 className={s.cardTitle} id="ud">
                {detail.user.displayName}
              </h2>
              <Link href={`/u/${detail.user.login}`} className={s.small}>
                Profil →
              </Link>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: 0, padding: "12px 16px", fontSize: 14 }}>
              <dt className={s.muted}>Rolle</dt>
              <dd style={{ margin: 0 }}>{ROLE_LABEL[detail.user.role]}</dd>
              <dt className={s.muted}>Konto seit</dt>
              <dd style={{ margin: 0 }}>{fmtDate(detail.user.createdAt)}</dd>
              <dt className={s.muted}>Letzte Anmeldung</dt>
              <dd style={{ margin: 0 }}>{fmtDateTime(detail.user.lastLoginAt)}</dd>
              <dt className={s.muted}>Aktive Sitzungen</dt>
              <dd style={{ margin: 0 }}>{detail.sessions}</dd>
              <dt className={s.muted}>Kommentare</dt>
              <dd style={{ margin: 0 }}>{detail.comments}</dd>
              <dt className={s.muted}>Status</dt>
              <dd style={{ margin: 0, color: detail.banned ? "var(--bad)" : undefined }}>
                {detail.banned ? (detail.user.bannedUntil ? `gesperrt bis ${fmtDateTime(detail.user.bannedUntil)}` : "dauerhaft gesperrt") : "aktiv"}
                {detail.banned && detail.user.banReason && <div className={s.small}>Grund: {detail.user.banReason}</div>}
              </dd>
            </dl>

            {detail.user.id === staff.id ? (
              <p className={s.small} style={{ padding: "0 16px 16px", margin: 0 }}>
                Das bist du – eigene Rechte lassen sich hier nicht ändern.
              </p>
            ) : detail.user.role === "admin" ? (
              <p className={s.small} style={{ padding: "0 16px 16px", margin: 0 }}>
                Admins werden nur über die Server-Konsole verwaltet.
              </p>
            ) : (
              <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                <ActionGroup title="Sperren">
                  {detail.banned ? (
                    <AdminAction small label="Sperre aufheben" payload={{ type: "user.unban", userId: detail.user.id }} />
                  ) : detail.user.role === "moderator" && !isAdmin ? (
                    <span className={s.small}>Moderatoren sperrt nur ein Admin.</span>
                  ) : (
                    <>
                      <AdminAction small label="24 Stunden" needsReason payload={{ type: "user.ban", userId: detail.user.id, duration: "24h" }} />
                      <AdminAction small label="7 Tage" needsReason payload={{ type: "user.ban", userId: detail.user.id, duration: "7d" }} />
                      {isAdmin && <AdminAction small danger label="Dauerhaft" needsReason payload={{ type: "user.ban", userId: detail.user.id, duration: "permanent" }} />}
                    </>
                  )}
                </ActionGroup>
                {isAdmin && (
                  <>
                    <ActionGroup title="Rolle (frische Anmeldung nötig)">
                      {detail.user.role === "user" ? (
                        <AdminAction small label="Zum Moderator machen" payload={{ type: "user.role", userId: detail.user.id, role: "moderator" }} />
                      ) : (
                        <AdminAction small label="Moderator entziehen" payload={{ type: "user.role", userId: detail.user.id, role: "user" }} />
                      )}
                    </ActionGroup>
                    <ActionGroup title="Sitzungen">
                      <AdminAction small label={`Alle abmelden (${detail.sessions})`} payload={{ type: "user.sessions", userId: detail.user.id }} />
                    </ActionGroup>
                    <ActionGroup title="Spam-Konto (frische Anmeldung nötig)">
                      <AdminAction small danger label="Alle Inhalte ausblenden + dauerhaft sperren" confirmLabel="Ausführen" needsReason payload={{ type: "user.purge", userId: detail.user.id }} />
                    </ActionGroup>
                  </>
                )}
              </div>
            )}

            {detail.history.length > 0 && (
              <div style={{ borderTop: "1px solid var(--line)", padding: "12px 16px" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Verlauf</h3>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                  {detail.history.map((h) => (
                    <li key={h.id}>
                      <span className={s.small}>{fmtDateTime(h.at)}</span> · <code>{h.action}</code> von {h.actor}
                      {typeof (h.details as { reason?: unknown })?.reason === "string" && <span className={s.muted}> – {(h.details as { reason: string }).reason}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function ActionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={s.small} style={{ marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>{children}</div>
    </div>
  );
}

async function loadDetail(id: number) {
  const d = db();
  const [user] = await d.select().from(appUser).where(eq(appUser.id, id));
  if (!user) return null;
  const [[sessions], [comments], history] = await Promise.all([
    d
      .select({ n: count() })
      .from(userSession)
      .where(and(eq(userSession.userId, id), gt(userSession.expiresAt, new Date()))),
    d.select({ n: count() }).from(buildComment).where(eq(buildComment.authorId, id)),
    d.select().from(auditLog).where(eq(auditLog.target, `app_user:${id}`)).orderBy(desc(auditLog.at)).limit(10),
  ]);
  return { user, sessions: sessions?.n ?? 0, comments: comments?.n ?? 0, banned: isBannedNow(user), history };
}
