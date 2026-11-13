import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUser, connect, userSession, type DbHandle } from "@tbh/db";
import { resetTestDatabase } from "@tbh/db/testing";
import { startFakeTwitchServer, type FakeTwitchServer } from "../../../packages/auth/test/fake-twitch-server.ts";

/**
 * Browser-Test des kompletten Logins gegen die gebaute App (next start) und einen lokalen Twitch-Nachbau.
 * Voraussetzungen: TEST_DATABASE_URL, gebaute App (pnpm --filter @tbh/web build), Chrome/Chromium.
 */
const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbUrl = process.env["TEST_DATABASE_URL"];
const chromePath = process.env["CHROME_PATH"] ?? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => existsSync(p));
const built = existsSync(path.join(webDir, ".next", "BUILD_ID"));
const enabled = Boolean(dbUrl && chromePath && built);

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

describe.skipIf(!enabled)("Login im Browser (Ende zu Ende)", () => {
  let twitch: FakeTwitchServer;
  let app: ChildProcess;
  let browser: Browser;
  let handle: DbHandle;
  let base = "";
  let logs = "";

  beforeAll(async () => {
    await resetTestDatabase(dbUrl!);
    handle = connect(dbUrl);
    twitch = await startFakeTwitchServer({ clientId: "e2e-client", clientSecret: "e2e-secret" });
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    app = spawn(path.join(webDir, "node_modules", ".bin", "next"), ["start", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: webDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: dbUrl,
        PUBLIC_BASE_URL: base,
        TWITCH_CLIENT_ID: "e2e-client",
        TWITCH_CLIENT_SECRET: "e2e-secret",
        AUTH_SECRET: "e2e-".repeat(10),
        TWITCH_TEST_ENDPOINT_BASE: twitch.url,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    app.stdout?.on("data", (d) => (logs += d));
    app.stderr?.on("data", (d) => (logs += d));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) break;
      } catch {
        /* startet noch */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    app?.kill("SIGTERM");
    await twitch?.close();
    await handle?.close();
  });

  async function newPage(lang = "de-DE"): Promise<Page> {
    const context = await browser.newContext({ locale: lang, extraHTTPHeaders: { "accept-language": lang } });
    return context.newPage();
  }

  async function login(page: Page) {
    await page.goto(base + "/");
    await page.getByRole("link", { name: "Mit Twitch anmelden" }).first().click();
    await page.waitForURL(/\/oauth2\/authorize/);
    await page.click("#authorize");
    await page.waitForLoadState("networkidle");
  }

  it("liefert Sicherheits-Header und eine erreichbare Startseite", async () => {
    const res = await fetch(base + "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("meldet über Twitch an, zeigt das Profil und meldet wieder ab", async () => {
    const page = await newPage();
    await login(page);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("link", { name: "Test_Schuetze" }).isVisible()).resolves.toBe(true);

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === "tbh_session");
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
    expect(cookies.find((c) => c.name === "tbh_login")).toBeUndefined();

    await page.goto(base + "/u/test_schuetze");
    await expect(page.getByRole("heading", { level: 1 }).textContent()).resolves.toBe("Test_Schuetze");
    await expect(page.getByText("Du hast noch keine Builds veröffentlicht").isVisible()).resolves.toBe(true);

    await page.getByRole("button", { name: "Abmelden" }).click();
    await page.waitForURL(base + "/");
    await expect(page.getByRole("link", { name: "Mit Twitch anmelden" }).first().isVisible()).resolves.toBe(true);
    expect(await handle.db.select().from(userSession)).toHaveLength(0);
    await page.context().close();
  });

  it("kehrt nach dem Login auf die vorherige Seite zurück", async () => {
    const page = await newPage();
    await page.goto(base + "/me");
    await page.waitForURL(/\/oauth2\/authorize/);
    await page.click("#authorize");
    await page.waitForURL(/\/u\/test_schuetze$/);
    await page.context().close();
  });

  it("zeigt bei Abbruch auf Twitch eine verständliche Meldung", async () => {
    const page = await newPage();
    await page.goto(base + "/auth/twitch/login");
    await page.click("#deny");
    await page.waitForURL(/\/auth\/error\?code=denied/);
    await expect(page.locator("main [role=alert]").textContent()).resolves.toContain("abgebrochen");
    await page.context().close();
  });

  it("weist einen manipulierten Rücksprung ab", async () => {
    const page = await newPage();
    await page.goto(base + "/auth/twitch/login");
    await page.goto(`${base}/auth/twitch/callback?code=code-x&state=gefaelscht`);
    expect(page.url()).toContain("/auth/error?code=invalid_state");
    expect(await handle.db.select().from(userSession).where(eq(userSession.userId, -1))).toHaveLength(0);
    await page.context().close();
  });

  it("lässt gesperrte Nutzer nicht hinein", async () => {
    await handle.db.update(appUser).set({ bannedAt: new Date() }).where(eq(appUser.twitchId, "424242"));
    const page = await newPage();
    await login(page);
    expect(page.url()).toContain("/auth/error?code=banned");
    await handle.db.update(appUser).set({ bannedAt: null }).where(eq(appUser.twitchId, "424242"));
    await page.context().close();
  });

  it("wechselt die Sprache und zeigt eine 404-Seite für unbekannte Profile", async () => {
    const page = await newPage();
    await page.goto(base + "/u/gibt_es_nicht");
    await expect(page.getByRole("heading", { level: 1 }).textContent()).resolves.toBe("Seite nicht gefunden");
    await page.getByRole("link", { name: "English" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1 }).textContent()).resolves.toBe("Page not found");
    expect(new URL(page.url()).pathname).toBe("/u/gibt_es_nicht");
    await page.context().close();
  });

  it("hat beim Testlauf keine Serverfehler geloggt", () => {
    expect(logs).not.toMatch(/Error:|unhandled/i);
  });
});
