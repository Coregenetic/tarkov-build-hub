import { eq, lt, sql } from "drizzle-orm";
import { appUser, auditLog, isBannedNow, userSession, type Database } from "@tbh/db";
import { randomToken, sha256Hex } from "./crypto.ts";
import { AuthError, type TwitchIdentity } from "./twitch.ts";

export type Role = "user" | "moderator" | "admin";

export interface SessionUser {
  id: number;
  twitchId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  /** Beginn der aktuellen Sitzung (für Aktionen, die eine frische Anmeldung verlangen). */
  sessionStartedAt?: Date;
}

const SLIDE_AFTER_MS = 60 * 60 * 1000;

function toSessionUser(row: typeof appUser.$inferSelect): SessionUser {
  return { id: row.id, twitchId: row.twitchId, login: row.login, displayName: row.displayName, avatarUrl: row.avatarUrl, role: row.role };
}

/** Legt den Nutzer an oder aktualisiert Name und Avatar und erstellt eine neue Sitzung. */
export async function createSessionForIdentity(
  db: Database,
  identity: TwitchIdentity,
  options: { ttlDays: number; userAgent?: string | null; now?: Date },
): Promise<{ user: SessionUser; token: string; expiresAt: Date }> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(appUser)
      .values({ twitchId: identity.twitchId, login: identity.login, displayName: identity.displayName, avatarUrl: identity.avatarUrl, lastLoginAt: now })
      .onConflictDoUpdate({
        target: appUser.twitchId,
        set: { login: identity.login, displayName: identity.displayName, avatarUrl: identity.avatarUrl, lastLoginAt: now },
      })
      .returning();
    if (!row) throw new Error("Nutzer konnte nicht gespeichert werden.");
    if (isBannedNow(row, now)) throw new AuthError("banned", "Dieses Konto ist gesperrt.");

    const token = randomToken(32);
    const expiresAt = new Date(now.getTime() + options.ttlDays * 86_400_000);
    await tx.insert(userSession).values({
      tokenHash: sha256Hex(token),
      userId: row.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      userAgent: options.userAgent?.slice(0, 300) ?? null,
    });
    return { user: toSessionUser(row), token, expiresAt };
  });
}

/**
 * Prüft den Token aus dem Cookie. Abgelaufene Sitzungen werden gelöscht,
 * gesperrte Nutzer gelten als abgemeldet. Aktive Sitzungen verlängern sich höchstens einmal pro Stunde.
 */
export async function getSessionUser(
  db: Database,
  token: string | undefined,
  options: { ttlDays: number; now?: Date },
): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const now = options.now ?? new Date();
  const hash = sha256Hex(token);
  const [row] = await db
    .select({ session: userSession, user: appUser })
    .from(userSession)
    .innerJoin(appUser, eq(appUser.id, userSession.userId))
    .where(eq(userSession.tokenHash, hash));
  if (!row) return null;
  if (row.session.expiresAt <= now) {
    await db.delete(userSession).where(eq(userSession.tokenHash, hash));
    return null;
  }
  if (isBannedNow(row.user, now)) return null;
  if (now.getTime() - row.session.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
    await db
      .update(userSession)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + options.ttlDays * 86_400_000) })
      .where(eq(userSession.tokenHash, hash));
  }
  return { ...toSessionUser(row.user), sessionStartedAt: row.session.createdAt };
}

export async function deleteSession(db: Database, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(userSession).where(eq(userSession.tokenHash, sha256Hex(token)));
}

export async function deleteExpiredSessions(db: Database, now = new Date()): Promise<number> {
  const rows = await db.delete(userSession).where(lt(userSession.expiresAt, now)).returning({ h: userSession.tokenHash });
  return rows.length;
}

/* ---------------------------- Rollen und Sperren ---------------------------- */

async function findUser(db: Database, loginOrTwitchId: string) {
  const key = loginOrTwitchId.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(appUser)
    .where(/^\d+$/.test(key) ? eq(appUser.twitchId, key) : eq(appUser.login, key));
  if (!row) throw new Error(`Nutzer „${loginOrTwitchId}“ ist unbekannt. Er muss sich einmal angemeldet haben.`);
  return row;
}

export async function setRole(db: Database, loginOrTwitchId: string, role: Role, actor: string): Promise<SessionUser> {
  return db.transaction(async (tx) => {
    const user = await findUser(tx as unknown as Database, loginOrTwitchId);
    const [updated] = await tx.update(appUser).set({ role }).where(eq(appUser.id, user.id)).returning();
    await tx.insert(auditLog).values({ actor, action: "user.set_role", target: `app_user:${user.id}`, details: { from: user.role, to: role } });
    return toSessionUser(updated!);
  });
}

/** Sperrt einen Nutzer und beendet sofort alle seine Sitzungen. */
export async function banUser(db: Database, loginOrTwitchId: string, reason: string, actor: string): Promise<void> {
  await db.transaction(async (tx) => {
    const user = await findUser(tx as unknown as Database, loginOrTwitchId);
    await tx.update(appUser).set({ bannedAt: sql`now()`, bannedUntil: null, banReason: reason.slice(0, 500) }).where(eq(appUser.id, user.id));
    await tx.delete(userSession).where(eq(userSession.userId, user.id));
    await tx.insert(auditLog).values({ actor, action: "user.ban", target: `app_user:${user.id}`, details: { reason } });
  });
}

export async function unbanUser(db: Database, loginOrTwitchId: string, actor: string): Promise<void> {
  await db.transaction(async (tx) => {
    const user = await findUser(tx as unknown as Database, loginOrTwitchId);
    await tx.update(appUser).set({ bannedAt: null, bannedUntil: null, banReason: null }).where(eq(appUser.id, user.id));
    await tx.insert(auditLog).values({ actor, action: "user.unban", target: `app_user:${user.id}`, details: {} });
  });
}

export async function getPublicProfile(db: Database, login: string) {
  const [row] = await db
    .select({ id: appUser.id, login: appUser.login, displayName: appUser.displayName, avatarUrl: appUser.avatarUrl, role: appUser.role, createdAt: appUser.createdAt, bannedAt: appUser.bannedAt, bannedUntil: appUser.bannedUntil })
    .from(appUser)
    .where(eq(appUser.login, login.toLowerCase()));
  if (!row || isBannedNow(row)) return null;
  return { id: row.id, login: row.login, displayName: row.displayName, avatarUrl: row.avatarUrl, role: row.role, createdAt: row.createdAt };
}
