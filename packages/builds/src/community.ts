import { and, count, desc, eq, gt, ne, sql } from "drizzle-orm";
import { appUser, build, buildBookmark, buildComment, buildLike, isBannedNow, report, type Database } from "@tbh/db";
import { InputError } from "./input.ts";
import { BuildError, type Actor } from "./service.ts";
import { bump } from "./stats.ts";

export const COMMUNITY_LIMITS = {
  commentMin: 1,
  commentMax: 1000,
  commentsPer10Min: 10,
  editWindowMs: 15 * 60_000,
  reportsPerDay: 20,
  reportNoteMax: 500,
} as const;

export const REPORT_REASONS = ["spam", "offensive", "wrong_info", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const clean = (v: string) =>
  v
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" ? "\n" : ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();

async function activeActor(db: Database, actor: Actor) {
  const [u] = await db.select({ id: appUser.id, bannedAt: appUser.bannedAt, bannedUntil: appUser.bannedUntil }).from(appUser).where(eq(appUser.id, actor.id));
  if (!u) throw new BuildError("forbidden", "Unbekannter Nutzer.");
  if (isBannedNow(u)) throw new BuildError("banned", "Dein Konto ist gesperrt.");
}

/** Nur veröffentlichte, nicht ausgeblendete Builds nehmen Reaktionen an. */
async function publishedBuild(db: Database, publicId: string) {
  if (!/^[0-9A-Za-z]{6,16}$/.test(publicId)) throw new BuildError("not_found", "Build nicht gefunden.");
  const [b] = await db.select({ id: build.id, ownerId: build.ownerId, status: build.status }).from(build).where(eq(build.publicId, publicId));
  if (!b || b.status !== "published") throw new BuildError("not_found", "Build nicht gefunden.");
  return b;
}

async function refreshCounts(db: Database, buildId: number) {
  await db.execute(sql`
    UPDATE build SET
      like_count = (SELECT count(*) FROM build_like WHERE build_id = ${buildId}),
      comment_count = (SELECT count(*) FROM build_comment WHERE build_id = ${buildId} AND status = 'visible')
    WHERE id = ${buildId}`);
}

/* ------------------------------ Gefällt mir / Merken ------------------------------ */

export async function setLike(db: Database, actor: Actor, publicId: string, on: boolean): Promise<{ liked: boolean; likeCount: number }> {
  await activeActor(db, actor);
  const b = await publishedBuild(db, publicId);
  if (b.ownerId === actor.id) throw new BuildError("forbidden", "Eigene Builds kannst du nicht mit „Gefällt mir“ markieren.");
  if (on) {
    const inserted = await db.insert(buildLike).values({ userId: actor.id, buildId: b.id }).onConflictDoNothing().returning({ u: buildLike.userId });
    if (inserted.length) await bump(db, "likes");
  } else {
    await db.delete(buildLike).where(and(eq(buildLike.userId, actor.id), eq(buildLike.buildId, b.id)));
  }
  await refreshCounts(db, b.id);
  const [row] = await db.select({ n: build.likeCount }).from(build).where(eq(build.id, b.id));
  return { liked: on, likeCount: row?.n ?? 0 };
}

export async function setBookmark(db: Database, actor: Actor, publicId: string, on: boolean): Promise<{ bookmarked: boolean }> {
  await activeActor(db, actor);
  const b = await publishedBuild(db, publicId);
  if (on) await db.insert(buildBookmark).values({ userId: actor.id, buildId: b.id }).onConflictDoNothing();
  else await db.delete(buildBookmark).where(and(eq(buildBookmark.userId, actor.id), eq(buildBookmark.buildId, b.id)));
  return { bookmarked: on };
}

export async function getInteraction(db: Database, viewerId: number | null, publicId: string) {
  const [b] = await db.select({ id: build.id, likeCount: build.likeCount, commentCount: build.commentCount }).from(build).where(eq(build.publicId, publicId));
  if (!b) return { liked: false, bookmarked: false, likeCount: 0, commentCount: 0 };
  if (viewerId === null) return { liked: false, bookmarked: false, likeCount: b.likeCount, commentCount: b.commentCount };
  const [[like], [bm]] = await Promise.all([
    db.select({ u: buildLike.userId }).from(buildLike).where(and(eq(buildLike.userId, viewerId), eq(buildLike.buildId, b.id))),
    db.select({ u: buildBookmark.userId }).from(buildBookmark).where(and(eq(buildBookmark.userId, viewerId), eq(buildBookmark.buildId, b.id))),
  ]);
  return { liked: !!like, bookmarked: !!bm, likeCount: b.likeCount, commentCount: b.commentCount };
}

/** Gemerkte Builds; ausgeblendete oder gelöschte fallen heraus. */
export async function listBookmarks(db: Database, actor: Actor) {
  return db
    .select({
      publicId: build.publicId,
      title: build.title,
      weaponExtId: build.weaponExtId,
      mode: build.mode,
      purpose: build.purpose,
      visibility: build.visibility,
      status: build.status,
      latestVersion: build.latestVersion,
      patchLabel: build.patchLabel,
      updatedAt: build.updatedAt,
    })
    .from(buildBookmark)
    .innerJoin(build, eq(build.id, buildBookmark.buildId))
    .where(and(eq(buildBookmark.userId, actor.id), eq(build.status, "published")))
    .orderBy(desc(buildBookmark.createdAt));
}

/* ------------------------------ Kommentare ------------------------------ */

export interface CommentView {
  id: number;
  body: string;
  status: "visible" | "hidden" | "deleted";
  createdAt: Date;
  editedAt: Date | null;
  author: { id: number; login: string; displayName: string; avatarUrl: string | null };
  canEdit: boolean;
}

function parseBody(value: unknown): string {
  if (typeof value !== "string") throw new InputError("Kommentar fehlt.", "body");
  const body = clean(value);
  if (body.length < COMMUNITY_LIMITS.commentMin) throw new InputError("Kommentar ist leer.", "body");
  if (body.length > COMMUNITY_LIMITS.commentMax) throw new InputError(`Kommentar ist zu lang (höchstens ${COMMUNITY_LIMITS.commentMax} Zeichen).`, "body");
  return body;
}

export async function addComment(db: Database, actor: Actor, publicId: string, value: unknown, now = new Date()): Promise<{ id: number }> {
  await activeActor(db, actor);
  const body = parseBody(value);
  const b = await publishedBuild(db, publicId);
  const since = new Date(now.getTime() - 10 * 60_000);
  const recent = await db
    .select({ body: buildComment.body })
    .from(buildComment)
    .where(and(eq(buildComment.authorId, actor.id), gt(buildComment.createdAt, since)));
  if (recent.length >= COMMUNITY_LIMITS.commentsPer10Min) throw new BuildError("rate_limited", "Zu viele Kommentare in kurzer Zeit. Bitte warte etwas.");
  if (recent.some((r) => r.body === body)) throw new BuildError("rate_limited", "Diesen Kommentar hast du gerade schon geschrieben.");
  const [c] = await db.insert(buildComment).values({ buildId: b.id, authorId: actor.id, body }).returning({ id: buildComment.id });
  await refreshCounts(db, b.id);
  await bump(db, "comments");
  return { id: c!.id };
}

export async function editComment(db: Database, actor: Actor, commentId: number, value: unknown, now = new Date()): Promise<void> {
  await activeActor(db, actor);
  const body = parseBody(value);
  const [c] = await db.select().from(buildComment).where(eq(buildComment.id, commentId));
  if (!c || c.authorId !== actor.id || c.status !== "visible") throw new BuildError("not_found", "Kommentar nicht gefunden.");
  if (now.getTime() - c.createdAt.getTime() > COMMUNITY_LIMITS.editWindowMs) throw new BuildError("forbidden", "Kommentare lassen sich nur 15 Minuten lang bearbeiten.");
  await db.update(buildComment).set({ body, editedAt: now }).where(eq(buildComment.id, commentId));
}

/** Eigenen Kommentar löschen – wirklich entfernt, nicht nur versteckt. */
export async function deleteOwnComment(db: Database, actor: Actor, commentId: number): Promise<void> {
  const removed = await db
    .delete(buildComment)
    .where(and(eq(buildComment.id, commentId), eq(buildComment.authorId, actor.id)))
    .returning({ buildId: buildComment.buildId });
  if (!removed[0]) throw new BuildError("not_found", "Kommentar nicht gefunden.");
  await refreshCounts(db, removed[0].buildId);
}

/** Kommentare eines Builds. Ausgeblendete sieht nur die Moderation (und ihr Verfasser als Hinweis). */
export async function listComments(db: Database, publicId: string, viewer: { id: number; role: string } | null, now = new Date()): Promise<CommentView[]> {
  const [b] = await db.select({ id: build.id }).from(build).where(eq(build.publicId, publicId));
  if (!b) return [];
  const staff = viewer?.role === "moderator" || viewer?.role === "admin";
  const rows = await db
    .select({ c: buildComment, a: { id: appUser.id, login: appUser.login, displayName: appUser.displayName, avatarUrl: appUser.avatarUrl } })
    .from(buildComment)
    .innerJoin(appUser, eq(appUser.id, buildComment.authorId))
    .where(and(eq(buildComment.buildId, b.id), ne(buildComment.status, "deleted")))
    .orderBy(buildComment.createdAt)
    .limit(500);
  return rows
    .filter((r) => r.c.status === "visible" || staff || r.c.authorId === viewer?.id)
    .map((r) => ({
      id: r.c.id,
      body: r.c.body,
      status: r.c.status,
      createdAt: r.c.createdAt,
      editedAt: r.c.editedAt,
      author: r.a,
      canEdit: r.c.authorId === viewer?.id && r.c.status === "visible" && now.getTime() - r.c.createdAt.getTime() <= COMMUNITY_LIMITS.editWindowMs,
    }));
}

/* ------------------------------ Melden ------------------------------ */

export async function fileReport(
  db: Database,
  actor: Actor,
  input: { targetType: unknown; target: unknown; reason: unknown; note?: unknown },
  now = new Date(),
): Promise<{ id: number }> {
  await activeActor(db, actor);
  const reason = REPORT_REASONS.find((r) => r === input.reason);
  if (!reason) throw new InputError("Bitte einen Grund wählen.", "reason");
  const note = typeof input.note === "string" ? clean(input.note) : "";
  if (note.length > COMMUNITY_LIMITS.reportNoteMax) throw new InputError(`Anmerkung ist zu lang (höchstens ${COMMUNITY_LIMITS.reportNoteMax} Zeichen).`, "note");

  let targetType: "build" | "comment";
  let targetId: number;
  if (input.targetType === "build" && typeof input.target === "string") {
    const b = await publishedBuild(db, input.target);
    if (b.ownerId === actor.id) throw new BuildError("forbidden", "Eigene Builds kannst du nicht melden.");
    targetType = "build";
    targetId = b.id;
  } else if (input.targetType === "comment" && typeof input.target === "number" && Number.isInteger(input.target)) {
    const [c] = await db.select({ id: buildComment.id, authorId: buildComment.authorId, status: buildComment.status }).from(buildComment).where(eq(buildComment.id, input.target));
    if (!c || c.status !== "visible") throw new BuildError("not_found", "Kommentar nicht gefunden.");
    if (c.authorId === actor.id) throw new BuildError("forbidden", "Eigene Kommentare kannst du nicht melden.");
    targetType = "comment";
    targetId = c.id;
  } else {
    throw new InputError("Unbekanntes Ziel.");
  }

  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(report).where(and(eq(report.reporterId, actor.id), gt(report.createdAt, dayAgo)));
  if (n >= COMMUNITY_LIMITS.reportsPerDay) throw new BuildError("rate_limited", "Zu viele Meldungen heute.");
  const inserted = await db
    .insert(report)
    .values({ targetType, targetId, reporterId: actor.id, reason, note })
    .onConflictDoNothing()
    .returning({ id: report.id });
  if (!inserted[0]) throw new BuildError("limit_reached", "Du hast das bereits gemeldet. Die Moderation schaut es sich an.");
  await bump(db, "reports");
  return { id: inserted[0].id };
}
