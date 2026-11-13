import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo } from "@tbh/auth";
import { ITEM_LANG_COOKIE, LOCALE_COOKIE } from "@/lib/i18n";
import { baseUrl } from "@/lib/server";

export const dynamic = "force-dynamic";

const YEAR = 60 * 60 * 24 * 365;

/** Speichert Seitensprache und Sprache der Item-Namen (Cookies, auch ohne Anmeldung). */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(baseUrl(request)).origin) {
    return new NextResponse("Ungültige Herkunft", { status: 403 });
  }
  const form = await request.formData();
  const ui = form.get("ui");
  const items = form.get("items");
  const back = safeReturnTo(typeof form.get("back") === "string" ? (form.get("back") as string) : null);
  const target = new URL("/einstellungen", baseUrl(request));
  target.searchParams.set("back", back);
  target.searchParams.set("saved", "1");
  const response = NextResponse.redirect(target, 303);
  if (ui === "de" || ui === "en") response.cookies.set(LOCALE_COOKIE, ui, { path: "/", sameSite: "lax", maxAge: YEAR });
  if (items === "auto" || items === "de" || items === "en") response.cookies.set(ITEM_LANG_COOKIE, items, { path: "/", sameSite: "lax", maxAge: YEAR });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
