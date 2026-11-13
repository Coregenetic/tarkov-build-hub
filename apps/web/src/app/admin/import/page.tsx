import { getDataset, listDatasets } from "@tbh/import";
import { AdminAction } from "@/components/admin/AdminAction";
import s from "@/components/admin/admin.module.css";
import { ago, fmtDateTime, requireAdminPage, STATUS_LABEL } from "@/lib/admin";
import { db } from "@/lib/server";

interface ReportSummary {
  itemCount?: number;
  gunCount?: number;
  traderCount?: number;
  traderOfferCount?: number;
  nameIssues?: { cyrillic: number; caliber: number };
  errors?: string[];
  warnings?: string[];
}

export default async function AdminImport() {
  await requireAdminPage();
  const d = db();
  const datasets = await listDatasets(d);
  const previews = datasets.filter((x) => x.status === "preview");
  const reports = new Map<number, ReportSummary>();
  for (const p of previews) {
    const row = await getDataset(d, p.id);
    if (row) reports.set(p.id, row.dataset.report as ReportSummary);
  }
  const canRollback = (mode: "pvp" | "pve") => datasets.some((x) => x.mode === mode && x.status === "archived");

  return (
    <>
      <header>
        <h1 className={s.h1}>Datenimport</h1>
        <p className={s.lead}>
          Spieldaten kommen von tarkov.dev. Ein Abruf landet immer erst als Vorschau mit Prüfbericht – sichtbar wird er erst nach der Freigabe mit Patch-Bezeichnung. Veröffentlichte Builds behalten ihren Patch;
          ältere Datensätze bleiben archiviert, damit sie weiter angezeigt und zurückgeholt werden können. Freigabe und Zurückrollen verlangen eine frische Twitch-Anmeldung.
        </p>
      </header>

      <section className={s.card} aria-labelledby="new">
        <div className={s.cardHead}>
          <h2 className={s.cardTitle} id="new">
            Neu abrufen
          </h2>
          <span className={s.small}>dauert etwa eine Minute</span>
        </div>
        <div style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
          <AdminAction primary label="PvP-Daten abrufen" payload={{ type: "import.fetch", mode: "pvp" }} />
          <AdminAction label="PvE-Daten abrufen" payload={{ type: "import.fetch", mode: "pve" }} />
          <span style={{ flexBasis: "100%" }} />
          {canRollback("pvp") && <AdminAction danger label="PvP auf vorherigen Datensatz zurückrollen" payload={{ type: "import.rollback", mode: "pvp" }} />}
          {canRollback("pve") && <AdminAction danger label="PvE zurückrollen" payload={{ type: "import.rollback", mode: "pve" }} />}
        </div>
      </section>

      {previews.map((p) => {
        const r = reports.get(p.id);
        const errors = r?.errors ?? [];
        return (
          <section key={p.id} className={s.card} aria-labelledby={`p${p.id}`} style={{ borderColor: errors.length ? "#5a2e22" : "var(--accent)" }}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle} id={`p${p.id}`}>
                Vorschau #{p.id} · {p.mode.toUpperCase()}
              </h2>
              <span className={s.small}>abgerufen {fmtDateTime(p.fetchedAt)}</span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div className={s.grid}>
                <Mini label="Items" value={r?.itemCount} />
                <Mini label="Waffen" value={r?.gunCount} />
                <Mini label="Händler" value={r?.traderCount} />
                <Mini label="Händlerangebote" value={r?.traderOfferCount} />
                <Mini label="Auffällige Namen" value={(r?.nameIssues?.cyrillic ?? 0) + (r?.nameIssues?.caliber ?? 0)} />
              </div>
              {errors.length > 0 && (
                <div role="alert" style={{ color: "var(--bad)", fontSize: 14 }}>
                  <strong>Fehler – Freigabe gesperrt:</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(r?.warnings?.length ?? 0) > 0 && (
                <details style={{ fontSize: 14 }}>
                  <summary style={{ cursor: "pointer", color: "var(--accent)" }}>{r!.warnings!.length} Hinweise</summary>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--ink-2)" }}>
                    {r!.warnings!.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                {errors.length === 0 && (
                  <AdminAction primary label="Freigeben" confirmLabel="Jetzt freigeben" input={{ name: "patch", label: "Patch-Bezeichnung (z. B. 0.16.9)", placeholder: "0.16.9" }} payload={{ type: "import.activate", id: p.id }} />
                )}
                <AdminAction label="Verwerfen" payload={{ type: "import.discard", id: p.id }} />
              </div>
            </div>
          </section>
        );
      })}

      <section aria-labelledby="hist">
        <h2 className={s.cardTitle} id="hist" style={{ marginBottom: 10 }}>
          Alle Datensätze
        </h2>
        {datasets.length === 0 ? (
          <div className={s.card} style={{ padding: "28px 20px" }}>
            Noch kein Datensatz importiert.
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Modus</th>
                  <th>Status</th>
                  <th>Patch</th>
                  <th style={{ textAlign: "right" }}>Items</th>
                  <th>Abgerufen</th>
                  <th>Freigegeben</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((x) => (
                  <tr key={x.id}>
                    <td className="num">{x.id}</td>
                    <td>{x.mode.toUpperCase()}</td>
                    <td>
                      <span className={x.status === "active" ? "tag tag-ok" : "tag"}>{STATUS_LABEL[x.status] ?? x.status}</span>
                    </td>
                    <td>{x.patch ?? "–"}</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {x.itemCount.toLocaleString("de-DE")}
                    </td>
                    <td className={s.small} style={{ whiteSpace: "nowrap" }}>
                      {fmtDateTime(x.fetchedAt)} · {ago(x.fetchedAt)}
                    </td>
                    <td className={s.small} style={{ whiteSpace: "nowrap" }}>
                      {fmtDateTime(x.activatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Mini({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className={s.tile} style={{ background: "var(--bg)" }}>
      <span className={s.tileLabel}>{label}</span>
      <span className={s.tileValue} style={{ fontSize: 26 }}>
        {value === undefined ? "–" : value.toLocaleString("de-DE")}
      </span>
    </div>
  );
}
