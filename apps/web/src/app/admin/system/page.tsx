import { sql } from "drizzle-orm";
import { DEFAULT_BASE_URL } from "@tbh/data-adapters";
import { SettingsForm } from "@/components/admin/SettingsForm";
import s from "@/components/admin/admin.module.css";
import { ago, requireAdminPage } from "@/lib/admin";
import { activeDataset } from "@/lib/gunsmith-server";
import { authConfig, db } from "@/lib/server";
import { siteSettings } from "@/lib/site";

type Check = { label: string; ok: boolean | null; detail: string };

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T | null; error: string | null }> {
  const start = performance.now();
  try {
    const value = await fn();
    return { ms: Math.round(performance.now() - start), value, error: null };
  } catch (e) {
    return { ms: Math.round(performance.now() - start), value: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function AdminSystem() {
  await requireAdminPage();
  const base = (process.env["TARKOV_DEV_BASE_URL"] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const [dbPing, pvp, source, settings] = await Promise.all([
    timed(() => db().execute(sql`select 1`)),
    activeDataset("pvp"),
    timed(async () => {
      const res = await fetch(`${base}/regular/traders`, { method: "HEAD", signal: AbortSignal.timeout(5000), cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.status;
    }),
    siteSettings(),
  ]);
  const ageDays = pvp ? (Date.now() - pvp.fetchedAt.getTime()) / 86_400_000 : null;
  const checks: Check[] = [
    { label: "Datenbank", ok: !dbPing.error, detail: dbPing.error ? `nicht erreichbar (${dbPing.error})` : `antwortet in ${dbPing.ms} ms` },
    {
      label: "Spieldaten (PvP)",
      ok: pvp ? (ageDays! <= 7 ? true : null) : false,
      detail: pvp ? `Datensatz #${pvp.id}, Patch ${pvp.patch ?? "–"}, abgerufen ${ago(pvp.fetchedAt)}${ageDays! > 7 ? " – bitte aktualisieren" : ""}` : "kein aktiver Datensatz",
    },
    { label: "tarkov.dev", ok: !source.error, detail: source.error ? `nicht erreichbar (${source.error})` : `erreichbar in ${source.ms} ms` },
    { label: "Twitch-Login", ok: authConfig() ? true : null, detail: authConfig() ? "eingerichtet" : "nicht eingerichtet (Login deaktiviert)" },
    { label: "Laufzeit", ok: true, detail: `Node ${process.version}, läuft seit ${formatUptime(process.uptime())}` },
  ];

  return (
    <>
      <header>
        <h1 className={s.h1}>System</h1>
        <p className={s.lead}>Zustand der Dienste und seitenweite Schalter. Jede Änderung landet im Protokoll.</p>
      </header>

      <section className={s.card} aria-labelledby="health">
        <div className={s.cardHead}>
          <h2 className={s.cardTitle} id="health">
            Zustand
          </h2>
          <span className={s.small}>beim Laden der Seite geprüft</span>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {checks.map((c) => (
            <li key={c.label} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, padding: "10px 16px", borderBottom: "1px solid #1e2124", fontSize: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: c.ok === true ? "var(--ok)" : c.ok === false ? "var(--bad)" : "var(--accent)" }} />
                {c.label}
              </span>
              <span className={s.muted}>
                <span className="visually-hidden">{c.ok === true ? "In Ordnung: " : c.ok === false ? "Fehler: " : "Hinweis: "}</span>
                {c.detail}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.card} aria-labelledby="set">
        <div className={s.cardHead}>
          <h2 className={s.cardTitle} id="set">
            Seitenweite Schalter
          </h2>
        </div>
        <SettingsForm banner={settings.banner} maintenance={settings.maintenance.enabled} />
      </section>
    </>
  );
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  if (h >= 48) return `${Math.floor(h / 24)} Tagen`;
  if (h >= 1) return `${h} Std.`;
  return `${Math.max(1, Math.floor(sec / 60))} Min.`;
}
