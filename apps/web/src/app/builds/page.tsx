import type { Metadata } from "next";
import Link from "next/link";
import { PURPOSES, SORTS, parseSearchParams, searchBuilds, searchFacets, toSearchParams, type SearchFilters } from "@tbh/builds";
import { BuildCards } from "@/components/builds/BuildCards";
import { cardsFromHits } from "@/lib/discovery";
import { getItemLang, getMessages } from "@/lib/i18n";
import { activeDataset, caliberLabels, weaponCards } from "@/lib/gunsmith-server";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const f = parseSearchParams(await searchParams);
  const { t } = await getMessages();
  const filtered = toSearchParams({ ...f, page: 1, sort: "new" }).toString() !== "";
  return {
    title: t.s_title,
    description: t.s_lead,
    // Gefilterte und weitere Seiten nicht indexieren, nur die Übersicht.
    robots: filtered || f.page > 1 ? { index: false, follow: true } : undefined,
  };
}

const field = { height: 42, padding: "0 12px", borderRadius: 6, border: "1px solid var(--line-strong)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 15, width: "100%" } as const;
const label = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--muted)", minWidth: 0 } as const;

export default async function BuildsPage({ searchParams }: { searchParams: Search }) {
  const f = parseSearchParams(await searchParams);
  const [{ locale, t }, itemLang, ds] = await Promise.all([getMessages(), getItemLang(), activeDataset(f.mode)]);
  const [result, facets] = await Promise.all([searchBuilds(db(), f, ds?.id ?? null), searchFacets(db(), f.mode)]);
  const [cards, weaponNames, calibers] = await Promise.all([
    cardsFromHits(result.hits, ds?.id ?? null, itemLang, locale, t),
    ds ? weaponCards(ds.id, [...facets.weapons.map((w) => w.value), ...(f.part ? [f.part] : [])], itemLang) : Promise.resolve(new Map()),
    ds ? caliberLabels(ds.id) : Promise.resolve(new Map<string, string>()),
  ]);
  const href = (patch: Partial<SearchFilters>) => {
    const qs = toSearchParams({ ...f, page: 1, ...patch }).toString();
    return qs ? `/builds?${qs}` : "/builds";
  };
  const active: { label: string; remove: string }[] = [];
  if (f.q) active.push({ label: `„${f.q}“`, remove: href({ q: "" }) });
  if (f.weapon) active.push({ label: weaponNames.get(f.weapon)?.name.short ?? t.s_weapon, remove: href({ weapon: null }) });
  if (f.caliber) active.push({ label: calibers.get(f.caliber) ?? f.caliber, remove: href({ caliber: null }) });
  if (f.purpose) active.push({ label: t[`purpose_${f.purpose}`], remove: href({ purpose: null }) });
  if (f.maxPrice != null) active.push({ label: `≤ ${f.maxPrice.toLocaleString(locale)} ₽`, remove: href({ maxPrice: null }) });
  if (f.patch) active.push({ label: `Patch ${f.patch}`, remove: href({ patch: null }) });
  if (f.creator) active.push({ label: `${t.s_by} ${f.creator}`, remove: href({ creator: null }) });
  if (f.part) active.push({ label: `${t.s_with_part} ${weaponNames.get(f.part)?.name.short ?? f.part.slice(0, 6)}`, remove: href({ part: null }) });

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <h1 className="head" style={{ margin: 0, fontSize: 48, lineHeight: 1 }}>
        {t.s_title}
      </h1>
      <p style={{ color: "var(--muted)", margin: "10px 0 24px" }}>{t.s_lead}</p>

      <form method="get" action="/builds" className="panel" role="search" style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
        <label style={{ ...label, gridColumn: "span 2" }}>
          {t.s_q}
          <input type="search" name="q" defaultValue={f.q} placeholder={t.s_q_ph} maxLength={80} style={field} />
        </label>
        <label style={label}>
          {t.s_weapon}
          <select name="waffe" defaultValue={f.weapon ?? ""} style={field}>
            <option value="">{t.s_any}</option>
            {facets.weapons.map((w) => (
              <option key={w.value} value={w.value}>
                {weaponNames.get(w.value)?.name.short ?? w.value} ({w.count})
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          {t.s_caliber}
          <select name="kaliber" defaultValue={f.caliber ?? ""} style={field}>
            <option value="">{t.s_any}</option>
            {facets.calibers.map((c) => (
              <option key={c.value} value={c.value}>
                {calibers.get(c.value) ?? c.value} ({c.count})
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          {t.s_purpose}
          <select name="zweck" defaultValue={f.purpose ?? ""} style={field}>
            <option value="">{t.s_any}</option>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {t[`purpose_${p}`]}
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          {t.s_budget}
          <input type="number" name="budget" min={0} step={1000} inputMode="numeric" defaultValue={f.maxPrice ?? ""} style={field} />
        </label>
        <label style={label}>
          {t.s_patch}
          <select name="patch" defaultValue={f.patch ?? ""} style={field}>
            <option value="">{t.s_any}</option>
            {facets.patches.map((p) => (
              <option key={p.value} value={p.value}>
                {p.value} ({p.count})
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          {t.s_sort}
          <select name="sort" defaultValue={f.sort} style={field}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t[`sort_${s}`]}
              </option>
            ))}
          </select>
        </label>
        {f.creator && <input type="hidden" name="von" value={f.creator} />}
        {f.part && <input type="hidden" name="teil" value={f.part} />}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
            {t.s_apply}
          </button>
          <Link href="/builds" className="btn">
            {t.s_reset}
          </Link>
        </div>
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "18px 0" }}>
        <span className="num" style={{ color: "var(--ink-2)", marginRight: 8 }} aria-live="polite">
          {result.total.toLocaleString(locale)} {t.s_results}
        </span>
        {active.map((a) => (
          <Link key={a.label} href={a.remove} className="tag" aria-label={`${a.label} ${t.s_remove}`} style={{ gap: 6 }}>
            {a.label} <span aria-hidden="true">×</span>
          </Link>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="panel" style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{t.s_none}</p>
          <p style={{ margin: "0 0 18px", color: "var(--muted)" }}>{t.s_none_hint}</p>
          <Link className="btn btn-primary" href="/gunsmith">
            {t.cta_build}
          </Link>
        </div>
      ) : (
        <BuildCards items={cards} />
      )}

      {result.pages > 1 && (
        <nav aria-label={t.s_page} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", marginTop: 28 }}>
          {f.page > 1 ? (
            <Link className="btn" href={href({ page: f.page - 1 })} rel="prev">
              {t.s_prev}
            </Link>
          ) : (
            <span className="btn" aria-disabled="true">
              {t.s_prev}
            </span>
          )}
          <span className="num" style={{ color: "var(--muted)" }}>
            {t.s_page} {f.page} / {result.pages}
          </span>
          {f.page < result.pages ? (
            <Link className="btn" href={href({ page: f.page + 1 })} rel="next">
              {t.s_next}
            </Link>
          ) : (
            <span className="btn" aria-disabled="true">
              {t.s_next}
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
