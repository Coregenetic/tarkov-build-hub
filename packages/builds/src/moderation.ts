import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { appUser, auditLog, banActiveSql, build, buildComment, report, siteSetting, userSession, type Database } from "@tbh/db";
import { InputError } from "./input.ts";
import { BuildError } from "./service.ts";

/**
 * Moderation und Verwaltung. Jede Aktion prüft die Rolle in der Datenbank (nicht nur in der Sitzung)
 * und landet mit vorher/nachher im unveränderlichen Protokoll.
 */

export type StaffRole = "moderator" | "admin";

export interface Staff {
  id: number;
  login: string;
  /** Beginn der Sitzung – für Aktionen, die eine frische Anmeldung verlangen. */
  sessionStartedAt?: Date | undefined;
}

/** Endgültige Löschungen und Rollenwechsel verlangen eine Anmeldung von höchstens 10 Minuten. */
export const FRESH_SESSION_MS = 10 * 60_000;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Prüft die Rolle in der Datenbank (für Aktionen außerhalb dieses Moduls, z. B. Namen und Import). */
export async function requireRole(db: Database | Tx, staff: Staff, min: StaffRole): Promise<StaffRole> {
  const [u] = await db.select({ role: appUser.role, bannedAt: appUser.bannedAt }).from(appUser).where(eq(appUser.id, staff.id));
  const role = u?.role;
  if (!u || u.bannedAt || (role !== "moderator" && role !== "admin") || (min === "admin" && role !== "admin")) {
    throw new BuildError("forbidden", "Dafür fehlen dir die Rechte.");
  }
  return role;
}

export function requireFresh(staff: Staff, now = new Date()) {
  if (!staff.sessionStartedAt || now.getTime() - staff.sessionStartedAt.getTime() > FRESH_SESSION_MS) {
    throw new BuildError("reauth_required", "Bitte bestätige diese Aktion mit einer erneuten Twitch-Anmeldung.");
  }
}

function reasonText(value: unknown): string {
  const r = typeof value === "string" ? value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").trim() : "";
  if (r.length < 2 || r.length > 300) throw new InputError("Bitte einen Grund angeben (2 bis 300 Zeichen).", "reason");
  return r;
}

async function audit(tx: Database | Tx, staff: Staff, action: string, target: string, details: Record<string, unknown>) {
  await tx.insert(auditLog).values({ actor: staff.login, actorUserId: staff.id, action, target, details });
}

async function refreshCommentCount(tx: Database | Tx, buildId: number) {
  await tx.execute(sql`UPDATE build SET comment_count = (SELECT count(*) FROM build_comment WHERE build_id = ${buildId} AND status = 'visible') WHERE id = ${buildId}`);
}

/* ------------------------------ Meldungen ------------------------------ */

export interface ReportGroup {
  targetType: "build" | "comment";
  targetId: number;
  reports: number;
  reasons: Record<string, number>;
  notes: string[];
  firstAt: Date;
  /** Build: Titel und Link; Kommentar: Auszug und Build-Link. */
  title: string;
  excerpt: string | null;
  buildPublicId: string | null;
  author: { id: number; login: string } | null;
  targetStatus: string;
}

export async function listOpenReports(db: Database, staff: Staff): Promise<ReportGroup[]> {
  await requireRole(db, staff, "moderator");
  const rows = await db.select().from(report).where(eq(report.status, "open")).orderBy(report.createdAt).limit(1000);
  const groups = new Map<string, ReportGroup>();
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    const g =
      groups.get(key) ??
      ({ targetType: r.targetType, targetId: r.targetId, reports: 0, reasons: {}, notes: [], firstAt: r.createdAt, title: "", excerpt: null, buildPublicId: null, author: null, targetStatus: "" } as ReportGroup);
    g.reports++;
    g.reasons[r.reason] = (g.reasons[r.reason] ?? 0) + 1;
    if (r.note && g.notes.length < 5) g.notes.push(r.note);
    groups.set(key, g);
  }
  const buildIds = [...groups.values()].filter((g) => g.targetType === "build").map((g) => g.targetId);
  const commentIds = [...groups.values()].filter((g) => g.targetType === "comment").map((g) => g.targetId);
  const [builds, comments] = await Promise.all([
    buildIds.length
      ? db
          .select({ id: build.id, title: build.title, publicId: build.publicId, status: build.status, ownerId: appUser.id, login: appUser.login })
          .from(build)
          .innerJoin(appUser, eq(appUser.id, build.ownerId))
          .where(inArray(build.id, buildIds))
      : Promise.resolve([]),
    commentIds.length
      ? db
          .select({ id: buildComment.id, body: buildComment.body, status: buildComment.status, publicId: build.publicId, title: build.title, authorId: appUser.id, login: appUser.login })
          .from(buildComment)
          .innerJoin(build, eq(build.id, buildComment.buildId))
          .innerJoin(appUser, eq(appUser.id, buildComment.authorId))
          .where(inArray(buildComment.id, commentIds))
      : Promise.resolve([]),
  ]);
  for (const b of builds) {
    const g = groups.get(`build:${b.id}`)!;
    Object.assign(g, { title: b.title, buildPublicId: b.publicId, author: { id: b.ownerId, login: b.login }, targetStatus: b.status });
  }
  for (const c of comments) {
    const g = groups.get(`comment:${c.id}`)!;
    Object.assign(g, { title: c.title, excerpt: c.body.slice(0, 280), buildPublicId: c.publicId, author: { id: c.authorId, login: c.login }, targetStatus: c.status });
  }
  // Ziele, die es nicht mehr gibt (gelöscht), bleiben mit leerem Titel sichtbar und lassen sich ablehnen.
  return [...groups.values()].sort((a, b) => b.reports - a.reports || a.firstAt.getTime() - b.firstAt.getTime());
}

export type ReportAction = "dismiss" | "hide" | "hide_ban";

/** Bearbeitet alle offenen Meldungen zu einem Ziel auf einmal. */
export async function resolveReports(
  db: Database,
  staff: Staff,
  input: { targetType: unknown; targetId: unknown; action: unknown; reason?: unknown },
  now = new Date(),
): Promise<void> {
  const targetType = input.targetType === "build" || input.targetType === "comment" ? input.targetType : null;
  const targetId = typeof input.targetId === "number" && Number.isInteger(input.targetId) ? input.targetId : null;
  const action = input.action === "dismiss" || input.action === "hide" || input.action === "hide_ban" ? input.action : null;
  if (!targetType || targetId === null || !action) throw new InputError("Ungültige Aktion.");
  const reason = action === "dismiss" ? "" : reasonText(input.reason);
  await db.transaction(async (tx) => {
    await requireRole(tx, staff, "moderator");
    let authorId: number | null = null;
    if (action !== "dismiss") {
      if (targetType === "build") {
        const [b] = await tx.update(build).set({ status: "hidden", hiddenReason: reason, updatedAt: now }).where(and(eq(build.id, targetId), eq(build.status, "published"))).returning({ ownerId: build.ownerId });
        authorId = b?.ownerId ?? null;
      } else {
        const [c] = await tx.update(buildComment).set({ status: "hidden", hiddenReason: reason }).where(and(eq(buildComment.id, targetId), eq(buildComment.status, "visible"))).returning({ authorId: buildComment.authorId, buildId: buildComment.buildId });
        authorId = c?.authorId ?? null;
        if (c) await refreshCommentCount(tx, c.buildId);
      }
    }
    const outcome = action === "dismiss" ? "abgelehnt" : action === "hide" ? "ausgeblendet" : "ausgeblendet, Ersteller 7 Tage gesperrt";
    const resolved = await tx
      .update(report)
      .set({ status: action === "dismiss" ? "dismissed" : "actioned", resolvedBy: staff.id, resolvedAt: now, outcome })
      .where(and(eq(report.targetType, targetType), eq(report.targetId, targetId), eq(report.status, "open")))
      .returning({ id: report.id });
    if (action === "hide_ban" && authorId !== null) await banInTx(tx, staff, authorId, "7d", reason, now);
    await audit(tx, staff, action === "dismiss" ? "report.dismiss" : "report.action", `${targetType}:${targetId}`, { reports: resolved.length, outcome, reason });
  });
}

/* ------------------------------ Builds und Kommentare ------------------------------ */

export async function hideBuild(db: Database, staff: Staff, publicId: string, reasonInput: unknown): Promise<void> {
  const reason = reasonText(reasonInput);
  await db.transaction(async (tx) => {
    await requireRole(tx, staff, "moderator");
    const [b] = await tx.update(build).set({ status: "hidden", hiddenReason: reason, updatedAt: sql`now()` }).where(and(eq(build.publicId, publicId), eq(build.status, "published"))).returning({ id: build.id });
    if (!b) throw new BuildError("not_found", "Build nicht gefunden oder nicht öffentlich.");
    await audit(tx, staff, "build.hide", `build:${publicId}`, { before: "published", after: "hidden", reason });
  });
}

export async function restoreBuild(db: Database, staff: Staff, publicId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await requireRole(tx, staff, "moderator");
    const [b] = await tx.update(build).set({ status: "published", hiddenReason: null, updatedAt: sql`now()` }).where(and(eq(build.publicId, publicId), eq(build.status, "hidden"))).returning({ id: build.id });
    if (!b) throw new BuildError("not_found", "Build nicht gefunden oder nicht ausgeblendet.");
    await audit(tx, staff, "build.restore", `build:${publicId}`, { before: "hidden", after: "published" });
  });
}

/** Endgültig löschen (z. B. Löschanfrage). Nur Admins, nur mit frischer Anmeldung. Varianten anderer bleiben. */
export async function hardDeleteBuild(db: Database, staff: Staff, publicId: string, reasonInput: unknown, now = new Date()): Promise<void> {
  const reason = reasonText(reasonInput);
  requireFresh(staff, now);
  await db.transaction(async (tx) => {
    await requireRole(tx, staff, "admin");
    const [b] = await tx.delete(build).where(eq(build.publicId, publicId)).returning({ id: build.id, title: build.title, ownerId: build.ownerId });
    if (!b) throw new BuildError("not_found", "Build nicht gefunden.");
    await tx.delete(report).where(and(eq(report.targetType, "build"), eq(report.targetId, b.id)));
    await audit(tx, staff, "build.delete", `build:${publicId}`, { title: b.title, ownerId: b.ownerId, reason, after: "gelöscht" });
  });
}

export async function hideComment(db: Database, staff: Staff, commentId: number, reasonInput: unknown): Promise<void> {
  const reason = reasonText(reasonInput);
  await db.transaction(async (tx) => {
    await requireRole(tx, staff, "moderator");
    const [c] = await tx.update(buildComment).set({ status: "hidden", hiddenReason: reason }).where(and(eq(buildComment.id, commentId), eq(buildComment.status, "visible"))).returning({ buildId: buildComment.buildId });
    if (!c) throw new BuildError("not_found", "Kommentar nicht gefunden.");
    await refreshCommentCount(tx, c.buildId);
    await audit(tx, staff, "comment.hide", `comment:${commentId}`, { before: "visible", after: "hidden", reason });
  });
}

export async function restoreComment(db: Database, staff: Staff, commentId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await requireRole(tx, staff, "moderator");
    const [c] = await tx.update(buildComment).set({ status: "visible", hiddenReason: null }).where(and(eq(buildComment.id, commentId), eq(buildComment.status, "hidden"))).returning({ buildId: buildComment.buildId });
    if (!c) throw new BuildError("not_found", "Kommentar nicht gefunden.");
    await refreshCommentCount(tx, c.buildId);
    await audit(tx, staff, "comment.restore", `comment:${commentId}`, { before: "hidden", after: "visible" });
  });
}

export interface AdminBuildRow {
  publicId: string;
  title: string;
  weaponExtId: string;
  status: "published" | "hidden" | "deleted";
  visibility: "public" | "unlisted";
  hiddenReason: string | null;
  owner: string;
  openReports: number;
  likeCount: number;
  updatedAt: Date;
}

export async function listBuildsForStaff(db: Database, staff: Staff, filter: { q?: string; status?: "all" | "reported" | "hidden"; page?: number }): Promise<{ rows: AdminBuildRow[]; total: number }> {
  await requireRole(db, staff, "moderator");
  const openReports = sql<number>`(SELECT count(*)::int FROM report r WHERE r.target_type = 'build' AND r.target_id = ${build.id} AND r.status = 'open')`;
  const where = and(
    filter.status === "hidden" ? inArray(build.status, ["hidden", "deleted"]) : undefined,
    filter.status === "reported" ? sql`${openReports} > 0` : undefined,
    filter.q ? or(ilike(build.title, `%${filter.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`), ilike(appUser.login, `%${filter.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)) : undefined,
  );
  const page = Math.max(1, filter.page ?? 1);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        publicId: build.publicId,
        title: build.title,
        weaponExtId: build.weaponExtId,
        status: build.status,
        visibility: build.visibility,
        hiddenReason: build.hiddenReason,
        owner: appUser.login,
        openReports,
        likeCount: build.likeCount,
        updatedAt: build.updatedAt,
      })
      .from(build)
      .innerJoin(appUser, eq(appUser.id, build.ownerId))
      .where(where)
      .orderBy(desc(openReports), desc(build.updatedAt))
      .limit(50)
      .offset((page - 1) * 50),
    db.select({ total: sql<number>`count(*)::int` }).from(build).innerJoin(appUser, eq(appUser.id, build.ownerId)).where(where),
  ]);
  return { rows, total };
}

/* ------------------------------ Nutzer ------------------------------ */

export type BanDuration = "24h" | "7d" | "permanent";

async function banInTx(tx: Tx, staff: Staff, userId: number, duration: BanDuration, reason: string, now: Date) {
  const role = await requireRole(tx, staff, "moderator");
  if (userId === staff.id) throw new BuildError("forbidden", "Du kannst dich nicht selbst sperren.");
  if (duration === "permanent" && role !== "admin") throw new BuildError("forbidden", "Dauerhafte Sperren dürfen nur Admins vergeben.");
  const [target] = await tx.select({ role: appUser.role, login: appUser.login, bannedAt: appUser.bannedAt, bannedUntil: appUser.bannedUntil }).from(appUser).where(eq(appUser.id, userId));
  if (!target) throw new BuildError("not_found", "Nutzer nicht gefunden.");
  if (target.role === "admin" || (target.role === "moderator" && role !== "admin")) throw new BuildError("forbidden", "Diesen Nutzer darfst du nicht sperren.");
  const until = duration === "permanent" ? null : new Date(now.getTime() + (duration === "24h" ? 1 : 7) * 86_400_000);
  await tx.update(appUser).set({ bannedAt: now, bannedUntil: until, banReason: reason }).where(eq(appUser.id, userId));
  await tx.delete(userSession).where(eq(userSession.userId, userId));
  await audit(tx, staff, "user.ban", `app_user:${userId}`, {
    login: target.login,
    before: target.bannedAt ? (target.bannedUntil ? `gesperrt bis ${target.bannedUntil.toISOString()}` : "dauerhaft gesperrt") : "aktiv",
    after: until ? `gesperrt bis ${until.toISOString()}` : "dauerhaft gesperrt",
    reason,
  });
}

export async function banUserFor(db: Database, staff: Staff, userId: number, durationInput: unknown, reasonInput: unknown, now = new Date()): Promise<void> {
  const duration = durationInput === "24h" || durationInput === "7d" || durationInput === "permanent" ? durationInput : null;
  if (!duration) throw new InputError("Ungültige Dauer.");
  const reason = reasonText(reasonInput);
  await db.transaction((tx) => banInTx(tx, staff, userId, duration, reason, now));
}

export async function unbanUserById(db: Database, staff: Staff, userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const role = await requireRole(tx, staff, "moderator");
    const [target] = await tx.select({ login: appUser.login, bannedAt: appUser.bannedAt, bannedUntil: appUser.bannedUntil }).from(appUser).where(eq(appUser.id, userId));
    if (!target?.bannedAt) throw new BuildError("not_found", "Nutzer ist nicht gesperrt.");
    if (target.bannedUntil === null && role !== "admin") throw new BuildError("forbidden", "Dauerhafte Sperren hebt nur ein Admin auf.");
    await tx.update(appUser).set({ bannedAt: null, bannedUntil: null, banReason: null }).where(eq(appUser.id, userId));
    await audit(tx, staff, "user.unban", `app_user:${userId}`, { login: target.login, before: "gesperrt", after: "aktiv" });
  });
}

/** Rolle Nutzer ↔ Moderator. Admin wird man nur über die Server-Konsole. */
export async function setUserRoleById(db: Database, staff: Staff, userId: number, roleInput: unknown, now = new Date()): Promise<void> {
  const role = roleInput === "user" || roleInput === "moderator" ? roleInput : null;
  if (!role) throw new InputError("Rolle muss Nutzer oder Moderator sein. Admin nur über die Server-Konsole.");
  requireFresh(staff, now);
  await db.transaction(async (tx) => {
    await requireRole(tx, staff, "admin");
    if (userId === staff.id) throw new BuildError("forbidden", "Die eigene Rolle lässt sich hier nicht ändern.");
    const [target] = await tx.select({ role: appUser.role, login: appUser.login }).from(appUser).where(eq(appUser.id, userId));
    if (!target) throw new BuildError("not_found", "Nutzer nicht gefunden.");
    if (target.role === "admin") throw new BuildError("forbidden", "Admins ändert man nur über die Server-Konsole.");
    if (target.role === role) return;
    await tx.update(appUser).set({ role }).where(eq(appUser.id, userId));
    await audit(tx, staff, "user.set_role", `app_user:${userId}`, { login: target.login, before: target.role, after: role });
  });
}

export async function revokeSessions(db: Database, staff: Staff, userId: number): Promise<number> {
  return db.transaction(async (tx) => {
    await requireRole(tx, staff, "admin");
    const removed = await tx.delete(userSession).where(eq(userSession.userId, userId)).returning({ h: userSession.tokenHash });
    await audit(tx, staff, "user.revoke_sessions", `app_user:${userId}`, { sessions: removed.length });
    return removed.length;
  });
}

/** Spam-Konten: alle Builds und Kommentare ausblenden und dauerhaft sperren. Frische Anmeldung nötig. */
export async function purgeUserContent(db: Database, staff: Staff, userId: number, reasonInput: unknown, now = new Date()): Promise<{ builds: number; comments: number }> {
  const reason = reasonText(reasonInput);
  requireFresh(staff, now);
  return db.transaction(async (tx) => {
    await requireRole(tx, staff, "admin");
    const builds = await tx.update(build).set({ status: "hidden", hiddenReason: reason, updatedAt: now }).where(and(eq(build.ownerId, userId), eq(build.status, "published"))).returning({ id: build.id });
    const comments = await tx.update(buildComment).set({ status: "hidden", hiddenReason: reason }).where(and(eq(buildComment.authorId, userId), eq(buildComment.status, "visible"))).returning({ buildId: buildComment.buildId });
    for (const id of new Set(comments.map((c) => c.buildId))) await refreshCommentCount(tx, id);
    await banInTx(tx, staff, userId, "permanent", reason, now);
    await audit(tx, staff, "user.purge", `app_user:${userId}`, { builds: builds.length, comments: comments.length, reason });
    return { builds: builds.length, comments: comments.length };
  });
}

export interface AdminUserRow {
  id: number;
  login: string;
  displayName: string;
  role: "user" | "moderator" | "admin";
  createdAt: Date;
  banned: boolean;
  bannedUntil: Date | null;
  banReason: string | null;
  builds: number;
}

export async function listUsers(db: Database, staff: Staff, q: string, page = 1): Promise<{ rows: AdminUserRow[]; total: number }> {
  await requireRole(db, staff, "moderator");
  const term = q.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`).slice(0, 40);
  const where = term ? or(ilike(appUser.login, `%${term}%`), ilike(appUser.displayName, `%${term}%`)) : undefined;
  const builds = sql<number>`(SELECT count(*)::int FROM build b WHERE b.owner_id = ${appUser.id} AND b.status <> 'deleted')`;
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: appUser.id,
        login: appUser.login,
        displayName: appUser.displayName,
        role: appUser.role,
        createdAt: appUser.createdAt,
        banned: sql<boolean>`${banActiveSql}`,
        bannedUntil: appUser.bannedUntil,
        banReason: appUser.banReason,
        builds,
      })
      .from(appUser)
      .where(where)
      .orderBy(desc(appUser.lastLoginAt))
      .limit(50)
      .offset((Math.max(1, page) - 1) * 50),
    db.select({ total: count() }).from(appUser).where(where),
  ]);
  return { rows, total };
}

/* ------------------------------ Protokoll ------------------------------ */

export const AUDIT_AREAS = {
  data: ["dataset.", "item_name."],
  builds: ["build."],
  reports: ["report.", "comment."],
  users: ["user."],
  system: ["setting."],
} as const;
export type AuditArea = keyof typeof AUDIT_AREAS;

export function auditArea(action: string): AuditArea {
  for (const [area, prefixes] of Object.entries(AUDIT_AREAS) as [AuditArea, readonly string[]][]) if (prefixes.some((p) => action.startsWith(p))) return area;
  return "system";
}

export async function listAudit(db: Database, staff: Staff, filter: { area?: AuditArea | null; page?: number; limit?: number }) {
  await requireRole(db, staff, "admin");
  const prefixes = filter.area ? AUDIT_AREAS[filter.area] : null;
  const where = prefixes ? or(...prefixes.map((p) => sql`${auditLog.action} LIKE ${`${p}%`}`)) : undefined;
  const limit = Math.min(filter.limit ?? 50, 5000);
  const page = Math.max(1, filter.page ?? 1);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db.select().from(auditLog).where(where).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r, area: auditArea(r.action) })), total };
}

/* ------------------------------ Einstellungen ------------------------------ */

export interface SiteSettings {
  banner: { enabled: boolean; text: string };
  maintenance: { enabled: boolean };
}

export const DEFAULT_SETTINGS: SiteSettings = { banner: { enabled: false, text: "" }, maintenance: { enabled: false } };

export async function getSettings(db: Database): Promise<SiteSettings> {
  const rows = await db.select().from(siteSetting);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const banner = (map.get("banner") as SiteSettings["banner"] | undefined) ?? DEFAULT_SETTINGS.banner;
  const maintenance = (map.get("maintenance") as SiteSettings["maintenance"] | undefined) ?? DEFAULT_SETTINGS.maintenance;
  return { banner: { enabled: !!banner.enabled, text: String(banner.text ?? "") }, maintenance: { enabled: !!maintenance.enabled } };
}

export async function updateSettings(db: Database, staff: Staff, input: { banner?: unknown; maintenance?: unknown }): Promise<SiteSettings> {
  const next: Partial<SiteSettings> = {};
  if (input.banner !== undefined) {
    const b = input.banner as { enabled?: unknown; text?: unknown };
    const text = typeof b.text === "string" ? b.text.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").trim() : "";
    if (text.length > 200) throw new InputError("Bannertext ist zu lang (höchstens 200 Zeichen).", "banner");
    if (b.enabled === true && text.length < 3) throw new InputError("Bitte einen Bannertext angeben.", "banner");
    next.banner = { enabled: b.enabled === true, text };
  }
  if (input.maintenance !== undefined) next.maintenance = { enabled: (input.maintenance as { enabled?: unknown }).enabled === true };
  return db.transaction(async (tx) => {
    await requireRole(tx, staff, "admin");
    const before = await getSettings(tx as unknown as Database);
    for (const [key, value] of Object.entries(next)) {
      await tx.insert(siteSetting).values({ key, value, updatedBy: staff.id }).onConflictDoUpdate({ target: siteSetting.key, set: { value, updatedAt: sql`now()`, updatedBy: staff.id } });
      await audit(tx, staff, `setting.${key}`, `setting:${key}`, { before: before[key as keyof SiteSettings], after: value });
    }
    return { ...before, ...next };
  });
}
