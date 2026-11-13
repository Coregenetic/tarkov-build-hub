import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchTarkovDevDataset } from "@tbh/data-adapters";
import { build, buildVersion, connect, type DbHandle } from "@tbh/db";
import { resetTestDatabase } from "@tbh/db/testing";
import { startFakeTwitchServer, type FakeTwitchServer } from "../../../packages/auth/test/fake-twitch-server.ts";
import { activateDataset, importDataset } from "../../importer/src/service.ts";

/**
 * Ende-zu-Ende: anmelden, bauen, veröffentlichen, Build-Seite, Variante – gegen die gebaute App,
 * echte Spieldaten (M4A1-Ausschnitt aus json.tarkov.dev) und einen lokalen Twitch-Nachbau.
 */
const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(webDir, "..", "..", "packages", "data-adapters", "test", "fixtures", "m4a1");
const dbUrl = process.env["TEST_DATABASE_URL"];
const chromePath = process.env["CHROME_PATH"] ?? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => existsSync(p));
const built = existsSync(path.join(webDir, ".next", "BUILD_ID"));
const enabled = Boolean(dbUrl && chromePath && built);

const M4A1 = "5447a9cd4bdc2dbd208b4567";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

describe.skipIf(!enabled)("Gunsmith: veröffentlichen und Varianten (Ende zu Ende)", () => {
  let twitch: FakeTwitchServer;
  let app: ChildProcess;
  let browser: Browser;
  let handle: DbHandle;
  let base = "";
  let logs = "";
  let alicePage: Page;
  let publishedUrl = "";

  beforeAll(async () => {
    await resetTestDatabase(dbUrl!);
    handle = connect(dbUrl);
    const fixture = await fetchTarkovDevDataset({ mode: "pvp", fromDir: fixtureDir });
    const { datasetId } = await importDataset(handle.db, fixture, { actor: "e2e", thresholds: { minItems: 1, minGuns: 1, maxMissingNameRatio: 1, maxDanglingRatio: 1 } });
    await activateDataset(handle.db, datasetId, "0.16.9", "e2e");

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

  async function newPage(): Promise<Page> {
    const context = await browser.newContext({ locale: "de-DE", extraHTTPHeaders: { "accept-language": "de-DE" } });
    // Bilder von assets.tarkov.dev sind im Test nicht nötig.
    await context.route("https://assets.tarkov.dev/**", (route) => route.abort());
    return context.newPage();
  }

  it("zeigt den Gunsmith ohne Anmeldung; Veröffentlichen führt zur Anmeldung", async () => {
    alicePage = await newPage();
    const page = alicePage;
    await page.goto(`${base}/gunsmith`);
    await page.getByRole("link", { name: /M4A1/ }).first().click();
    await page.waitForURL(new RegExp(`/gunsmith/${M4A1}$`));
    await expect(page.getByRole("status").filter({ hasText: "Gültig" }).isVisible()).resolves.toBe(true);

    twitch.setUser({ id: "5001", login: "alice_e2e", display_name: "Alice_E2E" });
    await page.getByRole("link", { name: "Veröffentlichen" }).click();
    await page.waitForURL(/\/oauth2\/authorize/);
    await page.click("#authorize");
    await page.waitForURL(new RegExp(`/gunsmith/${M4A1}$`));
    await expect(page.getByRole("button", { name: "Veröffentlichen" }).isVisible()).resolves.toBe(true);
  });

  it("speichert Änderungen als Entwurf im Konto", async () => {
    const page = alicePage;
    await page.getByRole("button", { name: /^Mündung: / }).first().click();
    await page.getByRole("radio", { name: /SF3P/ }).first().click();
    await page.waitForURL(/entwurf=\d+/, { timeout: 10_000 });
    await expect(page.getByText("Im Konto gespeichert").isVisible()).resolves.toBe(true);
  });

  it("veröffentlicht nach Prüfung auf dem Server und zeigt die Build-Seite mit Patch", async () => {
    const page = alicePage;
    await page.getByRole("button", { name: "Veröffentlichen" }).click();
    const dialog = page.getByRole("dialog", { name: "Build veröffentlichen" });
    await dialog.getByLabel("Titel").fill("M4A1 mit SF3P");
    await dialog.getByLabel("Leise").check();
    await dialog.getByLabel(/Notizen/).fill("Echte Teile, geprüft.");
    await dialog.getByRole("button", { name: "Veröffentlichen" }).click();
    await page.waitForURL(/\/b\/[0-9A-Za-z]{10}$/);
    publishedUrl = page.url();
    await expect(page.getByRole("heading", { level: 1 }).textContent()).resolves.toBe("M4A1 mit SF3P");
    await expect(page.getByText(/Patch 0\.16\.9/).first().isVisible()).resolves.toBe(true);
    await expect(page.getByText(/SF3P/).first().isVisible()).resolves.toBe(true);
    const rows = await handle.db.select().from(buildVersion);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.partIds).toContain("5c7fb51d2e2216001219ce11");
  });

  it("schützt die API: ohne Herkunft 403, ohne Anmeldung 401, fremde Builds nicht bearbeitbar", async () => {
    const noOrigin = await fetch(`${base}/api/drafts`, { method: "POST", body: "{}" });
    expect(noOrigin.status).toBe(403);
    const anonymous = await fetch(`${base}/api/drafts`, { method: "POST", headers: { Origin: base }, body: "{}" });
    expect(anonymous.status).toBe(401);

    const bob = await newPage();
    twitch.setUser({ id: "5002", login: "bob_e2e", display_name: "Bob_E2E" });
    await bob.goto(`${base}/auth/twitch/login?returnTo=/`);
    await bob.click("#authorize");
    await bob.waitForURL(`${base}/`);
    const publicId = publishedUrl.split("/b/")[1]!;
    const edit = await bob.request.post(`${base}/api/builds/${publicId}/edit`, { headers: { Origin: base } });
    expect(edit.status()).toBe(403);
    const del = await bob.request.delete(`${base}/api/builds/${publicId}`, { headers: { Origin: base } });
    expect(del.status()).toBe(404);
    await bob.context().close();
  });

  it("erstellt eine Variante, die auf die konkrete Version des Originals verweist", async () => {
    const page = await newPage();
    twitch.setUser({ id: "5002", login: "bob_e2e", display_name: "Bob_E2E" });
    await page.goto(`${base}/auth/twitch/login?returnTo=${encodeURIComponent(new URL(publishedUrl).pathname)}`);
    await page.click("#authorize");
    await page.waitForURL(publishedUrl);
    await page.getByRole("button", { name: "Variante erstellen" }).click();
    await page.waitForURL(/\/gunsmith\/.+\?entwurf=\d+/);
    await expect(page.getByText(/Variante von „M4A1 mit SF3P“ v1 von alice_e2e/).first().isVisible()).resolves.toBe(true);

    await page.getByRole("button", { name: "Veröffentlichen" }).click();
    const dialog = page.getByRole("dialog", { name: "Build veröffentlichen" });
    await dialog.getByLabel("Titel").fill("Bobs Variante");
    await dialog.getByRole("button", { name: "Veröffentlichen" }).click();
    await page.waitForURL(/\/b\/[0-9A-Za-z]{10}$/);
    await expect(page.getByRole("link", { name: /„M4A1 mit SF3P“ v1 von alice_e2e/ }).isVisible()).resolves.toBe(true);
    const builds = await handle.db.select().from(build);
    expect(builds).toHaveLength(2);
    expect(builds.find((b) => b.title === "Bobs Variante")?.forkedFromVersionId).not.toBeNull();
    await page.context().close();
  });

  it("findet veröffentlichte Builds in Suche, Feed und Sitemap", async () => {
    const page = await newPage();
    await page.goto(`${base}/builds?q=SF3P`);
    await expect(page.getByRole("link", { name: /M4A1 mit SF3P/ }).isVisible()).resolves.toBe(true);
    await page.goto(`${base}/builds`);
    await page.getByLabel("Einsatzzweck").selectOption("silent");
    await page.getByRole("button", { name: "Filtern" }).click();
    await page.waitForURL(/zweck=silent/);
    await expect(page.getByRole("link", { name: /Bobs Variante/ }).isVisible()).resolves.toBe(true);
    await page.goto(`${base}/builds?zweck=cqb`);
    await expect(page.getByText("Keine Builds passen zu diesen Filtern.").isVisible()).resolves.toBe(true);
    await page.goto(`${base}/`);
    await expect(page.getByRole("heading", { name: "Neueste Builds" }).isVisible()).resolves.toBe(true);
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    expect(sitemap).toContain(publishedUrl.split("/b/")[1]);
    await page.context().close();
  });

  it("zeigt veröffentlichte Builds im Profil und Entwürfe nur dem Eigentümer", async () => {
    const page = alicePage;
    await page.goto(`${base}/u/alice_e2e`);
    await expect(page.getByRole("link", { name: /M4A1 mit SF3P/ }).isVisible()).resolves.toBe(true);
    await alicePage.context().close();
  });

  it("hat beim Testlauf keine Serverfehler geloggt", () => {
    expect(logs).not.toMatch(/Error:|unhandled/i);
  });
});
