import { NextResponse, type NextRequest } from "next/server";

/**
 * Gibt den aktuellen Pfad an Server-Komponenten weiter (für Rücksprung nach dem Login
 * und die Sprachumschaltung). Keine Prüfung von Rechten hier – das passiert serverseitig je Route.
 */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tbh-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|api/health).*)"],
};
