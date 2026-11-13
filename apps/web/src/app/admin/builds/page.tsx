import Link from "next/link";
import { listBuildsForStaff } from "@tbh/builds";
import { AdminAction } from "@/components/admin/AdminAction";
import { Pager } from "@/components/admin/Pager";
import s from "@/components/admin/admin.module.css";
import { fmtDateTime, intParam, requireStaffPage, STATUS_LABEL, strParam } from "@/lib/admin";
import { activeDataset, weaponCards } from "@/lib/gunsmith-server";
import { db } from "@/lib/server";

type Status = "all" | "reported" | "hidden";
const FILTERS: { key: Status; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "reported", label: "Gemeldet" },
  { key: "hidden", label: "Ausgeblendet / gelöscht" },
];

export default async function AdminBuilds({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { staff, isAdmin } = await requireStaffPage();
  const sp = await searchParams;
  const q = strParam(sp["q"]);
  const status = (["reported", "hidden"].includes(strParam(sp["status"])) ? strParam(sp["status"]) : "all") as Status;
  const page = intParam(sp["seite"], 1);
  const { rows, total } = await listBuildsForStaff(db(), staff, { q, status, page });
  const ds = await activeDataset("pvp");
  const weapons = ds ? await weaponCards(ds.id, rows.map((r) => r.weaponExtId), "de") : new Map();
  const link = (p: Record<string, string | number>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}) });
    for (const [k, v] of Object.entries(p)) u.set(k, String(v));
    const str = u.toString();
    return `/admin/builds${str ? `?${str}` : ""}`;
  };

  return (
    <>
      <header>
        <h1 className={s.h1}>Builds</h1>
        <p className={s.lead}>
          Ausblenden nimmt einen Build aus Suche und Feed; der Ersteller sieht den Grund und der Build lässt sich wiederherstellen. Endgültiges Löschen entfernt den Build samt Versionen und
          verlangt eine frische Twitch-Anmeldung{isAdmin ? "" : " (nur Admins)"}.
        </p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <form action="/admin/builds" role="search" style={{ display: "flex", gap: 8 }}>
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <label className="visually-hidden" htmlFor="bq">
            Titel oder Ersteller
          </label>
          <input id="bq" name="q" defaultValue={q} placeholder="Titel oder Ersteller" className={s.input} style={{ width: 240 }} />
          <button className="btn" style={{ minHeight: 40 }}>
            Suchen
          </button>
        </form>
        <div className={s.chips}>
          {FILTERS.map((f) => (
            <Link key={f.key} href={`/admin/builds?${new URLSearchParams({ ...(q ? { q } : {}), ...(f.key !== "all" ? { status: f.key } : {}) })}`} className={`${s.chip} ${status === f.key ? s.chipOn : ""}`} aria-current={status === f.key ? "true" : undefined}>
              {f.label}
            </Link>
          ))}
        </div>
        <span className={s.small} style={{ marginLeft: "auto" }}>
          {total.toLocaleString("de-DE")} Builds
        </span>
      </div>

      {rows.length === 0 ? (
        <div className={s.card} style={{ padding: "28px 20px" }}>
          Keine Builds für diese Auswahl.
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Build</th>
                <th>Ersteller</th>
                <th>Status</th>
                <th>Meldungen</th>
                <th>Geändert</th>
                <th>
                  <span className="visually-hidden">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.publicId}>
                  <td style={{ minWidth: 220 }}>
                    {r.status === "deleted" ? <span>{r.title}</span> : <Link href={`/b/${r.publicId}`}>{r.title}</Link>}
                    <div className={s.small}>{weapons.get(r.weaponExtId)?.name.name ?? r.weaponExtId}</div>
                  </td>
                  <td>{r.owner}</td>
                  <td>
                    <span className="tag" style={r.status === "published" ? undefined : { color: "var(--bad)" }}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.visibility === "unlisted" && <div className={s.small}>nur mit Link</div>}
                    {r.hiddenReason && <div className={s.small}>Grund: {r.hiddenReason}</div>}
                  </td>
                  <td className="num" style={r.openReports ? { color: "var(--bad)", fontWeight: 600 } : undefined}>
                    {r.openReports}
                  </td>
                  <td className={s.small} style={{ whiteSpace: "nowrap" }}>
                    {fmtDateTime(r.updatedAt)}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                      {r.status === "published" && <AdminAction small label="Ausblenden" needsReason payload={{ type: "build.hide", publicId: r.publicId }} />}
                      {r.status === "hidden" && <AdminAction small label="Wiederherstellen" payload={{ type: "build.restore", publicId: r.publicId }} />}
                      {isAdmin && r.status !== "deleted" && <AdminAction small danger label="Endgültig löschen" confirmLabel="Löschen" needsReason payload={{ type: "build.delete", publicId: r.publicId }} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={total} perPage={50} href={(p) => link({ seite: p })} />
    </>
  );
}
