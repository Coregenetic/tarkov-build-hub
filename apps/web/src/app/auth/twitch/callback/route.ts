import { NextResponse, type NextRequest } from "next/server";
import { AuthError, createSessionForIdentity, loginCookieName, sessionCookieName, verifyCallback } from "@tbh/auth";
import { authConfig, authRateLimiter, baseUrl, clientIp, db } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = authConfig();
  if (!config) return NextResponse.redirect(new URL("/auth/error?code=disabled", baseUrl(request)), 303);

  const fail = (code: string) => {
    const response = NextResponse.redirect(new URL(`/auth/error?code=${encodeURIComponent(code)}`, baseUrl(request)), 303);
    response.cookies.delete(loginCookieName(config));
    return response;
  };

  if (!authRateLimiter.hit(`callback:${await clientIp()}`)) return fail("rate_limited");

  const params = request.nextUrl.searchParams;
  try {
    const { identity, returnTo } = await verifyCallback(
      config,
      { code: params.get("code"), state: params.get("state"), error: params.get("error") },
      request.cookies.get(loginCookieName(config))?.value,
    );
    const { token, expiresAt } = await createSessionForIdentity(db(), identity, {
      ttlDays: config.sessionTtlDays,
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.redirect(new URL(returnTo, baseUrl(request)), 303);
    response.cookies.delete(loginCookieName(config));
    response.cookies.set(sessionCookieName(config), token, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      console.warn(`Login abgelehnt (${error.code}): ${error.message}`);
      return fail(error.code);
    }
    console.error("Login-Fehler:", error);
    return fail("unknown");
  }
}
