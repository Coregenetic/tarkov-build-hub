import "server-only";
import { DEFAULT_SETTINGS, getSettings, type SiteSettings } from "@tbh/builds";
import { db } from "./server";

/**
 * Einstellungen der Seite, 15 Sekunden im Prozess zwischengespeichert. Der Zwischenspeicher liegt auf
 * globalThis, weil Next.js Routen und Seiten getrennt bündelt – sonst würde das Leeren nach einer Änderung
 * nur die Kopie der API-Route treffen.
 */
const store = globalThis as unknown as { tbhSiteSettings?: { at: number; value: SiteSettings } | null };

export async function siteSettings(): Promise<SiteSettings> {
  // Beim Bauen (statische Fehlerseiten) gibt es keine Datenbank.
  if (process.env["NEXT_PHASE"] === "phase-production-build") return DEFAULT_SETTINGS;
  const cached = store.tbhSiteSettings;
  if (cached && Date.now() - cached.at < 15_000) return cached.value;
  try {
    const value = await getSettings(db());
    store.tbhSiteSettings = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.error("Einstellungen nicht lesbar:", error);
    return store.tbhSiteSettings?.value ?? DEFAULT_SETTINGS;
  }
}

/** Nach einer Änderung im Admin-Bereich sofort neu lesen. */
export function invalidateSiteSettings() {
  store.tbhSiteSettings = null;
}
