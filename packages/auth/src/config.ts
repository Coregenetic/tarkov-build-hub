import { z } from "zod";

export interface TwitchEndpoints {
  issuer: string;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  usersUrl: string;
}

export const TWITCH_ENDPOINTS: TwitchEndpoints = {
  issuer: "https://id.twitch.tv/oauth2",
  authorizeUrl: "https://id.twitch.tv/oauth2/authorize",
  tokenUrl: "https://id.twitch.tv/oauth2/token",
  jwksUrl: "https://id.twitch.tv/oauth2/keys",
  usersUrl: "https://api.twitch.tv/helix/users",
};

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  /** Muss exakt der in der Twitch-Application eingetragenen Redirect-URL entsprechen. */
  redirectUri: string;
  /** Mindestens 32 Zeichen, signiert das kurzlebige Login-Cookie. */
  secret: string;
  /** true, sobald die Seite über HTTPS läuft (Cookies nur verschlüsselt). */
  secureCookies: boolean;
  sessionTtlDays: number;
  endpoints: TwitchEndpoints;
  fetchImpl: typeof fetch;
}

const envSchema = z.object({
  TWITCH_CLIENT_ID: z.string().min(1, "TWITCH_CLIENT_ID fehlt"),
  TWITCH_CLIENT_SECRET: z.string().min(1, "TWITCH_CLIENT_SECRET fehlt"),
  PUBLIC_BASE_URL: z.url("PUBLIC_BASE_URL muss eine vollständige URL sein"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET muss mindestens 32 Zeichen haben"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Nur für automatisierte Tests: Twitch-Endpunkte auf einen lokalen Nachbau umleiten. */
  TWITCH_TEST_ENDPOINT_BASE: z.string().optional(),
});

/** Erlaubt die Umleitung ausschließlich auf localhost bzw. 127.0.0.1. */
function testEndpoints(base: string): TwitchEndpoints {
  const url = new URL(base);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("TWITCH_TEST_ENDPOINT_BASE darf nur auf localhost zeigen.");
  }
  const root = url.origin;
  return {
    issuer: TWITCH_ENDPOINTS.issuer,
    authorizeUrl: `${root}/oauth2/authorize`,
    tokenUrl: `${root}/oauth2/token`,
    jwksUrl: `${root}/oauth2/keys`,
    usersUrl: `${root}/helix/users`,
  };
}

/** Liest die Konfiguration aus Umgebungsvariablen und bricht mit klarer Meldung ab, wenn etwas fehlt. */
export function authConfigFromEnv(env: Record<string, string | undefined> = process.env): AuthConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Login-Konfiguration unvollständig: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const base = new URL(parsed.data.PUBLIC_BASE_URL);
  return {
    clientId: parsed.data.TWITCH_CLIENT_ID,
    clientSecret: parsed.data.TWITCH_CLIENT_SECRET,
    redirectUri: new URL("/auth/twitch/callback", base).toString(),
    secret: parsed.data.AUTH_SECRET,
    secureCookies: base.protocol === "https:",
    sessionTtlDays: parsed.data.SESSION_TTL_DAYS,
    endpoints: parsed.data.TWITCH_TEST_ENDPOINT_BASE ? testEndpoints(parsed.data.TWITCH_TEST_ENDPOINT_BASE) : TWITCH_ENDPOINTS,
    fetchImpl: fetch,
  };
}

export function sessionCookieName(config: Pick<AuthConfig, "secureCookies">): string {
  // __Host- erzwingt im Browser: nur HTTPS, nur diese Domain, Pfad "/".
  return config.secureCookies ? "__Host-tbh_session" : "tbh_session";
}

export function loginCookieName(config: Pick<AuthConfig, "secureCookies">): string {
  return config.secureCookies ? "__Host-tbh_login" : "tbh_login";
}
