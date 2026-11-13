import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import type { AuthConfig } from "./config.ts";
import { randomToken, safeEqual, sign, verifySigned } from "./crypto.ts";
import { safeReturnTo } from "./return-to.ts";

export type AuthErrorCode =
  | "denied"
  | "invalid_state"
  | "expired_state"
  | "token_exchange_failed"
  | "invalid_id_token"
  | "profile_failed"
  | "banned"
  | "rate_limited";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

interface LoginState {
  state: string;
  nonce: string;
  returnTo: string;
  iat: number;
}

export interface LoginStart {
  redirectUrl: string;
  /** Kurzlebiges, signiertes Cookie (httpOnly) für State und Nonce. */
  cookieValue: string;
  cookieMaxAgeSeconds: number;
}

/** Schritt 1: Weiterleitung zu Twitch vorbereiten. Nur Scope "openid" – keine weiteren Rechte am Konto. */
export function startLogin(config: AuthConfig, returnTo: string | null | undefined, now = Date.now()): LoginStart {
  const payload: LoginState = { state: randomToken(24), nonce: randomToken(24), returnTo: safeReturnTo(returnTo), iat: now };
  const url = new URL(config.endpoints.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", payload.state);
  url.searchParams.set("nonce", payload.nonce);
  return {
    redirectUrl: url.toString(),
    cookieValue: sign(payload, config.secret),
    cookieMaxAgeSeconds: LOGIN_STATE_TTL_MS / 1000,
  };
}

export interface TwitchIdentity {
  twitchId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
}

const tokenResponse = z.object({ access_token: z.string().min(1), id_token: z.string().min(1) });
const helixUsers = z.object({
  data: z.array(z.object({ id: z.string(), login: z.string(), display_name: z.string(), profile_image_url: z.string().optional() })),
});

const jwksCache = new Map<string, JWTVerifyGetKey>();
function remoteJwks(url: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export interface CallbackParams {
  code: string | null;
  state: string | null;
  error: string | null;
}

/**
 * Schritt 2: Rückkehr von Twitch prüfen und die Identität bestätigen.
 * Prüft State (gegen Login-CSRF), tauscht den Code, verifiziert Signatur, Aussteller,
 * Empfänger, Ablauf und Nonce des ID-Tokens und gleicht die Twitch-API-Antwort mit dem Token ab.
 */
export async function verifyCallback(
  config: AuthConfig,
  params: CallbackParams,
  cookieValue: string | undefined,
  options: { now?: number; jwks?: JWTVerifyGetKey } = {},
): Promise<{ identity: TwitchIdentity; returnTo: string }> {
  const now = options.now ?? Date.now();
  if (params.error) throw new AuthError("denied", "Anmeldung bei Twitch abgebrochen.");

  const saved = verifySigned<LoginState>(cookieValue, config.secret);
  if (!saved || !params.state || !params.code || !safeEqual(saved.state, params.state)) {
    throw new AuthError("invalid_state", "Die Anmeldung passt nicht zu dieser Sitzung. Bitte erneut versuchen.");
  }
  if (now - saved.iat > LOGIN_STATE_TTL_MS || saved.iat > now + 60_000) {
    throw new AuthError("expired_state", "Die Anmeldung hat zu lange gedauert. Bitte erneut versuchen.");
  }

  let tokens: z.infer<typeof tokenResponse>;
  try {
    const response = await config.fetchImpl(config.endpoints.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: params.code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    tokens = tokenResponse.parse(await response.json());
  } catch (error) {
    throw new AuthError("token_exchange_failed", `Twitch hat die Anmeldung nicht bestätigt (${String(error)}).`);
  }

  let sub: string;
  try {
    const { payload } = await jwtVerify(tokens.id_token, options.jwks ?? remoteJwks(config.endpoints.jwksUrl), {
      issuer: config.endpoints.issuer,
      audience: config.clientId,
      algorithms: ["RS256"],
      currentDate: new Date(now),
    });
    if (typeof payload["nonce"] !== "string" || !safeEqual(payload["nonce"], saved.nonce)) throw new Error("Nonce stimmt nicht");
    if (typeof payload.sub !== "string" || !/^\d{1,20}$/.test(payload.sub)) throw new Error("Ungültige Nutzer-ID");
    sub = payload.sub;
  } catch (error) {
    throw new AuthError("invalid_id_token", `Das Anmelde-Token von Twitch ist ungültig (${error instanceof Error ? error.message : String(error)}).`);
  }

  let identity: TwitchIdentity;
  try {
    const response = await config.fetchImpl(`${config.endpoints.usersUrl}?id=${encodeURIComponent(sub)}`, {
      headers: { authorization: `Bearer ${tokens.access_token}`, "client-id": config.clientId },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const user = helixUsers.parse(await response.json()).data[0];
    if (!user || user.id !== sub) throw new Error("Profil passt nicht zum Token");
    identity = {
      twitchId: sub,
      login: user.login.toLowerCase(),
      displayName: user.display_name.slice(0, 64),
      avatarUrl: user.profile_image_url && /^https:\/\//.test(user.profile_image_url) ? user.profile_image_url : null,
    };
  } catch (error) {
    throw new AuthError("profile_failed", `Twitch-Profil konnte nicht geladen werden (${error instanceof Error ? error.message : String(error)}).`);
  }

  return { identity, returnTo: safeReturnTo(saved.returnTo) };
}
