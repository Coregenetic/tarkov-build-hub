/**
 * Zeitzone für alle Datumsanzeigen. Fest statt Browser-Zeitzone, damit Server und Browser
 * denselben Text erzeugen (sonst Hydration-Fehler) und alle dieselbe Uhrzeit sehen.
 */
export const SITE_TZ = "Europe/Berlin";
