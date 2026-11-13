import Link from "next/link";
import { listOpenReports } from "@tbh/builds";
import { AdminAction } from "@/components/admin/AdminAction";
import s from "@/components/admin/admin.module.css";
import { ago, REASON_LABEL, requireStaffPage, STATUS_LABEL } from "@/lib/admin";
import { db } from "@/lib/server";

export default async function ReportsPage() {
  const { staff } = await requireStaffPage();
  const groups = await listOpenReports(db(), staff);
  return (
    <>
      <header>
        <h1 className={s.h1}>Meldungen</h1>
        <p className={s.lead}>
          Meldungen sind je Inhalt gebündelt. Eine Entscheidung gilt für alle offenen Meldungen zu diesem Inhalt. Ausblenden ist umkehrbar; der Grund wird dem Ersteller angezeigt und
          protokolliert. „Ausblenden + 7 Tage sperren“ sperrt den Ersteller zusätzlich.
        </p>
      </header>
      {groups.length === 0 ? (
        <div className={s.card} style={{ padding: "28px 20px" }}>
          <p style={{ margin: 0 }}>Keine offenen Meldungen.</p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g) => {
            const target = { targetType: g.targetType, targetId: g.targetId };
            const href = g.buildPublicId ? `/b/${g.buildPublicId}${g.targetType === "comment" ? "/kommentare" : ""}` : null;
            return (
              <li key={`${g.targetType}:${g.targetId}`} className={s.card} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                  <span className="tag">{g.targetType === "build" ? "Build" : "Kommentar"}</span>
                  {href ? (
                    <Link href={href} style={{ fontWeight: 600, fontSize: 17 }}>
                      {g.title}
                    </Link>
                  ) : (
                    <strong>(Inhalt existiert nicht mehr)</strong>
                  )}
                  {g.targetStatus && g.targetStatus !== "published" && g.targetStatus !== "visible" && <span className="tag">{STATUS_LABEL[g.targetStatus] ?? g.targetStatus}</span>}
                  <span className={s.small} style={{ marginLeft: "auto" }}>
                    {g.reports} {g.reports === 1 ? "Meldung" : "Meldungen"} · seit {ago(g.firstAt)}
                  </span>
                </div>
                {g.excerpt && (
                  <blockquote style={{ margin: 0, padding: "8px 12px", borderLeft: "3px solid var(--line-strong)", background: "var(--bg)", whiteSpace: "pre-wrap", fontSize: 14 }}>{g.excerpt}</blockquote>
                )}
                <div className={s.small}>
                  Gründe: {Object.entries(g.reasons).map(([k, n]) => `${REASON_LABEL[k] ?? k} (${n})`).join(", ")}
                  {g.author && (
                    <>
                      {" "}
                      · Ersteller: <Link href={`/admin/nutzer?u=${g.author.id}`}>{g.author.login}</Link>
                    </>
                  )}
                </div>
                {g.notes.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--ink-2)" }}>
                    {g.notes.map((n, i) => (
                      <li key={i}>„{n}“</li>
                    ))}
                  </ul>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                  <AdminAction small label="Ablehnen" payload={{ type: "report.resolve", ...target, action: "dismiss" }} />
                  <AdminAction small label="Ausblenden" needsReason payload={{ type: "report.resolve", ...target, action: "hide" }} />
                  <AdminAction small danger label="Ausblenden + 7 Tage sperren" needsReason payload={{ type: "report.resolve", ...target, action: "hide_ban" }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
