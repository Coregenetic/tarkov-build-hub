import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { TWITCH_ENDPOINTS, type AuthConfig } from "../src/index.ts";

/**
 * Nachgebautes Twitch für Tests: echte RSA-Schlüssel, echt signierte ID-Tokens,
 * Token- und Nutzer-Endpunkt. Jede Antwort lässt sich gezielt manipulieren.
 */
export interface FakeTwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url?: string;
}

export interface FakeTwitch {
  config: AuthConfig;
  jwks: JWTVerifyGetKey;
  /** Merkt sich die Nonce aus dem Login-Start, wie es Twitch täte. */
  authorize(redirectUrl: string): { code: string; state: string };
  user: FakeTwitchUser;
  overrides: {
    tokenStatus?: number;
    idTokenClaims?: Record<string, unknown>;
    signWithOtherKey?: boolean;
    helixUser?: FakeTwitchUser | null;
    expiresInSeconds?: number;
  };
  calls: string[];
}

export async function createFakeTwitch(now = () => Date.now()): Promise<FakeTwitch> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const codes = new Map<string, string>();

  const fake: FakeTwitch = {
    jwks,
    user: { id: "123456789", login: "gunsmith_tester", display_name: "Gunsmith_Tester", profile_image_url: "https://static-cdn.jtvnw.net/test.png" },
    overrides: {},
    calls: [],
    authorize(redirectUrl) {
      const url = new URL(redirectUrl);
      const code = `code-${codes.size + 1}`;
      codes.set(code, url.searchParams.get("nonce") ?? "");
      return { code, state: url.searchParams.get("state") ?? "" };
    },
    config: {
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000/auth/twitch/callback",
      secret: "x".repeat(40),
      secureCookies: false,
      sessionTtlDays: 30,
      endpoints: TWITCH_ENDPOINTS,
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        fake.calls.push(url);
        if (url === TWITCH_ENDPOINTS.tokenUrl) {
          if (fake.overrides.tokenStatus) return new Response("{}", { status: fake.overrides.tokenStatus });
          const body = new URLSearchParams(String(init?.body));
          const nonce = codes.get(body.get("code") ?? "");
          if (nonce === undefined || body.get("client_secret") !== "test-client-secret") return new Response("{}", { status: 400 });
          const iat = Math.floor(now() / 1000);
          const { aud, iss, ...extra } = fake.overrides.idTokenClaims ?? {};
          const idToken = await new SignJWT({ nonce, preferred_username: fake.user.display_name, ...extra })
            .setProtectedHeader({ alg: "RS256", kid: "test-key" })
            .setIssuer(typeof iss === "string" ? iss : TWITCH_ENDPOINTS.issuer)
            .setAudience(typeof aud === "string" ? aud : "test-client-id")
            .setSubject(fake.user.id)
            .setIssuedAt(iat)
            .setExpirationTime(iat + (fake.overrides.expiresInSeconds ?? 900))
            .sign(fake.overrides.signWithOtherKey ? other.privateKey : privateKey);
          return Response.json({ access_token: "access-token", id_token: idToken, token_type: "bearer" });
        }
        if (url.startsWith(TWITCH_ENDPOINTS.usersUrl)) {
          const helix = fake.overrides.helixUser === undefined ? fake.user : fake.overrides.helixUser;
          return Response.json({ data: helix ? [helix] : [] });
        }
        return new Response("not found", { status: 404 });
      }) as typeof fetch,
    },
  };
  return fake;
}
