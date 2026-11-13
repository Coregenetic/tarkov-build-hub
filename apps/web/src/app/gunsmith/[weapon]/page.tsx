import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gunsmith } from "@/components/gunsmith/Gunsmith";
import { gunsmithMessages } from "@/gunsmith/messages";
import { pickName } from "@/gunsmith/view";
import { getItemLang, getLocale } from "@/lib/i18n";
import { activeDataset, getWeaponBundle, WeaponNotFoundError } from "@/lib/gunsmith-server";

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

export default async function GunsmithWeapon({ params }: { params: Promise<{ weapon: string }> }) {
  const { weapon } = await params;
  const [bundle, uiLang, itemLang] = await Promise.all([load(weapon), getLocale(), getItemLang()]);
  if (!bundle) notFound();
  return <Gunsmith bundle={bundle} uiLang={uiLang} itemLang={itemLang} t={gunsmithMessages[uiLang]} />;
}
