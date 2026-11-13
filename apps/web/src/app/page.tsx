import Link from "next/link";
import { eq } from "drizzle-orm";
import { gamePatch, itemDataset } from "@tbh/db";
import { PURPOSES, parseSearchParams, searchBuilds } from "@tbh/builds";
import { BuildCards } from "@/components/builds/BuildCards";
import { cardsFromHits } from "@/lib/discovery";
import { activeDataset } from "@/lib/gunsmith-server";
import { formatDate, getItemLang, getMessages } from "@/lib/i18n";
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
  const [{ locale, t }, user, datasets, itemLang, ds] = await Promise.all([getMessages(), currentUser(), activeDatasets(), getItemLang(), activeDataset("pvp")]);
  const [newest, forks] = await Promise.all([
    searchBuilds(db(), { ...parseSearchParams({}), sort: "new" }, ds?.id ?? null),
    searchBuilds(db(), { ...parseSearchParams({}), sort: "forks" }, ds?.id ?? null),
  ]);
  const [newestCards, forkCards] = await Promise.all([
    cardsFromHits(newest.hits.slice(0, 6), ds?.id ?? null, itemLang, locale, t),
    cardsFromHits(forks.hits.filter((h) => h.forkCount > 0).slice(0, 6), ds?.id ?? null, itemLang, locale, t),
  ]);
  const section = (id: string, title: string, href: string, cards: Awaited<ReturnType<typeof cardsFromHits>>) => (
    <section aria-labelledby={id} style={{ paddingTop: 48 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <h2 id={id} className="head" style={{ margin: 0, fontSize: 32 }}>
          {title}
        </h2>
        <Link href={href}>{t.feed_all}</Link>
      </div>
      <BuildCards items={cards} />
    </section>
  );
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
              <Link className="btn btn-primary" href="/gunsmith">
                {t.cta_build}
              </Link>
              <Link className="btn" href="/builds">
                {t.cta_browse}
              </Link>
              {user ? (
                <Link className="btn" href={`/u/${user.login}`}>
                  {t.hero_cta_profile}
                </Link>
              ) : authConfig() ? (
                <a className="btn" href="/auth/twitch/login">
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

      <div className="container">
        <nav aria-labelledby="zwecke" style={{ paddingTop: 40 }}>
          <h2 id="zwecke" className="head" style={{ margin: "0 0 12px", fontSize: 22 }}>
            {t.feed_purpose}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PURPOSES.map((p) => (
              <Link key={p} href={`/builds?zweck=${p}`} className="btn" style={{ minHeight: 40, borderRadius: 20 }}>
                {t[`purpose_${p}`]}
              </Link>
            ))}
          </div>
        </nav>
        {newestCards.length === 0 ? (
          <div className="panel" style={{ marginTop: 48, padding: "48px 24px", textAlign: "center" }}>
            <p style={{ margin: "0 0 18px", color: "var(--muted)" }}>{t.feed_empty}</p>
            <Link className="btn btn-primary" href="/gunsmith">
              {t.cta_build}
            </Link>
          </div>
        ) : (
          section("neu", t.feed_new, "/builds", newestCards)
        )}
        {forkCards.length > 0 && section("varianten", t.feed_forks, "/builds?sort=forks", forkCards)}
      </div>
    </>
  );
}
