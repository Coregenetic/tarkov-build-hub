import Link from "next/link";
import { AUDIT_AREAS, listAudit, type AuditArea } from "@tbh/builds";
import { Pager } from "@/components/admin/Pager";
import s from "@/components/admin/admin.module.css";
import { fmtDateTime, intParam, requireAdminPage, strParam } from "@/lib/admin";
import { db } from "@/lib/server";

const AREA_LABEL: Record<AuditArea, string> = { data: "Spieldaten", builds: "Builds", reports: "Meldungen & Kommentare", users: "Nutzer", system: "System" };

/** Kurze, lesbare Zusammenfassung der Details (vorher → nachher, Grund). */
function summary(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as Record<string, unknown>;
  const show = (v: unknown) => (v === null || v === undefined ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const parts: string[] = [];
  if ("before" in d || "after" in d) parts.push(`${show(d["before"])} → ${show(d["after"])}`);
  for (const [k, v] of Object.entries(d)) if (k !== "before" && k !== "after") parts.push(`${k}: ${show(v)}`);
  const text = parts.join(" · ");
  return text.length > 220 ? `${text.slice(0, 219)}…` : text;
}

export default async function AdminAudit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { staff } = await requireAdminPage();
  const sp = await searchParams;
  const rawArea = strParam(sp["bereich"]);
  const area = (Object.hasOwn(AUDIT_AREAS, rawArea) ? rawArea : null) as AuditArea | null;
  const page = intParam(sp["seite"], 1);
  const { rows, total } = await listAudit(db(), staff, { area, page, limit: 50 });
  const href = (p: { bereich?: string | null; seite?: number }) => {
    const u = new URLSearchParams();
    const b = p.bereich === undefined ? area : p.bereich;
    if (b) u.set("bereich", b);
    if (p.seite && p.seite > 1) u.set("seite", String(p.seite));
    const str = u.toString();
    return `/admin/protokoll${str ? `?${str}` : ""}`;
  };

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <h1 className={s.h1}>Protokoll</h1>
          <p className={s.lead}>Jede Änderung durch Admins, Moderatoren und die Server-Konsole – mit vorher/nachher und Grund. Einträge lassen sich nicht ändern oder löschen, auch nicht direkt in der Datenbank.</p>
        </div>
        <a className="btn" href={`/admin/protokoll/csv${area ? `?bereich=${area}` : ""}`} download>
          Als CSV
        </a>
      </header>

      <nav className={s.chips} aria-label="Bereich">
        <Link href={href({ bereich: null })} className={`${s.chip} ${!area ? s.chipOn : ""}`} aria-current={!area ? "true" : undefined}>
          Alle
        </Link>
        {(Object.keys(AUDIT_AREAS) as AuditArea[]).map((a) => (
          <Link key={a} href={href({ bereich: a })} className={`${s.chip} ${area === a ? s.chipOn : ""}`} aria-current={area === a ? "true" : undefined}>
            {AREA_LABEL[a]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className={s.card} style={{ padding: "28px 20px" }}>
          Keine Einträge.
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Wer</th>
                <th>Aktion</th>
                <th>Ziel</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={s.small} style={{ whiteSpace: "nowrap" }}>
                    {fmtDateTime(r.at)}
                  </td>
                  <td>{r.actor}</td>
                  <td>
                    <code>{r.action}</code>
                    <div className={s.small}>{AREA_LABEL[r.area]}</div>
                  </td>
                  <td className={s.muted} style={{ wordBreak: "break-all", minWidth: 140 }}>
                    {r.target}
                  </td>
                  <td style={{ minWidth: 260, fontSize: 13, color: "var(--ink-2)" }}>{summary(r.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={total} perPage={50} href={(p) => href({ seite: p })} />
    </>
  );
}
