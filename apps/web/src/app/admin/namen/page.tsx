import Link from "next/link";
import { and, eq, ilike } from "drizzle-orm";
import type { NameIssue } from "@tbh/data-adapters";
import { itemName } from "@tbh/db";
import { listNameOverrides, loadDisplayNames } from "@tbh/game-data";
import { getDataset } from "@tbh/import";
import { AdminAction } from "@/components/admin/AdminAction";
import { NameEditor } from "@/components/admin/NameEditor";
import s from "@/components/admin/admin.module.css";
import { fmtDateTime, requireAdminPage, strParam } from "@/lib/admin";
import { activeDataset } from "@/lib/gunsmith-server";
import { db } from "@/lib/server";

type Lang = "de" | "en";
const KIND_LABEL = { cyrillic: "Kyrillische Zeichen", caliber: "Kaliber passt nicht" } as const;

export default async function AdminNames({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const lang: Lang = strParam(sp["sprache"]) === "en" ? "en" : "de";
  const q = strParam(sp["q"]).trim();
  const ds = await activeDataset("pvp");
  if (!ds) {
    return (
      <>
        <h1 className={s.h1}>Item-Namen</h1>
        <div className={s.card} style={{ padding: "28px 20px" }}>
          Kein aktiver Datensatz. <Link href="/admin/import">Zum Datenimport</Link>
        </div>
      </>
    );
  }
  const d = db();
  const [row, overrides, found] = await Promise.all([
    getDataset(d, ds.id),
    listNameOverrides(d),
    q.length >= 2
      ? d
          .select({ extId: itemName.extId })
          .from(itemName)
          .where(and(eq(itemName.datasetId, ds.id), eq(itemName.lang, lang), ilike(itemName.name, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)))
          .limit(25)
      : Promise.resolve([]),
  ]);
  const issues = ((row?.dataset.report as { nameIssueList?: NameIssue[] } | undefined)?.nameIssueList ?? []).filter((i) => i.lang === lang);
  const langOverrides = overrides.filter((o) => o.lang === lang);
  const ids = [...new Set([...issues.map((i) => i.itemExtId), ...langOverrides.map((o) => o.extId), ...found.map((f) => f.extId)])];
  const names = await loadDisplayNames(d, ds.id, lang, ids);
  const isFixed = (i: NameIssue) => !!names.get(i.itemExtId)?.overridden[i.field === "shortName" ? "shortName" : "name"];
  const open = issues.filter((i) => i.suggestion && !isFixed(i)).length;
  const fixed = issues.filter((i) => names.get(i.itemExtId)?.overridden[i.field === "shortName" ? "shortName" : "name"]).length;

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <h1 className={s.h1}>Item-Namen</h1>
          <p className={s.lead}>
            Eigene Anzeigenamen ersetzen die Namen von tarkov.dev überall auf der Seite – auch nach neuen Importen. Die Quelle bleibt unverändert gespeichert; jede Änderung steht mit vorher/nachher im Protokoll.
            Zurücksetzen stellt den Namen der Quelle wieder her.
          </p>
        </div>
        <nav className={s.chips} aria-label="Sprache der Item-Namen">
          {(["de", "en"] as const).map((l) => (
            <Link key={l} href={`/admin/namen?sprache=${l}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`${s.chip} ${l === lang ? s.chipOn : ""}`} aria-current={l === lang ? "true" : undefined}>
              {l === "de" ? "Deutsch" : "Englisch"}
            </Link>
          ))}
        </nav>
      </header>

      <section className={s.card} aria-labelledby="search">
        <div className={s.cardHead}>
          <h2 className={s.cardTitle} id="search">
            Beliebiges Item umbenennen
          </h2>
          <span className={s.small}>z. B. Waffennamen</span>
        </div>
        <form action="/admin/namen" role="search" style={{ display: "flex", gap: 8, padding: 16 }}>
          <input type="hidden" name="sprache" value={lang} />
          <label className="visually-hidden" htmlFor="nq">
            Item-Name
          </label>
          <input id="nq" name="q" defaultValue={q} placeholder="Name enthält …" className={s.input} style={{ flex: "1 1 auto", maxWidth: 360 }} minLength={2} />
          <button className="btn" style={{ minHeight: 40 }}>
            Suchen
          </button>
        </form>
        {q.length >= 2 &&
          (found.length ? (
            <ItemTable
              rows={found.map((f) => {
                const n = names.get(f.extId);
                return { extId: f.extId, field: "name" as const, source: n?.source.name ?? "", current: n?.name ?? "", overridden: !!n?.overridden.name, initial: n?.name ?? "" };
              })}
              lang={lang}
            />
          ) : (
            <p className={s.muted} style={{ padding: "0 16px 16px", margin: 0 }}>
              Kein Item mit „{q}“ im aktiven Datensatz.
            </p>
          ))}
      </section>

      <section className={s.card} aria-labelledby="issues">
        <div className={s.cardHead}>
          <h2 className={s.cardTitle} id="issues">
            Auffällige Namen der Quelle
          </h2>
          <span className={s.small}>
            {issues.length} gefunden · {fixed} korrigiert · Datensatz #{ds.id}
          </span>
        </div>
        <p className={s.small} style={{ padding: "12px 16px 0", margin: 0 }}>
          Automatisch erkannt beim Import: kyrillische Buchstaben, die wie lateinische aussehen (stören Suche und Sortierung), und Kaliberangaben im Namen, die nicht zur Waffe passen. Vorschläge nur, wenn sie
          eindeutig ableitbar sind – bitte trotzdem prüfen.
        </p>
        {open > 0 && (
          <div style={{ padding: "12px 16px 0", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <AdminAction primary small label={`Alle ${open} Vorschläge übernehmen`} payload={{ type: "name.apply_suggestions", lang }} />
            <span className={s.small}>einzeln im Protokoll, jederzeit zurücksetzbar</span>
          </div>
        )}
        {issues.length ? (
          <ItemTable
            rows={issues.map((i) => {
              const field = i.field === "shortName" ? ("short_name" as const) : ("name" as const);
              const n = names.get(i.itemExtId);
              const overridden = field === "name" ? !!n?.overridden.name : !!n?.overridden.shortName;
              const current = field === "name" ? n?.name : n?.shortName;
              return { extId: i.itemExtId, field, source: i.value, current: current ?? i.value, overridden, initial: overridden ? (current ?? "") : (i.suggestion ?? i.value), issue: `${KIND_LABEL[i.kind]}: ${i.detail}` };
            })}
            lang={lang}
          />
        ) : (
          <p className={s.muted} style={{ padding: 16, margin: 0 }}>
            Keine Auffälligkeiten in dieser Sprache.
          </p>
        )}
      </section>

      <section className={s.card} aria-labelledby="ov">
        <div className={s.cardHead}>
          <h2 className={s.cardTitle} id="ov">
            Eigene Namen
          </h2>
          <span className={s.small}>{langOverrides.length} aktiv</span>
        </div>
        {langOverrides.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Eigener Name</th>
                  <th>Quelle</th>
                  <th>Notiz</th>
                  <th>Geändert</th>
                  <th>
                    <span className="visually-hidden">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {langOverrides.map((o) => {
                  const n = names.get(o.extId);
                  const nowSource = o.field === "name" ? n?.source.name : n?.source.shortName;
                  const sourceChanged = o.sourceValue !== null && nowSource !== undefined && nowSource !== o.sourceValue;
                  return (
                    <tr key={o.id}>
                      <td>
                        {o.value}
                        <div className={s.small}>{o.field === "name" ? "Name" : "Kurzname"}</div>
                      </td>
                      <td>
                        {nowSource ?? <span className={s.muted}>nicht im Datensatz</span>}
                        {sourceChanged && <div style={{ fontSize: 12, color: "var(--accent)" }}>Quelle hat sich geändert (vorher „{o.sourceValue}“) – noch nötig?</div>}
                      </td>
                      <td className={s.muted}>{o.note ?? "–"}</td>
                      <td className={s.small} style={{ whiteSpace: "nowrap" }}>
                        {fmtDateTime(o.updatedAt)}
                      </td>
                      <td>
                        <AdminAction small label="Zurücksetzen" payload={{ type: "name.remove", extId: o.extId, lang: o.lang, field: o.field }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={s.muted} style={{ padding: 16, margin: 0 }}>
            Noch keine eigenen Namen in dieser Sprache.
          </p>
        )}
      </section>
    </>
  );
}

interface Row {
  extId: string;
  field: "name" | "short_name";
  source: string;
  current: string;
  overridden: boolean;
  initial: string;
  issue?: string;
}

function ItemTable({ rows, lang }: { rows: Row[]; lang: Lang }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Name der Quelle</th>
            <th>Neuer Anzeigename</th>
            <th>
              <span className="visually-hidden">Zurücksetzen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.extId}:${r.field}`}>
              <td style={{ minWidth: 220 }}>
                {r.source}
                <div className={s.small}>
                  {r.field === "name" ? "Name" : "Kurzname"}
                  {r.issue ? ` · ${r.issue}` : ""}
                </div>
                {r.overridden && <div style={{ fontSize: 12, color: "var(--ok)" }}>angezeigt als „{r.current}“</div>}
              </td>
              <td style={{ minWidth: 320 }}>
                <NameEditor extId={r.extId} lang={lang} field={r.field} sourceValue={r.source} initial={r.initial} />
              </td>
              <td>{r.overridden && <AdminAction small label="Zurücksetzen" payload={{ type: "name.remove", extId: r.extId, lang, field: r.field }} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
