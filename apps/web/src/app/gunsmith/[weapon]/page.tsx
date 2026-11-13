import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BuildError, getDraft } from "@tbh/builds";
import { Gunsmith, type AccountContext } from "@/components/gunsmith/Gunsmith";
import { gunsmithMessages } from "@/gunsmith/messages";
import { pickName } from "@/gunsmith/view";
import { getItemLang, getLocale } from "@/lib/i18n";
import { activeDataset, getWeaponBundle, WeaponNotFoundError } from "@/lib/gunsmith-server";
import { authConfig, currentUser, db } from "@/lib/server";

export const dynamic = "force-dynamic";

async function load(weapon: string) {
  const ds = await activeDataset("pvp");
  if (!ds) return null;
  try {
    return await getWeaponBundle(ds.id, weapon);
  } catch (error) {
    if (error instanceof WeaponNotFoundError) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ weapon: string }> }): Promise<Metadata> {
  const { weapon } = await params;
  const bundle = await load(weapon);
  if (!bundle) return { title: "Gunsmith" };
  const name = pickName(bundle.items[bundle.weapon.id]?.names, await getItemLang()).name;
  return { title: `${name} · Gunsmith`, robots: { index: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function GunsmithWeapon({ params, searchParams }: { params: Promise<{ weapon: string }>; searchParams: Search }) {
  const { weapon } = await params;
  const sp = await searchParams;
  const [bundle, uiLang, itemLang, user] = await Promise.all([load(weapon), getLocale(), getItemLang(), currentUser()]);
  if (!bundle) notFound();

  const here = `/gunsmith/${weapon}`;
  const account: AccountContext = {
    loggedIn: user !== null,
    loginUrl: authConfig() ? `/auth/twitch/login?returnTo=${encodeURIComponent(here)}` : "/auth/error?code=disabled",
    draftId: null,
    initial: null,
    baseBuild: null,
    forkedFromLabel: null,
  };

  const draftParam = typeof sp["entwurf"] === "string" ? Number(sp["entwurf"]) : NaN;
  if (user && Number.isInteger(draftParam) && draftParam > 0) {
    try {
      const d = await getDraft(db(), { id: user.id, login: user.login }, draftParam);
      // Entwurf gehört zu einer anderen Waffe: dorthin wechseln.
      if (d.weaponExtId !== bundle.weapon.id) redirect(`/gunsmith/${d.weaponExtId}?entwurf=${d.id}`);
      account.draftId = d.id;
      account.initial = { build: d.tree, ammo: d.ammoExtId, title: d.title, notes: d.notes, purpose: d.purpose };
      account.forkedFromLabel = d.forkedFromLabel;
      if (d.baseBuildPublicId) account.baseBuild = { publicId: d.baseBuildPublicId, title: d.title };
    } catch (error) {
      if (!(error instanceof BuildError)) throw error;
      // Fremder oder gelöschter Entwurf: einfach neu beginnen.
    }
  }

  return <Gunsmith bundle={bundle} uiLang={uiLang} itemLang={itemLang} t={gunsmithMessages[uiLang]} account={account} />;
}
