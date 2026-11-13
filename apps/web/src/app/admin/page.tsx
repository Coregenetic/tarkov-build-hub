import Link from "next/link";
import { listAudit, listOpenReports, statsOverview } from "@tbh/builds";
import { getDataset } from "@tbh/import";
import s from "@/components/admin/admin.module.css";
import { ago, buildCounts, fmtDateTime, REASON_LABEL, requireStaffPage } from "@/lib/admin";
import { activeDataset } from "@/lib/gunsmith-server";
import { db } from "@/lib/server";

const STALE_DAYS = 7;

export default async function AdminOverview() {
  const { staff, isAdmin } = await requireStaffPage();
  const [reports, counts, stats, pvp, audit] = await Promise.all([
    listOpenReports(db(), staff),
    buildCounts(),
    statsOverview(db(), 1),
    activeDataset("pvp"),
    isAdmin ? listAudit(db(), staff, { limit: 8 }) : Promise.resolve(null),
  ]);
  const ds = pvp ? await getDataset(db(), pvp.id) : null;
  const report = ds?.dataset.report as { nameIssues?: { cyrillic: number; caliber: number }; itemCount?: number; warnings?: string[] } | undefined;
  const nameIssues = (report?.nameIssues?.cyrillic ?? 0) + (report?.nameIssues?.caliber ?? 0);
  const ageDays = pvp ? (Date.now() - pvp.fetchedAt.getTime()) / 86_400_000 : null;

  const attention: { text: string; href: string }[] = [];
  if (reports.length) attention.push({ text: `${reports.length} gemeldete ${reports.length === 1 ? "Inhalt wartet" : "Inhalte warten"} auf Prüfung`, href: "/admin/meldungen" });
  if (!pvp) attention.push({ text: "Kein aktiver Datensatz – der Gunsmith ist ohne Daten", href: "/admin/import" });
  else if (ageDays !== null && ageDays > STALE_DAYS) attention.push({ text: `Spieldaten sind ${Math.floor(ageDays)} Tage alt`, href: "/admin/import" });
  if (isAdmin && nameIssues) attention.push({ text: `${nameIssues} auffällige Item-Namen in der Quelle`, href: "/admin/namen" });

  return (
    <>
      <header>
        <h1 className={s.h1}>Übersicht</h1>
        <p className={s.lead}>Was heute los ist und was Aufmerksamkeit braucht. Zahlen ohne Tracking – nur Tageszähler.</p>
      </header>

      <div className={s.grid}>
        <Tile label="Offene Meldungen" value={reports.length} warn={reports.length > 0} />
        <Tile label="Aktive Nutzer heute" value={stats.activeUsers.at(-1) ?? 0} />
        <Tile label="Neue Builds heute" value={stats.newBuilds.at(-1) ?? 0} />
        <Tile label="Veröffentlichte Builds" value={counts.published} />
        <Tile label="Ausgeblendete Builds" value={counts.hidden} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <section className={s.card} aria-labelledby="att">
          <div className={s.cardHead}>
            <h2 className={s.cardTitle} id="att">
              Braucht Aufmerksamkeit
            </h2>
          </div>
          {attention.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 8 }}>
              {attention.map((a) => (
                <li key={a.text}>
                  <Link href={a.href} className={s.navItem} style={{ justifyContent: "space-between" }}>
                    {a.text} <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.muted} style={{ padding: "12px 16px", margin: 0 }}>
              Alles erledigt.
            </p>
          )}
        </section>

        <section className={s.card} aria-labelledby="ds">
          <div className={s.cardHead}>
            <h2 className={s.cardTitle} id="ds">
              Spieldaten (PvP)
            </h2>
            {isAdmin && (
              <Link href="/admin/import" className={s.small}>
                Datenimport →
              </Link>
            )}
          </div>
          {pvp ? (
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: 0, padding: "12px 16px", fontSize: 14 }}>
              <dt className={s.muted}>Patch</dt>
              <dd style={{ margin: 0 }}>{pvp.patch ?? "–"}</dd>
              <dt className={s.muted}>Datensatz</dt>
              <dd style={{ margin: 0 }}>#{pvp.id}</dd>
              <dt className={s.muted}>Abgerufen</dt>
              <dd style={{ margin: 0 }}>
                {fmtDateTime(pvp.fetchedAt)} ({ago(pvp.fetchedAt)})
              </dd>
              <dt className={s.muted}>Items</dt>
              <dd style={{ margin: 0 }}>{report?.itemCount?.toLocaleString("de-DE") ?? "–"}</dd>
              <dt className={s.muted}>Quelle</dt>
              <dd style={{ margin: 0 }}>tarkov.dev</dd>
            </dl>
          ) : (
            <p className={s.muted} style={{ padding: "12px 16px", margin: 0 }}>
              Kein aktiver Datensatz.
            </p>
          )}
        </section>
      </div>

      {reports.length > 0 && (
        <section className={s.card} aria-labelledby="rep">
          <div className={s.cardHead}>
            <h2 className={s.cardTitle} id="rep">
              Neueste Meldungen
            </h2>
            <Link href="/admin/meldungen" className={s.small}>
              Alle →
            </Link>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {reports.slice(0, 5).map((r) => (
              <li key={`${r.targetType}:${r.targetId}`} style={{ padding: "10px 16px", borderBottom: "1px solid #1e2124", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <span className="tag">{r.targetType === "build" ? "Build" : "Kommentar"}</span>
                <strong style={{ fontWeight: 500 }}>{r.title || "(gelöscht)"}</strong>
                <span className={s.small}>
                  {r.reports}× · {Object.keys(r.reasons).map((k) => REASON_LABEL[k] ?? k).join(", ")} · {ago(r.firstAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {audit && (
        <section className={s.card} aria-labelledby="aud">
          <div className={s.cardHead}>
            <h2 className={s.cardTitle} id="aud">
              Letzte Änderungen
            </h2>
            <Link href="/admin/protokoll" className={s.small}>
              Protokoll →
            </Link>
          </div>
          {audit.rows.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className={s.table}>
                <tbody>
                  {audit.rows.map((r) => (
                    <tr key={r.id}>
                      <td className={s.small} style={{ whiteSpace: "nowrap" }}>
                        {fmtDateTime(r.at)}
                      </td>
                      <td>{r.actor}</td>
                      <td>
                        <code>{r.action}</code>
                      </td>
                      <td className={s.muted} style={{ wordBreak: "break-all" }}>
                        {r.target}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={s.muted} style={{ padding: "12px 16px", margin: 0 }}>
              Noch keine Einträge.
            </p>
          )}
        </section>
      )}
    </>
  );
}

function Tile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={s.tile}>
      <span className={s.tileLabel}>{label}</span>
      <span className={s.tileValue} style={warn ? { color: "var(--bad)" } : undefined}>
        {value.toLocaleString("de-DE")}
      </span>
    </div>
  );
}
