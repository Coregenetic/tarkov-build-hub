#!/usr/bin/env node
/**
 * Baut ein Release-Paket für den Server: release/tbh-<version>.tar.gz
 *
 *   web/         Next.js-Standalone-Server (node web/apps/web/server.js)
 *   tools/       migrate.mjs und importer.mjs (gebündelt, ohne tsx/pnpm lauffähig)
 *   migrations/  SQL-Migrationen
 *   deploy/      systemd-Einheiten, Caddyfile, Installations- und Update-Skripte
 *   VERSION      Git-Stand und Bauzeit
 *
 * Voraussetzung: `pnpm --filter @tbh/web build` ist gelaufen (oder --build angeben).
 */
/* global process, console */
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps", "web");
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const git = (...args) => execFileSync("git", args, { cwd: root }).toString().trim();

if (process.argv.includes("--build")) run("pnpm", ["--filter", "@tbh/web", "build"]);
if (!existsSync(path.join(web, ".next", "standalone", "apps", "web", "server.js"))) {
  console.error("Kein Standalone-Build gefunden. Erst `pnpm --filter @tbh/web build` ausführen oder --build angeben.");
  process.exit(1);
}
const dirty = git("status", "--porcelain") !== "";
const version = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${git("rev-parse", "--short=8", "HEAD")}${dirty ? "-dirty" : ""}`;
const out = path.join(root, "release", `tbh-${version}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1) Web: Standalone + statische Dateien (gehören laut Next.js nicht automatisch dazu).
cpSync(path.join(web, ".next", "standalone"), path.join(out, "web"), { recursive: true, verbatimSymlinks: true });
cpSync(path.join(web, ".next", "static"), path.join(out, "web", "apps", "web", ".next", "static"), { recursive: true });
if (existsSync(path.join(web, "public"))) cpSync(path.join(web, "public"), path.join(out, "web", "apps", "web", "public"), { recursive: true });
// Keine Umgebungsdateien aus dem Entwicklungsrechner mitnehmen.
for (const f of [".env", ".env.local", ".env.production"]) rmSync(path.join(out, "web", "apps", "web", f), { force: true });

// 2) Werkzeuge bündeln. Migrationen liegen neben tools/ (MIGRATIONS_DIR = tools/../migrations).
const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: "linked",
  logLevel: "warning",
  // Einige Abhängigkeiten sind CommonJS und rufen require() auf.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
};
await build({ ...common, entryPoints: [path.join(root, "packages", "db", "src", "migrate-cli.ts")], outfile: path.join(out, "tools", "migrate.mjs") });
await build({ ...common, entryPoints: [path.join(root, "apps", "importer", "src", "cli.ts")], outfile: path.join(out, "tools", "importer.mjs") });
cpSync(path.join(root, "packages", "db", "migrations"), path.join(out, "migrations"), { recursive: true });

// 3) Betriebsdateien.
cpSync(path.join(root, "deploy"), path.join(out, "deploy"), { recursive: true });
// Skripte immer ausführbar machen – unabhängig davon, wie sie im Arbeitsverzeichnis stehen.
for (const f of readdirSync(path.join(out, "deploy"))) {
  if (f.endsWith(".sh") || f === "tbh-admin") chmodSync(path.join(out, "deploy", f), 0o755);
}
writeFileSync(path.join(out, "VERSION"), `${version}\ncommit ${git("rev-parse", "HEAD")}\ngebaut ${new Date().toISOString()}\n`);

// 4) Packen.
run("tar", ["-czf", `tbh-${version}.tar.gz`, `tbh-${version}`], path.join(root, "release"));
console.log(`\nRelease: release/tbh-${version}.tar.gz${dirty ? "  (Achtung: nicht eingecheckte Änderungen enthalten)" : ""}`);
