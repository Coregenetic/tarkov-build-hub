import "server-only";
import { cookies, headers } from "next/headers";

export type Locale = "de" | "en";
export const LOCALES: readonly Locale[] = ["de", "en"];
export const LOCALE_COOKIE = "tbh_lang";
/** Sprache der Item-Namen: auto (wie die Seite), de oder en. */
export const ITEM_LANG_COOKIE = "tbh_item_lang";
export type ItemLangSetting = "auto" | Locale;

const messages = {
  de: {
    nav_discover: "Entdecken",
    nav_gunsmith: "Gunsmith",
    nav_weapons: "Waffen",
    login: "Mit Twitch anmelden",
    login_short: "Anmelden",
    logout: "Abmelden",
    my_profile: "Mein Profil",
    login_disabled: "Anmeldung derzeit nicht verfügbar",
    login_disabled_short: "Anmeldung aus",
    hero_kicker: "Escape from Tarkov · Build-Plattform",
    hero_title: "Waffen bauen, teilen, weiterentwickeln.",
    hero_text: "Jeder Build wird gegen die echten Slot-Daten des Spiels geprüft und behält dauerhaft seinen Patch-Stand. Gunsmith und Build-Feed folgen in den nächsten Ausbaustufen.",
    hero_cta_profile: "Zu meinem Profil",
    status_title: "Spieldaten",
    status_none: "Noch kein Datensatz freigegeben.",
    status_active: "Aktiver Datensatz",
    status_items: "Items",
    status_patch: "Patch",
    status_updated: "Stand",
    profile_since: "Dabei seit",
    profile_builds: "Builds",
    profile_builds_empty: "Noch keine veröffentlichten Builds.",
    profile_builds_empty_own: "Du hast noch keine Builds veröffentlicht. Der Gunsmith kommt in einer der nächsten Ausbaustufen.",
    profile_twitch: "Auf Twitch",
    role_admin: "Admin",
    role_moderator: "Moderator",
    not_found_title: "Seite nicht gefunden",
    not_found_text: "Diese Seite gibt es nicht oder nicht mehr.",
    back_home: "Zur Startseite",
    error_title: "Etwas ist schiefgelaufen",
    error_text: "Bitte versuche es gleich noch einmal.",
    retry: "Erneut versuchen",
    auth_error_title: "Anmeldung fehlgeschlagen",
    auth_error_try_again: "Erneut anmelden",
    auth_error_denied: "Du hast die Anmeldung bei Twitch abgebrochen.",
    auth_error_invalid_state: "Die Anmeldung passt nicht zu dieser Browsersitzung. Bitte starte sie erneut.",
    auth_error_expired_state: "Die Anmeldung hat zu lange gedauert. Bitte starte sie erneut.",
    auth_error_token_exchange_failed: "Twitch hat die Anmeldung nicht bestätigt.",
    auth_error_invalid_id_token: "Die Antwort von Twitch war ungültig.",
    auth_error_profile_failed: "Dein Twitch-Profil konnte nicht geladen werden.",
    auth_error_banned: "Dieses Konto ist gesperrt.",
    auth_error_rate_limited: "Zu viele Anmeldeversuche. Bitte warte eine Minute.",
    auth_error_disabled: "Die Anmeldung ist auf diesem Server noch nicht eingerichtet.",
    auth_error_unknown: "Unbekannter Fehler bei der Anmeldung.",
    footer_fan: "Fan-Projekt, nicht mit Battlestate Games verbunden",
    footer_data: "Spieldaten und Bilder: tarkov.dev",
    language: "English",
    nav_settings: "Einstellungen",
  },
  en: {
    nav_discover: "Discover",
    nav_gunsmith: "Gunsmith",
    nav_weapons: "Weapons",
    login: "Sign in with Twitch",
    login_short: "Sign in",
    logout: "Sign out",
    my_profile: "My profile",
    login_disabled: "Sign-in currently unavailable",
    login_disabled_short: "Sign-in off",
    hero_kicker: "Escape from Tarkov · build platform",
    hero_title: "Build, share and evolve weapons.",
    hero_text: "Every build is checked against the game's real slot data and keeps its patch for good. The Gunsmith and build feed arrive in the next stages.",
    hero_cta_profile: "Go to my profile",
    status_title: "Game data",
    status_none: "No dataset released yet.",
    status_active: "Active dataset",
    status_items: "Items",
    status_patch: "Patch",
    status_updated: "As of",
    profile_since: "Member since",
    profile_builds: "Builds",
    profile_builds_empty: "No published builds yet.",
    profile_builds_empty_own: "You haven't published any builds yet. The Gunsmith arrives in one of the next stages.",
    profile_twitch: "On Twitch",
    role_admin: "Admin",
    role_moderator: "Moderator",
    not_found_title: "Page not found",
    not_found_text: "This page doesn't exist or no longer exists.",
    back_home: "Back to start",
    error_title: "Something went wrong",
    error_text: "Please try again in a moment.",
    retry: "Try again",
    auth_error_title: "Sign-in failed",
    auth_error_try_again: "Sign in again",
    auth_error_denied: "You cancelled the sign-in on Twitch.",
    auth_error_invalid_state: "This sign-in doesn't match your browser session. Please start again.",
    auth_error_expired_state: "The sign-in took too long. Please start again.",
    auth_error_token_exchange_failed: "Twitch did not confirm the sign-in.",
    auth_error_invalid_id_token: "Twitch returned an invalid response.",
    auth_error_profile_failed: "Your Twitch profile could not be loaded.",
    auth_error_banned: "This account is suspended.",
    auth_error_rate_limited: "Too many sign-in attempts. Please wait a minute.",
    auth_error_disabled: "Sign-in has not been set up on this server yet.",
    auth_error_unknown: "Unknown sign-in error.",
    footer_fan: "Fan project, not affiliated with Battlestate Games",
    footer_data: "Game data and images: tarkov.dev",
    language: "Deutsch",
    nav_settings: "Settings",
  },
} as const;

export type MessageKey = keyof (typeof messages)["de"];
export type Messages = Record<MessageKey, string>;

export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (fromCookie === "de" || fromCookie === "en") return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^\s*de\b/i.test(accept) || (/\bde\b/i.test(accept) && !/^\s*en\b/i.test(accept)) ? "de" : "en";
}

export async function getMessages(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale();
  return { locale, t: messages[locale] };
}

export async function getItemLangSetting(): Promise<ItemLangSetting> {
  const v = (await cookies()).get(ITEM_LANG_COOKIE)?.value;
  return v === "de" || v === "en" ? v : "auto";
}

/** Tatsächliche Sprache der Item-Namen. */
export async function getItemLang(): Promise<Locale> {
  const setting = await getItemLangSetting();
  return setting === "auto" ? getLocale() : setting;
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
