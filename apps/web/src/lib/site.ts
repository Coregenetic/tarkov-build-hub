import "server-only";
import { DEFAULT_SETTINGS, getSettings, type SiteSettings } from "@tbh/builds";
import { db } from "./server";

/** Einstellungen der Seite, 15 Sekunden im Prozess zwischengespeichert. */
let cached: { at: number; value: SiteSettings } | null = null;

export async function siteSettings(): Promise<SiteSettings> {
  if (cached && Date.now() - cached.at < 15_000) return cached.value;
  try {
    const value = await getSettings(db());
    cached = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.error("Einstellungen nicht lesbar:", error);
    return cached?.value ?? DEFAULT_SETTINGS;
  }
}

/** Nach einer Änderung im Admin-Bereich sofort neu lesen. */
export function invalidateSiteSettings() {
  cached = null;
}
