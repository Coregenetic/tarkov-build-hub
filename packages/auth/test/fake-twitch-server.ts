import { createServer, type Server } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

/**
 * Lokaler Nachbau der Twitch-OIDC-Endpunkte für Browser-Tests.
 * Signiert echte RS256-ID-Tokens mit dem offiziellen Twitch-Issuer, damit die App
 * ihre normale Prüfung durchläuft. Läuft nur auf 127.0.0.1.
 */
export interface FakeTwitchServer {
  url: string;
  close: () => Promise<void>;
  setUser: (user: { id: string; login: string; display_name: string; profile_image_url?: string }) => void;
}

export async function startFakeTwitchServer(options: { port?: number; clientId: string; clientSecret: string }): Promise<FakeTwitchServer> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "fake", alg: "RS256", use: "sig" };
  const codes = new Map<string, { nonce: string; redirectUri: string }>();
  let user = { id: "424242", login: "test_schuetze", display_name: "Test_Schuetze", profile_image_url: undefined as string | undefined };

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown, type = "application/json") => {
      res.writeHead(status, { "content-type": type });
      res.end(type === "application/json" ? JSON.stringify(body) : String(body));
    };

    if (url.pathname === "/oauth2/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const state = url.searchParams.get("state") ?? "";
      if (url.searchParams.get("client_id") !== options.clientId || url.searchParams.get("scope") !== "openid") return send(400, "falsche Anfrage", "text/plain");
      const code = `code-${codes.size + 1}`;
      codes.set(code, { nonce: url.searchParams.get("nonce") ?? "", redirectUri });
      const back = new URL(redirectUri);
      back.searchParams.set("code", code);
      back.searchParams.set("state", state);
      const deny = new URL(redirectUri);
      deny.searchParams.set("error", "access_denied");
      deny.searchParams.set("state", state);
      return send(
        200,
        `<!doctype html><title>Fake Twitch</title><h1>Fake Twitch – Zugriff erlauben?</h1>
         <a id="authorize" href="${back.toString()}">Autorisieren</a> <a id="deny" href="${deny.toString()}">Abbrechen</a>`,
        "text/html",
      );
    }

    if (url.pathname === "/oauth2/token" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = new URLSearchParams(raw);
      const entry = codes.get(body.get("code") ?? "");
      if (!entry || body.get("client_secret") !== options.clientSecret || body.get("redirect_uri") !== entry.redirectUri) return send(400, { error: "invalid_grant" });
      codes.delete(body.get("code") ?? "");
      const now = Math.floor(Date.now() / 1000);
      const idToken = await new SignJWT({ nonce: entry.nonce, preferred_username: user.display_name })
        .setProtectedHeader({ alg: "RS256", kid: "fake" })
        .setIssuer("https://id.twitch.tv/oauth2")
        .setAudience(options.clientId)
        .setSubject(user.id)
        .setIssuedAt(now)
        .setExpirationTime(now + 900)
        .sign(privateKey);
      return send(200, { access_token: "fake-access", id_token: idToken, token_type: "bearer" });
    }

    if (url.pathname === "/oauth2/keys") return send(200, { keys: [jwk] });

    if (url.pathname === "/helix/users") {
      if (req.headers["authorization"] !== "Bearer fake-access" || req.headers["client-id"] !== options.clientId) return send(401, { error: "unauthorized" });
      return send(200, { data: [user] });
    }

    send(404, "nicht gefunden", "text/plain");
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    setUser: (u) => {
      user = { ...u, profile_image_url: u.profile_image_url };
    },
  };
}
