import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo } from "@tbh/auth";
import { getLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { baseUrl } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Schaltet zwischen Deutsch und Englisch um und kehrt auf dieselbe Seite zurück. */
export async function GET(request: NextRequest) {
  const current = await getLocale();
  const next = current === "de" ? "en" : "de";
  const response = NextResponse.redirect(new URL(safeReturnTo(request.nextUrl.searchParams.get("back")), baseUrl(request)), 303);
  response.cookies.set(LOCALE_COOKIE, next, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
