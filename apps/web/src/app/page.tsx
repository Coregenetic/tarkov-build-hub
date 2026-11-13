import Link from "next/link";
import { eq } from "drizzle-orm";
import { gamePatch, itemDataset } from "@tbh/db";
import { formatDate, getMessages } from "@/lib/i18n";
import { authConfig, currentUser, db } from "@/lib/server";

export const dynamic = "force-dynamic";

async function activeDatasets() {
  try {
    return await db()
      .select({ mode: itemDataset.mode, itemCount: itemDataset.itemCount, sourceUpdatedAt: itemDataset.sourceUpdatedAt, patch: gamePatch.label })
      .from(itemDataset)
      .leftJoin(gamePatch, eq(gamePatch.id, itemDataset.patchId))
      .where(eq(itemDataset.status, "active"));
  } catch (error) {
    console.error("Datenstand nicht abrufbar:", error);
    return null;
  }
}

export default async function HomePage() {
  const [{ locale, t }, user, datasets] = await Promise.all([getMessages(), currentUser(), activeDatasets()]);
  return (
    <>
      <section className="stage" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="container" style={{ padding: "72px 32px 64px", display: "flex", flexWrap: "wrap", gap: "40px 64px", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 420px", maxWidth: 640, display: "flex", flexDirection: "column", gap: 18 }}>
            <span className="head" style={{ color: "var(--accent)", fontSize: 15, letterSpacing: "0.06em" }}>
              {t.hero_kicker.toUpperCase()}
            </span>
            <h1 className="head" style={{ margin: 0, fontSize: "clamp(44px, 7vw, 76px)", lineHeight: 0.95, fontWeight: 700 }}>
              {t.hero_title}
            </h1>
            <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 18, maxWidth: 560 }}>{t.hero_text}</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
              {user ? (
                <Link className="btn btn-primary" href={`/u/${user.login}`}>
                  {t.hero_cta_profile}
                </Link>
              ) : authConfig() ? (
                <a className="btn btn-primary" href="/auth/twitch/login">
                  {t.login}
                </a>
              ) : null}
            </div>
          </div>

          <aside aria-labelledby="datenstand" className="panel" style={{ flex: "1 1 300px", maxWidth: 420, padding: 20 }}>
            <h2 id="datenstand" className="head" style={{ margin: "0 0 12px", fontSize: 20 }}>
              {t.status_title}
            </h2>
            {!datasets || datasets.length === 0 ? (
              <p style={{ margin: 0, color: "var(--muted)" }}>{t.status_none}</p>
            ) : (
              <dl style={{ margin: 0, display: "grid", gap: 12 }}>
                {datasets.map((d) => (
                  <div key={d.mode} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    <dt>
                      <span className="tag tag-accent">{d.mode.toUpperCase()}</span>
                    </dt>
                    <dd className="num" style={{ margin: 0, textAlign: "right", color: "var(--ink-2)", fontSize: 14 }}>
                      {t.status_patch} {d.patch ?? "—"} · {d.itemCount.toLocaleString(locale)} {t.status_items}
                      <br />
                      <span style={{ color: "var(--faint)" }}>
                        {t.status_updated} {d.sourceUpdatedAt ? formatDate(d.sourceUpdatedAt, locale) : "—"}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
