import "server-only";
import { notFound } from "next/navigation";
import { and, count, eq, inArray } from "drizzle-orm";
import type { Staff } from "@tbh/builds";
import { build, report } from "@tbh/db";
import { currentUser, db, isStaff } from "./server";

export interface StaffContext {
  staff: Staff;
  login: string;
  isAdmin: boolean;
}

/**
 * Zugang zum Admin-Bereich. Wer kein Team-Mitglied ist, bekommt „nicht gefunden“ –
 * der Bereich verrät seine Existenz nicht. Jede Aktion prüft die Rolle zusätzlich in der Datenbank.
 */
export async function requireStaffPage(): Promise<StaffContext> {
  const user = await currentUser();
  if (!user || !isStaff(user)) notFound();
  return { staff: { id: user.id, login: user.login, sessionStartedAt: user.sessionStartedAt }, login: user.login, isAdmin: user.role === "admin" };
}

export async function requireAdminPage(): Promise<StaffContext> {
  const ctx = await requireStaffPage();
  if (!ctx.isAdmin) notFound();
  return ctx;
}

/** Anzahl der gemeldeten Ziele (nicht der einzelnen Meldungen). */
export async function openReportTargets(): Promise<number> {
  const rows = await db().selectDistinct({ t: report.targetType, id: report.targetId }).from(report).where(eq(report.status, "open"));
  return rows.length;
}

export async function buildCounts(): Promise<{ published: number; hidden: number }> {
  const [[pub], [hid]] = await Promise.all([
    db().select({ n: count() }).from(build).where(eq(build.status, "published")),
    db()
      .select({ n: count() })
      .from(build)
      .where(and(inArray(build.status, ["hidden"]))),
  ]);
  return { published: pub?.n ?? 0, hidden: hid?.n ?? 0 };
}

const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const dateOnly = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

export const fmtDateTime = (d: Date | null | undefined) => (d ? dateTime.format(d) : "–");
export const fmtDate = (d: Date | null | undefined) => (d ? dateOnly.format(d) : "–");

/** „vor 3 Std.“ – für Alter von Daten und Meldungen. */
export function ago(d: Date, now = new Date()): string {
  const min = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 48) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

export const REASON_LABEL: Record<string, string> = { spam: "Spam", offensive: "Beleidigend", wrong_info: "Falsche Angaben", other: "Sonstiges" };
export const ROLE_LABEL: Record<string, string> = { user: "Nutzer", moderator: "Moderator", admin: "Admin" };
export const STATUS_LABEL: Record<string, string> = { published: "Veröffentlicht", hidden: "Ausgeblendet", deleted: "Gelöscht", preview: "Vorschau", active: "Aktiv", archived: "Archiviert", discarded: "Verworfen" };

export function intParam(v: string | string[] | undefined, fallback: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
export function strParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.slice(0, 80) ?? "";
}
