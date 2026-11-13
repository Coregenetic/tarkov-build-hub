import { NextResponse, type NextRequest } from "next/server";

/**
 * Inhaltsrichtlinie mit Nonce je Anfrage: Nur Skripte mit diesem Nonce (die von Next.js selbst)
 * und was sie nachladen ('strict-dynamic') laufen. Eingeschleuste Inline-Skripte nicht.
 * Inline-Styles bleiben erlaubt (React setzt style-Attribute), ebenso Bilder von Twitch und tarkov.dev.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    "img-src 'self' data: https://static-cdn.jtvnw.net https://assets.tarkov.dev",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "form-action 'self' https://id.twitch.tv",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Gibt den aktuellen Pfad an Server-Komponenten weiter (für Rücksprung nach dem Login
 * und die Sprachumschaltung) und setzt die Inhaltsrichtlinie. Keine Prüfung von Rechten hier –
 * das passiert serverseitig je Route.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tbh-path", request.nextUrl.pathname + request.nextUrl.search);
  // Next.js liest den Nonce aus dieser Kopfzeile der Anfrage und setzt ihn an seine Skripte.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
