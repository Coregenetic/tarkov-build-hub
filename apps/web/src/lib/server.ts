import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { authConfigFromEnv, createRateLimiter, getSessionUser, sessionCookieName, type AuthConfig, type SessionUser } from "@tbh/auth";
import { recordActivity } from "@tbh/builds";
import { connect, type DbHandle } from "@tbh/db";

/** Eine Datenbankverbindung je Prozess (auch über Hot-Reloads im Entwickeln hinweg). */
const globalForDb = globalThis as unknown as { tbhDb?: DbHandle };
export function db() {
  globalForDb.tbhDb ??= connect();
  return globalForDb.tbhDb.db;
}

let cachedConfig: AuthConfig | null | undefined;
let configError: string | null = null;

/** Login-Konfiguration oder null, wenn sie fehlt (dann ist der Login deaktiviert, die Seite läuft trotzdem). */
export function authConfig(): AuthConfig | null {
  if (cachedConfig === undefined) {
    try {
      cachedConfig = authConfigFromEnv();
    } catch (error) {
      cachedConfig = null;
      configError = error instanceof Error ? error.message : String(error);
      console.error(configError);
    }
  }
  return cachedConfig;
}

export function authConfigError(): string | null {
  authConfig();
  return configError;
}

/** Aktive Nutzer je Tag zählen – höchstens einmal je Nutzer, Tag und Prozess in die Datenbank. */
const seenToday = new Set<string>();
function noteActivity(userId: number) {
  const key = `${new Date().toISOString().slice(0, 10)}:${userId}`;
  if (seenToday.has(key)) return;
  if (seenToday.size > 50_000) seenToday.clear();
  seenToday.add(key);
  recordActivity(db(), userId).catch(() => seenToday.delete(key));
}

/** Aktueller Nutzer, einmal pro Anfrage ermittelt. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const config = authConfig();
  if (!config) return null;
  const token = (await cookies()).get(sessionCookieName(config))?.value;
  const user = await getSessionUser(db(), token, { ttlDays: config.sessionTtlDays });
  if (user) noteActivity(user.id);
  return user;
});

export const isStaff = (user: SessionUser | null) => user?.role === "moderator" || user?.role === "admin";

/** Client-IP hinter Caddy. Der Dienst ist nur über 127.0.0.1 erreichbar, also kommt der Header vom eigenen Proxy. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export const authRateLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

/**
 * Basis für Weiterleitungen. Hinter Caddy sieht die App intern 127.0.0.1:3002 –
 * deshalb zählt PUBLIC_BASE_URL, sonst (lokal) die Anfrage-URL.
 */
export function baseUrl(request: { url: string }): string {
  return process.env["PUBLIC_BASE_URL"] ?? request.url;
}
