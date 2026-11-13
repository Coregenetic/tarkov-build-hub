import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, ne, sql } from "drizzle-orm";
import type { BuildNode, GameData, Issue } from "@tbh/compat-engine";
import { appUser, build, buildDraft, buildVersion, gamePatch, itemDataset, type Database } from "@tbh/db";
import { evaluateTree } from "./evaluate.ts";
import { InputError, LIMITS, parseDraftInput, parsePublishInput, type Purpose } from "./input.ts";

export type BuildErrorCode =
  | "not_found"
  | "forbidden"
  | "banned"
  | "no_dataset"
  | "invalid_build"
  | "incomplete_build"
  | "not_a_weapon"
  | "ammo_not_allowed"
  | "rate_limited"
  | "limit_reached";

export class BuildError extends Error {
  constructor(
    readonly code: BuildErrorCode,
    message: string,
    readonly issues: Issue[] = [],
  ) {
    super(message);
    this.name = "BuildError";
  }
}

export { InputError };

/** Wer handelt (aus der Sitzung). */
export interface Actor {
  id: number;
  login: string;
}

export interface Deps {
  /** Lädt die Spieldaten eines Datensatzes (vom Aufrufer gecacht). */
  getGameData: (datasetId: number) => Promise<GameData>;
  now?: () => Date;
}

const ALPHABET = "0123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export function newPublicId(length = 10): string {
  const bytes = randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b < 248) out += ALPHABET[b % ALPHABET.length];
  }
  return out.length === length ? out : newPublicId(length);
}

async function requireActiveUser(db: Database, actor: Actor) {
  const [u] = await db.select({ id: appUser.id, bannedAt: appUser.bannedAt }).from(appUser).where(eq(appUser.id, actor.id));
  if (!u) throw new BuildError("forbidden", "Unbekannter Nutzer.");
  if (u.bannedAt) throw new BuildError("banned", "Dein Konto ist gesperrt.");
}

async function activeDataset(db: Database, mode: "pvp" | "pve") {
  const [row] = await db
    .select({ id: itemDataset.id, patch: gamePatch.label })
    .from(itemDataset)
    .leftJoin(gamePatch, eq(gamePatch.id, itemDataset.patchId))
    .where(and(eq(itemDataset.mode, mode), eq(itemDataset.status, "active")));
  if (!row) throw new BuildError("no_dataset", "Für diesen Modus sind keine Spieldaten freigegeben.");
  return row;
}

/* ------------------------------------------------------------------ */
/* Entwürfe                                                            */
/* ------------------------------------------------------------------ */

export interface DraftSummary {
  id: number;
  weaponExtId: string;
  mode: "pvp" | "pve";
  title: string;
  updatedAt: Date;
  baseBuildPublicId: string | null;
  forkedFromLabel: string | null;
}

/** Legt einen Entwurf an oder speichert ihn. Nur die Form wird geprüft – Entwürfe dürfen unfertig sein. */
export async function saveDraft(db: Database, actor: Actor, input: unknown, draftId?: number): Promise<{ id: number; updatedAt: Date }> {
  await requireActiveUser(db, actor);
  const d = parseDraftInput(input);
  const now = new Date();
  if (draftId !== undefined) {
    const updated = await db
      .update(buildDraft)
      .set({ mode: d.mode, weaponExtId: d.tree.itemId, title: d.title, notes: d.notes, purpose: d.purpose, tree: d.tree, ammoExtId: d.ammo, updatedAt: now })
      .where(and(eq(buildDraft.id, draftId), eq(buildDraft.ownerId, actor.id)))
      .returning({ id: buildDraft.id, updatedAt: buildDraft.updatedAt });
    if (!updated[0]) throw new BuildError("not_found", "Entwurf nicht gefunden.");
    return updated[0];
  }
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(buildDraft).where(eq(buildDraft.ownerId, actor.id));
  if (n >= LIMITS.draftsPerUser) throw new BuildError("limit_reached", `Höchstens ${LIMITS.draftsPerUser} Entwürfe. Lösche alte Entwürfe zuerst.`);
  const [created] = await db
    .insert(buildDraft)
    .values({ ownerId: actor.id, mode: d.mode, weaponExtId: d.tree.itemId, title: d.title, notes: d.notes, purpose: d.purpose, tree: d.tree, ammoExtId: d.ammo })
    .returning({ id: buildDraft.id, updatedAt: buildDraft.updatedAt });
  return created!;
}

export async function getDraft(db: Database, actor: Actor, draftId: number) {
  const [row] = await db
    .select({ draft: buildDraft, basePublicId: build.publicId })
    .from(buildDraft)
    .leftJoin(build, eq(build.id, buildDraft.baseBuildId))
    .where(and(eq(buildDraft.id, draftId), eq(buildDraft.ownerId, actor.id)));
  if (!row) throw new BuildError("not_found", "Entwurf nicht gefunden.");
  return { ...row.draft, tree: row.draft.tree as BuildNode, baseBuildPublicId: row.basePublicId };
}

export async function listDrafts(db: Database, actor: Actor): Promise<DraftSummary[]> {
  const rows = await db
    .select({
      id: buildDraft.id,
      weaponExtId: buildDraft.weaponExtId,
      mode: buildDraft.mode,
      title: buildDraft.title,
      updatedAt: buildDraft.updatedAt,
      baseBuildPublicId: build.publicId,
      forkedFromLabel: buildDraft.forkedFromLabel,
    })
    .from(buildDraft)
    .leftJoin(build, eq(build.id, buildDraft.baseBuildId))
    .where(eq(buildDraft.ownerId, actor.id))
    .orderBy(desc(buildDraft.updatedAt));
  return rows;
}

export async function deleteDraft(db: Database, actor: Actor, draftId: number): Promise<void> {
  const removed = await db
    .delete(buildDraft)
    .where(and(eq(buildDraft.id, draftId), eq(buildDraft.ownerId, actor.id)))
    .returning({ id: buildDraft.id });
  if (!removed[0]) throw new BuildError("not_found", "Entwurf nicht gefunden.");
}

/* ------------------------------------------------------------------ */
/* Veröffentlichen                                                     */
/* ------------------------------------------------------------------ */

export interface PublishResult {
  publicId: string;
  version: number;
}

/**
 * Veröffentlicht einen Entwurf als neue Version (bzw. als neuen Build).
 * Verbindliche Prüfung mit der Engine gegen den aktiven Datensatz.
 */
export async function publishDraft(db: Database, actor: Actor, draftId: number, input: unknown, deps: Deps): Promise<PublishResult> {
  await requireActiveUser(db, actor);
  const meta = parsePublishInput(input);
  const draft = await getDraft(db, actor, draftId);

  const hourAgo = new Date((deps.now?.() ?? new Date()).getTime() - 3_600_000);
  const [{ recent } = { recent: 0 }] = await db
    .select({ recent: count() })
    .from(buildVersion)
    .innerJoin(build, eq(build.id, buildVersion.buildId))
    .where(and(eq(build.ownerId, actor.id), gt(buildVersion.createdAt, hourAgo)));
  if (recent >= LIMITS.publishesPerHour) throw new BuildError("rate_limited", "Zu viele Veröffentlichungen in kurzer Zeit. Bitte später erneut versuchen.");

  const ds = await activeDataset(db, draft.mode);
  const data = await deps.getGameData(ds.id);
  const evaluation = await evaluateTree(db, data, ds.id, draft.tree, draft.ammoExtId);
  if (!evaluation.isWeapon) throw new BuildError("not_a_weapon", "Der Build beginnt nicht mit einer Waffe.");
  if (!evaluation.valid) throw new BuildError("invalid_build", "Teile passen nicht zusammen.", evaluation.issues.filter((i) => i.severity === "error"));
  if (!evaluation.complete) throw new BuildError("incomplete_build", "Pflicht-Slots sind leer.", evaluation.issues.filter((i) => i.code === "missing_required"));
  if (!evaluation.ammoAllowed) throw new BuildError("ammo_not_allowed", "Die Munition passt nicht zu Waffe und Magazin.");

  return db.transaction(async (tx) => {
    let buildId: number;
    let publicId: string;
    let version: number;
    if (draft.baseBuildId !== null) {
      const [base] = await tx.select().from(build).where(eq(build.id, draft.baseBuildId)).for("update");
      if (!base || base.status === "deleted") throw new BuildError("not_found", "Der ursprüngliche Build existiert nicht mehr.");
      if (base.ownerId !== actor.id) throw new BuildError("forbidden", "Nur der Ersteller kann neue Versionen veröffentlichen.");
      if (base.weaponExtId !== draft.tree.itemId) throw new BuildError("invalid_build", "Eine neue Version muss dieselbe Waffe verwenden.");
      buildId = base.id;
      publicId = base.publicId;
      version = base.latestVersion + 1;
      await tx
        .update(build)
        .set({ title: meta.title, purpose: meta.purpose, visibility: meta.visibility, latestVersion: version, updatedAt: sql`now()` })
        .where(eq(build.id, buildId));
    } else {
      publicId = newPublicId();
      version = 1;
      const [created] = await tx
        .insert(build)
        .values({
          publicId,
          ownerId: actor.id,
          mode: draft.mode,
          weaponExtId: draft.tree.itemId,
          title: meta.title,
          purpose: meta.purpose,
          visibility: meta.visibility,
          latestVersion: 1,
          forkedFromVersionId: draft.forkedFromVersionId,
          forkedFromLabel: draft.forkedFromLabel,
        })
        .returning({ id: build.id });
      buildId = created!.id;
    }
    await tx.insert(buildVersion).values({
      buildId,
      version,
      datasetId: ds.id,
      patchLabel: ds.patch,
      title: meta.title,
      notes: meta.notes,
      purpose: meta.purpose,
      tree: draft.tree,
      ammoExtId: draft.ammoExtId,
      partIds: evaluation.partIds,
      stats: evaluation.stats,
      procurement: evaluation.procurement,
    });
    await tx.delete(buildDraft).where(eq(buildDraft.id, draft.id));
    return { publicId, version };
  });
}

/* ------------------------------------------------------------------ */
/* Varianten und Bearbeiten                                            */
/* ------------------------------------------------------------------ */

async function versionFor(db: Database, publicId: string, version?: number) {
  const [b] = await db.select().from(build).where(eq(build.publicId, publicId));
  if (!b || b.status === "deleted") throw new BuildError("not_found", "Build nicht gefunden.");
  const [v] = await db
    .select()
    .from(buildVersion)
    .where(and(eq(buildVersion.buildId, b.id), eq(buildVersion.version, version ?? b.latestVersion)));
  if (!v) throw new BuildError("not_found", "Version nicht gefunden.");
  return { b, v };
}

/** Startet eine eigene Variante einer konkreten Version (als Entwurf). */
export async function startFork(db: Database, actor: Actor, publicId: string, version?: number): Promise<{ draftId: number }> {
  await requireActiveUser(db, actor);
  const { b, v } = await versionFor(db, publicId, version);
  if (b.status === "hidden") throw new BuildError("not_found", "Build nicht gefunden.");
  const [owner] = await db.select({ login: appUser.login }).from(appUser).where(eq(appUser.id, b.ownerId));
  const label = `„${v.title}“ v${v.version} von ${owner?.login ?? "?"}`;
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(buildDraft).where(eq(buildDraft.ownerId, actor.id));
  if (n >= LIMITS.draftsPerUser) throw new BuildError("limit_reached", `Höchstens ${LIMITS.draftsPerUser} Entwürfe. Lösche alte Entwürfe zuerst.`);
  const [d] = await db
    .insert(buildDraft)
    .values({
      ownerId: actor.id,
      mode: b.mode,
      weaponExtId: b.weaponExtId,
      title: "",
      notes: "",
      purpose: v.purpose,
      tree: v.tree,
      ammoExtId: v.ammoExtId,
      forkedFromVersionId: v.id,
      forkedFromLabel: label,
    })
    .returning({ id: buildDraft.id });
  return { draftId: d!.id };
}

/** Öffnet einen eigenen Build zum Bearbeiten; Veröffentlichen ergibt die nächste Version. */
export async function startEdit(db: Database, actor: Actor, publicId: string): Promise<{ draftId: number }> {
  await requireActiveUser(db, actor);
  const { b, v } = await versionFor(db, publicId);
  if (b.ownerId !== actor.id) throw new BuildError("forbidden", "Nur der Ersteller kann den Build bearbeiten.");
  const [existing] = await db
    .select({ id: buildDraft.id })
    .from(buildDraft)
    .where(and(eq(buildDraft.ownerId, actor.id), eq(buildDraft.baseBuildId, b.id)));
  if (existing) return { draftId: existing.id };
  const [d] = await db
    .insert(buildDraft)
    .values({ ownerId: actor.id, mode: b.mode, weaponExtId: b.weaponExtId, title: v.title, notes: v.notes, purpose: v.purpose, tree: v.tree, ammoExtId: v.ammoExtId, baseBuildId: b.id })
    .returning({ id: buildDraft.id });
  return { draftId: d!.id };
}

/* ------------------------------------------------------------------ */
/* Lesen                                                               */
/* ------------------------------------------------------------------ */

export interface BuildView {
  publicId: string;
  owner: { id: number; login: string; displayName: string; avatarUrl: string | null };
  mode: "pvp" | "pve";
  weaponExtId: string;
  visibility: "public" | "unlisted";
  status: "published" | "hidden" | "deleted";
  latestVersion: number;
  createdAt: Date;
  updatedAt: Date;
  version: {
    id: number;
    version: number;
    datasetId: number;
    patchLabel: string | null;
    title: string;
    notes: string;
    purpose: Purpose;
    tree: BuildNode;
    ammoExtId: string | null;
    partIds: string[];
    stats: unknown;
    procurement: unknown;
    createdAt: Date;
  };
  versions: { version: number; patchLabel: string | null; createdAt: Date }[];
  forkedFrom: { label: string; publicId: string | null; version: number | null } | null;
  forkCount: number;
}

/**
 * Build für die Anzeige. Versteckte und gelöschte Builds sieht nur der Ersteller
 * (bzw. später Moderation); für alle anderen gibt es „nicht gefunden“.
 */
export async function getBuildView(db: Database, publicId: string, viewer: { id: number; role: string } | null, version?: number): Promise<BuildView> {
  if (!/^[0-9A-Za-z]{6,16}$/.test(publicId)) throw new BuildError("not_found", "Build nicht gefunden.");
  const [row] = await db
    .select({ b: build, owner: { id: appUser.id, login: appUser.login, displayName: appUser.displayName, avatarUrl: appUser.avatarUrl } })
    .from(build)
    .innerJoin(appUser, eq(appUser.id, build.ownerId))
    .where(eq(build.publicId, publicId));
  if (!row) throw new BuildError("not_found", "Build nicht gefunden.");
  const isOwner = viewer?.id === row.b.ownerId;
  const isMod = viewer?.role === "moderator" || viewer?.role === "admin";
  if (row.b.status === "deleted" || (row.b.status === "hidden" && !isOwner && !isMod)) throw new BuildError("not_found", "Build nicht gefunden.");

  const [versions, current, forkCount] = await Promise.all([
    db
      .select({ version: buildVersion.version, patchLabel: buildVersion.patchLabel, createdAt: buildVersion.createdAt })
      .from(buildVersion)
      .where(eq(buildVersion.buildId, row.b.id))
      .orderBy(desc(buildVersion.version)),
    db
      .select()
      .from(buildVersion)
      .where(and(eq(buildVersion.buildId, row.b.id), eq(buildVersion.version, version ?? row.b.latestVersion))),
    db
      .select({ n: count() })
      .from(build)
      .innerJoin(buildVersion, eq(buildVersion.id, build.forkedFromVersionId))
      .where(and(eq(buildVersion.buildId, row.b.id), eq(build.status, "published"), eq(build.visibility, "public"))),
  ]);
  const v = current[0];
  if (!v) throw new BuildError("not_found", "Version nicht gefunden.");

  let forkedFrom: BuildView["forkedFrom"] = null;
  if (row.b.forkedFromLabel) {
    const [origin] = row.b.forkedFromVersionId
      ? await db
          .select({ publicId: build.publicId, version: buildVersion.version, status: build.status })
          .from(buildVersion)
          .innerJoin(build, eq(build.id, buildVersion.buildId))
          .where(eq(buildVersion.id, row.b.forkedFromVersionId))
      : [];
    const visible = origin && origin.status === "published";
    forkedFrom = { label: row.b.forkedFromLabel, publicId: visible ? origin.publicId : null, version: visible ? origin.version : null };
  }

  return {
    publicId: row.b.publicId,
    owner: row.owner,
    mode: row.b.mode,
    weaponExtId: row.b.weaponExtId,
    visibility: row.b.visibility,
    status: row.b.status,
    latestVersion: row.b.latestVersion,
    createdAt: row.b.createdAt,
    updatedAt: row.b.updatedAt,
    version: { ...v, tree: v.tree as BuildNode, purpose: v.purpose },
    versions,
    forkedFrom,
    forkCount: forkCount[0]?.n ?? 0,
  };
}

export interface BuildListEntry {
  publicId: string;
  title: string;
  weaponExtId: string;
  mode: "pvp" | "pve";
  purpose: Purpose;
  visibility: "public" | "unlisted";
  status: "published" | "hidden" | "deleted";
  latestVersion: number;
  patchLabel: string | null;
  updatedAt: Date;
}

/** Builds eines Nutzers. Fremde sehen nur öffentliche, veröffentlichte. */
export async function listUserBuilds(db: Database, ownerId: number, viewerIsOwner: boolean): Promise<BuildListEntry[]> {
  const rows = await db
    .select({
      publicId: build.publicId,
      title: build.title,
      weaponExtId: build.weaponExtId,
      mode: build.mode,
      purpose: build.purpose,
      visibility: build.visibility,
      status: build.status,
      latestVersion: build.latestVersion,
      patchLabel: buildVersion.patchLabel,
      updatedAt: build.updatedAt,
    })
    .from(build)
    .innerJoin(buildVersion, and(eq(buildVersion.buildId, build.id), eq(buildVersion.version, build.latestVersion)))
    .where(
      and(
        eq(build.ownerId, ownerId),
        ne(build.status, "deleted"),
        viewerIsOwner ? undefined : and(eq(build.status, "published"), eq(build.visibility, "public")),
      ),
    )
    .orderBy(desc(build.updatedAt));
  return rows;
}

/* ------------------------------------------------------------------ */
/* Eigene Builds verwalten                                             */
/* ------------------------------------------------------------------ */

export async function setVisibility(db: Database, actor: Actor, publicId: string, visibility: "public" | "unlisted"): Promise<void> {
  const updated = await db
    .update(build)
    .set({ visibility, updatedAt: sql`now()` })
    .where(and(eq(build.publicId, publicId), eq(build.ownerId, actor.id), ne(build.status, "deleted")))
    .returning({ id: build.id });
  if (!updated[0]) throw new BuildError("not_found", "Build nicht gefunden.");
}

/** Löscht einen eigenen Build für alle sichtbar. Versionen bleiben, damit Varianten ihre Herkunft behalten. */
export async function deleteOwnBuild(db: Database, actor: Actor, publicId: string): Promise<void> {
  const updated = await db
    .update(build)
    .set({ status: "deleted", deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(build.publicId, publicId), eq(build.ownerId, actor.id), ne(build.status, "deleted")))
    .returning({ id: build.id });
  if (!updated[0]) throw new BuildError("not_found", "Build nicht gefunden.");
  await db.delete(buildDraft).where(and(eq(buildDraft.ownerId, actor.id), eq(buildDraft.baseBuildId, updated[0].id)));
}

/** Prüft eine veröffentlichte Version gegen einen anderen (z. B. den aktuellen) Datensatz. */
export async function checkAgainstDataset(db: Database, view: BuildView, datasetId: number, deps: Deps) {
  const data = await deps.getGameData(datasetId);
  return evaluateTree(db, data, datasetId, view.version.tree, view.version.ammoExtId);
}

