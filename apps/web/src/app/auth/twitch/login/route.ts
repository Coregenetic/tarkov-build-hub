import { NextResponse, type NextRequest } from "next/server";
import { loginCookieName, startLogin } from "@tbh/auth";
import { authConfig, authRateLimiter, baseUrl, clientIp } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = authConfig();
  if (!config) return NextResponse.redirect(new URL("/auth/error?code=disabled", baseUrl(request)), 303);
  if (!authRateLimiter.hit(`login:${await clientIp()}`)) {
    return NextResponse.redirect(new URL("/auth/error?code=rate_limited", baseUrl(request)), 303);
  }

  const { redirectUrl, cookieValue, cookieMaxAgeSeconds } = startLogin(config, request.nextUrl.searchParams.get("returnTo"), Date.now(), {
    forceVerify: request.nextUrl.searchParams.get("reauth") === "1",
  });
  const response = NextResponse.redirect(redirectUrl, 303);
  response.cookies.set(loginCookieName(config), cookieValue, {
    httpOnly: true,
    secure: config.secureCookies,
    // Lax reicht: Twitch leitet per GET-Navigation zurück, das Cookie wird dabei mitgeschickt.
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAgeSeconds,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
