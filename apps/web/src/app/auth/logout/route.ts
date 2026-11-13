import { NextResponse, type NextRequest } from "next/server";
import { deleteSession, sessionCookieName } from "@tbh/auth";
import { authConfig, baseUrl, db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Abmelden nur per POST aus einem Formular dieser Seite (Origin-Prüfung gegen fremde Seiten). */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(baseUrl(request)).origin) {
    return new NextResponse("Ungültige Herkunft", { status: 403 });
  }
  const config = authConfig();
  const response = NextResponse.redirect(new URL("/", baseUrl(request)), 303);
  if (config) {
    const name = sessionCookieName(config);
    await deleteSession(db(), request.cookies.get(name)?.value);
    response.cookies.set(name, "", { httpOnly: true, secure: config.secureCookies, sameSite: "lax", path: "/", maxAge: 0 });
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
