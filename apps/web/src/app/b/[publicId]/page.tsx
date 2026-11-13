import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuildError, checkAgainstDataset, getBuildView, getInteraction, listComments } from "@tbh/builds";
import { BuildPage } from "@/components/builds/BuildPage";
import { gunsmithMessages } from "@/gunsmith/messages";
import { pickName } from "@/gunsmith/view";
import { getItemLang, getLocale } from "@/lib/i18n";
import { buildDeps } from "@/lib/builds-server";
import { activeDataset, getWeaponBundle } from "@/lib/gunsmith-server";
import { authConfig, currentUser, db } from "@/lib/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ publicId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function versionParam(sp: Record<string, string | string[] | undefined>): number | undefined {
  const v = typeof sp["v"] === "string" ? Number(sp["v"]) : NaN;
  return Number.isInteger(v) && v > 0 ? v : undefined;
}

async function load(publicId: string, version: number | undefined) {
  const user = await currentUser();
  try {
    return { view: await getBuildView(db(), publicId, user ? { id: user.id, role: user.role } : null, version), user };
  } catch (error) {
    if (error instanceof BuildError && error.code === "not_found") return null;
    throw error;
  }
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const r = await load((await params).publicId, versionParam(await searchParams));
  if (!r) return { title: "Build nicht gefunden", robots: { index: false } };
  const { view } = r;
  const description = `${view.version.title} – Build von ${view.owner.displayName}, Patch ${view.version.patchLabel ?? "—"}, geprüft gegen echte Slot-Daten.`;
  return {
    title: view.version.title,
    description,
    robots: view.visibility === "unlisted" || view.status !== "published" ? { index: false } : undefined,
    openGraph: { title: `${view.version.title} · Build Hub`, description, type: "article" },
  };
}

export default async function BuildRoute({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { publicId } = await params;
  const r = await load(publicId, versionParam(await searchParams));
  if (!r) notFound();
  const { view, user } = r;
  const [uiLang, itemLang, active] = await Promise.all([getLocale(), getItemLang(), activeDataset(view.mode)]);
  const [bundle, interaction, comments] = await Promise.all([
    getWeaponBundle(view.version.datasetId, view.weaponExtId),
    getInteraction(db(), user?.id ?? null, view.publicId),
    listComments(db(), view.publicId, user ? { id: user.id, role: user.role } : null),
  ]);

  // Mit den aktuellen Spieldaten prüfen, falls die Version auf einem älteren Datensatz beruht.
  let current: { valid: boolean; complete: boolean; patch: string | null; problems: string[] } | null = null;
  if (active && active.id !== view.version.datasetId) {
    const e = await checkAgainstDataset(db(), view, active.id, buildDeps);
    const problems = e.issues.filter((i) => i.severity === "error" || i.code === "missing_required").map((i) => i.itemId ?? i.parentItemId ?? "");
    current = { valid: e.valid && e.complete && e.ammoAllowed, complete: e.complete, patch: active.patch, problems: [...new Set(problems)].filter(Boolean) };
  }

  const here = `/b/${publicId}`;
  return (
    <BuildPage
      view={JSON.parse(JSON.stringify(view))}
      bundle={bundle}
      uiLang={uiLang}
      itemLang={itemLang}
      t={gunsmithMessages[uiLang]}
      viewer={user ? { id: user.id, login: user.login } : null}
      interaction={interaction}
      comments={JSON.parse(JSON.stringify(comments))}
      loginUrl={authConfig() ? `/auth/twitch/login?returnTo=${encodeURIComponent(here)}` : null}
      current={current ? { ...current, problems: current.problems.map((id) => pickName(bundle.items[id]?.names, itemLang).short) } : null}
    />
  );
}
