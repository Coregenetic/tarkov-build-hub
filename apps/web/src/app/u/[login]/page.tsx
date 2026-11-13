import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@tbh/auth";
import { listDrafts, listUserBuilds } from "@tbh/builds";
import { BuildCards } from "@/components/builds/BuildCards";
import { gunsmithMessages } from "@/gunsmith/messages";
import { activeDataset, weaponCards } from "@/lib/gunsmith-server";
import { getItemLang } from "@/lib/i18n";
import { Avatar } from "@/components/SiteHeader";
import { formatDate, getMessages } from "@/lib/i18n";
import { currentUser, db } from "@/lib/server";

export const dynamic = "force-dynamic";

const LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;

async function load(login: string) {
  const key = login.toLowerCase();
  if (!LOGIN_PATTERN.test(key)) return null;
  return getPublicProfile(db(), key);
}

export async function generateMetadata({ params }: { params: Promise<{ login: string }> }): Promise<Metadata> {
  const profile = await load((await params).login);
  if (!profile) return { title: "Profil nicht gefunden", robots: { index: false } };
  return {
    title: profile.displayName,
    description: `Waffen-Builds von ${profile.displayName} auf Build Hub.`,
    openGraph: { title: `${profile.displayName} · Build Hub`, type: "profile", ...(profile.avatarUrl ? { images: [profile.avatarUrl] } : {}) },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const [profile, viewer, { locale, t }] = await Promise.all([load(login), currentUser(), getMessages()]);
  if (!profile) notFound();
  const own = viewer?.login === profile.login;
  const [builds, drafts, ds, itemLang] = await Promise.all([
    listUserBuilds(db(), profile.id, own),
    own && viewer ? listDrafts(db(), { id: viewer.id, login: viewer.login }) : Promise.resolve([]),
    activeDataset("pvp"),
    getItemLang(),
  ]);
  const weapons = ds ? await weaponCards(ds.id, [...builds.map((b) => b.weaponExtId), ...drafts.map((d) => d.weaponExtId)], itemLang) : new Map();
  const g = gunsmithMessages[locale];
  const roleLabel = profile.role === "admin" ? t.role_admin : profile.role === "moderator" ? t.role_moderator : null;

  return (
    <div className="container" style={{ paddingTop: 48 }}>
      <section style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", paddingBottom: 32, borderBottom: "1px solid var(--line)" }}>
        <Avatar url={profile.avatarUrl} name={profile.displayName} size={96} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h1 className="head" style={{ margin: 0, fontSize: 48, lineHeight: 1 }}>
              {profile.displayName}
            </h1>
            {roleLabel && <span className="tag tag-accent">{roleLabel}</span>}
          </div>
          <span style={{ color: "var(--muted)" }}>
            {t.profile_since} {formatDate(profile.createdAt, locale)} ·{" "}
            <a href={`https://www.twitch.tv/${profile.login}`} rel="noopener noreferrer" target="_blank">
              {t.profile_twitch}
            </a>
          </span>
        </div>
      </section>

      <section aria-labelledby="builds" style={{ paddingTop: 40 }}>
        <h2 id="builds" className="head" style={{ margin: "0 0 16px", fontSize: 32 }}>
          {t.profile_builds}
        </h2>
        {builds.length === 0 ? (
          <div className="panel" style={{ padding: "40px 24px", textAlign: "center", color: "var(--muted)" }}>
            {own ? t.profile_builds_empty_own : t.profile_builds_empty}
          </div>
        ) : (
          <BuildCards
            items={builds.map((b) => ({
              href: `/b/${b.publicId}`,
              title: b.title,
              weapon: weapons.get(b.weaponExtId)?.name.short ?? "",
              img: weapons.get(b.weaponExtId)?.img ?? null,
              meta: `${g[`purpose_${b.purpose}`]} · Patch ${b.patchLabel ?? "—"} · v${b.latestVersion}`,
              badge: b.status === "hidden" ? g.b_hidden : b.visibility === "unlisted" ? g.b_unlisted : null,
            }))}
          />
        )}
      </section>

      {own && drafts.length > 0 && (
        <section aria-labelledby="drafts" style={{ paddingTop: 40 }}>
          <h2 id="drafts" className="head" style={{ margin: "0 0 16px", fontSize: 32 }}>
            {locale === "de" ? "Entwürfe" : "Drafts"} <span style={{ fontSize: 16, color: "var(--faint)" }}>{locale === "de" ? "nur für dich sichtbar" : "only visible to you"}</span>
          </h2>
          <BuildCards
            items={drafts.map((d) => ({
              href: `/gunsmith/${d.weaponExtId}?entwurf=${d.id}`,
              title: d.title || (locale === "de" ? "Ohne Titel" : "Untitled"),
              weapon: weapons.get(d.weaponExtId)?.name.short ?? "",
              img: weapons.get(d.weaponExtId)?.img ?? null,
              meta: `${d.baseBuildPublicId ? g.new_version_of : d.forkedFromLabel ? `${g.variant_of} ${d.forkedFromLabel}` : g.draft} · ${formatDate(d.updatedAt, locale)}`,
              badge: null,
            }))}
          />
        </section>
      )}
    </div>
  );
}
