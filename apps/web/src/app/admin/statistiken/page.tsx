import Link from "next/link";
import { statsOverview } from "@tbh/builds";
import s from "@/components/admin/admin.module.css";
import { requireAdminPage, strParam } from "@/lib/admin";
import { activeDataset, weaponCards } from "@/lib/gunsmith-server";
import { db } from "@/lib/server";

const RANGES = [7, 30, 90] as const;
const shortDay = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const dayLabel = (key: string) => shortDay.format(new Date(`${key}T00:00:00Z`));

export default async function AdminStats({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const range = RANGES.find((r) => String(r) === strParam(sp["r"])) ?? 30;
  const stats = await statsOverview(db(), range);
  const ds = await activeDataset("pvp");
  const names = ds ? await weaponCards(ds.id, stats.topWeapons.map((w) => w.weaponExtId), "de") : new Map();
  const t = stats.totals;
  const maxWeapon = Math.max(1, ...stats.topWeapons.map((w) => w.count));

  return (
    <>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <h1 className={s.h1}>Statistiken</h1>
          <p className={s.lead}>Tageszähler ohne Tracking: keine IP-Adressen, keine Seitenaufrufe je Person. Aktive Nutzer werden 90 Tage lang als „war an diesem Tag angemeldet“ gezählt.</p>
        </div>
        <nav className={s.chips} aria-label="Zeitraum">
          {RANGES.map((r) => (
            <Link key={r} href={`/admin/statistiken?r=${r}`} className={`${s.chip} ${r === range ? s.chipOn : ""}`} aria-current={r === range ? "true" : undefined}>
              {r} Tage
            </Link>
          ))}
        </nav>
      </header>

      <div className={s.grid}>
        <Tile label="Neue Builds" value={t.builds} />
        <Tile label="davon Varianten" value={t.variants} />
        <Tile label="Kommentare" value={t.comments} />
        <Tile label="Gefällt mir" value={t.likes} />
        <Tile label="Anmeldungen" value={t.logins} />
        <Tile label="Meldungen" value={t.reports} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <DayChart title="Neue Builds pro Tag" unit="Builds" days={stats.days} values={stats.newBuilds} />
        <DayChart title="Aktive Nutzer pro Tag" unit="Nutzer" days={stats.days} values={stats.activeUsers} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <section className={s.card} aria-labelledby="tw">
          <div className={s.cardHead}>
            <h2 className={s.cardTitle} id="tw">
              Beliebteste Waffen
            </h2>
            <span className={s.small}>neue Builds im Zeitraum</span>
          </div>
          {stats.topWeapons.length ? (
            <ol style={{ listStyle: "none", margin: 0, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {stats.topWeapons.map((w) => (
                <li key={w.weaponExtId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "4px 12px", fontSize: 14 }}>
                  <Link href={`/builds?waffe=${w.weaponExtId}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {names.get(w.weaponExtId)?.name.name ?? w.weaponExtId}
                  </Link>
                  <span className="num">{w.count}</span>
                  <div className={s.hbar} style={{ width: `${(w.count / maxWeapon) * 100}%`, gridColumn: "1 / -1" }} aria-hidden />
                </li>
              ))}
            </ol>
          ) : (
            <p className={s.muted} style={{ padding: "12px 16px", margin: 0 }}>
              Im Zeitraum keine neuen Builds.
            </p>
          )}
        </section>

        <section className={s.card} aria-labelledby="sm">
          <div className={s.cardHead}>
            <h2 className={s.cardTitle} id="sm">
              Suchen ohne Treffer
            </h2>
            <span className={s.small}>zeigt, was fehlt</span>
          </div>
          {stats.searchMisses.length ? (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Suchbegriff</th>
                  <th style={{ textAlign: "right" }}>Anzahl</th>
                </tr>
              </thead>
              <tbody>
                {stats.searchMisses.map((m) => (
                  <tr key={m.query}>
                    <td>{m.query}</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {m.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={s.muted} style={{ padding: "12px 16px", margin: 0 }}>
              Keine erfolglosen Suchen im Zeitraum.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className={s.tile}>
      <span className={s.tileLabel}>{label}</span>
      <span className={s.tileValue}>{value.toLocaleString("de-DE")}</span>
    </div>
  );
}

/** Säulen je Tag mit Hover-/Fokus-Wert und Tabellenansicht für Screenreader und genaue Werte. */
function DayChart({ title, unit, days, values }: { title: string; unit: string; days: string[]; values: number[] }) {
  const max = Math.max(1, ...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const id = title.replace(/\W+/g, "-").toLowerCase();
  return (
    <section className={s.card} aria-labelledby={id}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle} id={id}>
          {title}
        </h2>
        <span className={s.small}>
          höchstens {Math.max(0, ...values)} · gesamt {sum}
        </span>
      </div>
      <div className={s.chart}>
        <div className={s.bars} aria-hidden>
          {values.map((v, i) => (
            <div key={days[i]} className={s.barWrap} tabIndex={-1}>
              <div className={s.bar} style={{ height: `${(v / max) * 100}%`, opacity: v ? 1 : 0.35 }} />
              <span className={s.tip}>
                {dayLabel(days[i]!)}: {v} {unit}
              </span>
            </div>
          ))}
        </div>
        <div className={s.axis} aria-hidden>
          <span>{dayLabel(days[0]!)}</span>
          <span>{dayLabel(days.at(-1)!)}</span>
        </div>
        <details style={{ marginTop: 10, fontSize: 13 }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)" }}>Als Tabelle</summary>
          <table className={s.table} style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th>Tag</th>
                <th style={{ textAlign: "right" }}>{unit}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d}>
                  <td>{dayLabel(d)}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {values[i]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}
