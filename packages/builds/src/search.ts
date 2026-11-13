import { and, arrayContains, asc, desc, eq, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { appUser, banActiveSql, build, itemName, itemNameOverride, type Database } from "@tbh/db";
import { PURPOSES, type Purpose } from "./input.ts";

export const SORTS = ["new", "popular", "forks", "price", "ergonomics", "recoil"] as const;
export type Sort = (typeof SORTS)[number];

export const PAGE_SIZE = 24;

const hex24 = z.string().regex(/^[0-9a-f]{24}$/i);

/** Filter aus der URL. Unbekannte oder kaputte Werte werden ignoriert, nicht mit Fehler beantwortet. */
export interface SearchFilters {
  q: string;
  weapon: string | null;
  caliber: string | null;
  purpose: Purpose | null;
  /** Höchstpreis der Teile in Rubel. */
  maxPrice: number | null;
  patch: string | null;
  creator: string | null;
  /** Build enthält dieses Teil. */
  part: string | null;
  mode: "pvp" | "pve";
  sort: Sort;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;

export function parseSearchParams(params: Params): SearchFilters {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v.trim() : "";
  };
  const int = (k: string, min: number, max: number) => {
    const raw = one(k);
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const q = one("q").normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 80);
  const weapon = hex24.safeParse(one("waffe"));
  const part = hex24.safeParse(one("teil"));
  const caliber = one("kaliber");
  const purpose = one("zweck");
  const patch = one("patch");
  const creator = one("von").toLowerCase();
  const sort = one("sort");
  const mode = one("modus");
  return {
    q,
    weapon: weapon.success ? weapon.data : null,
    caliber: /^Caliber[0-9A-Za-z]{2,30}$/.test(caliber) ? caliber : null,
    purpose: (PURPOSES as readonly string[]).includes(purpose) ? (purpose as Purpose) : null,
    maxPrice: int("budget", 0, 100_000_000),
    patch: /^[0-9A-Za-z.\-_ ]{1,40}$/.test(patch) ? patch : null,
    creator: /^[a-z0-9_]{1,25}$/.test(creator) ? creator : null,
    part: part.success ? part.data : null,
    mode: mode === "pve" ? "pve" : "pvp",
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Sort) : "new",
    page: int("seite", 1, 500) ?? 1,
  };
}

/** Filter zurück in URL-Parameter (deutsche Schlüssel, nur gesetzte Werte). */
export function toSearchParams(f: Partial<SearchFilters>): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.weapon) p.set("waffe", f.weapon);
  if (f.caliber) p.set("kaliber", f.caliber);
  if (f.purpose) p.set("zweck", f.purpose);
  if (f.maxPrice != null) p.set("budget", String(f.maxPrice));
  if (f.patch) p.set("patch", f.patch);
  if (f.creator) p.set("von", f.creator);
  if (f.part) p.set("teil", f.part);
  if (f.mode === "pve") p.set("modus", "pve");
  if (f.sort && f.sort !== "new") p.set("sort", f.sort);
  if (f.page && f.page > 1) p.set("seite", String(f.page));
  return p;
}

export interface SearchHit {
  publicId: string;
  title: string;
  weaponExtId: string;
  mode: "pvp" | "pve";
  purpose: Purpose;
  patchLabel: string | null;
  caliber: string | null;
  ergonomics: number | null;
  recoilVertical: number | null;
  partsPrice: number | null;
  forkCount: number;
  likeCount: number;
  commentCount: number;
  latestVersion: number;
  createdAt: Date;
  updatedAt: Date;
  owner: { login: string; displayName: string; avatarUrl: string | null };
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  page: number;
  pages: number;
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Sucht öffentliche, veröffentlichte Builds.
 * Freitext trifft Titel, Waffennamen (deutsch und englisch, inkl. eigener Namen) und Ersteller.
 */
export async function searchBuilds(db: Database, f: SearchFilters, nameDatasetId: number | null): Promise<SearchResult> {
  const where: SQL[] = [eq(build.status, "published"), eq(build.visibility, "public"), eq(build.mode, f.mode)];
  if (f.weapon) where.push(eq(build.weaponExtId, f.weapon));
  if (f.caliber) where.push(eq(build.caliber, f.caliber));
  if (f.purpose) where.push(eq(build.purpose, f.purpose));
  if (f.maxPrice != null) where.push(lte(build.partsPrice, f.maxPrice));
  if (f.patch) where.push(eq(build.patchLabel, f.patch));
  if (f.creator) where.push(eq(appUser.login, f.creator));
  if (f.part) where.push(arrayContains(build.partIds, [f.part]));

  if (f.q) {
    const pattern = `%${escapeLike(f.q)}%`;
    const weaponIds = new Set<string>();
    if (nameDatasetId !== null) {
      // Nur Waffen, zu denen es überhaupt Builds gibt – hält die Namenssuche klein.
      const used = (await db.selectDistinct({ id: build.weaponExtId }).from(build).where(and(eq(build.status, "published"), eq(build.mode, f.mode)))).map((r) => r.id);
      if (used.length > 0) {
        const [names, overrides] = await Promise.all([
          db
            .selectDistinct({ extId: itemName.extId })
            .from(itemName)
            .where(and(eq(itemName.datasetId, nameDatasetId), inArray(itemName.extId, used), or(ilike(itemName.name, pattern), ilike(itemName.shortName, pattern)))),
          db
            .selectDistinct({ extId: itemNameOverride.extId })
            .from(itemNameOverride)
            .where(and(inArray(itemNameOverride.extId, used), ilike(itemNameOverride.value, pattern))),
        ]);
        for (const r of [...names, ...overrides]) weaponIds.add(r.extId);
      }
    }
    const textMatch = [ilike(build.title, pattern), ilike(appUser.login, pattern), ilike(appUser.displayName, pattern)];
    if (weaponIds.size > 0) textMatch.push(inArray(build.weaponExtId, [...weaponIds]));
    where.push(or(...textMatch)!);
  }

  const order = {
    new: [desc(build.createdAt), desc(build.id)],
    popular: [desc(build.likeCount), desc(build.forkCount), desc(build.createdAt)],
    forks: [desc(build.forkCount), desc(build.createdAt)],
    price: [sql`${build.partsPrice} ASC NULLS LAST`, desc(build.createdAt)],
    ergonomics: [sql`${build.ergonomics} DESC NULLS LAST`, desc(build.createdAt)],
    recoil: [sql`${build.recoilVertical} ASC NULLS LAST`, desc(build.createdAt)],
  }[f.sort];

  const condition = and(...where);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        publicId: build.publicId,
        title: build.title,
        weaponExtId: build.weaponExtId,
        mode: build.mode,
        purpose: build.purpose,
        patchLabel: build.patchLabel,
        caliber: build.caliber,
        ergonomics: build.ergonomics,
        recoilVertical: build.recoilVertical,
        partsPrice: build.partsPrice,
        forkCount: build.forkCount,
        likeCount: build.likeCount,
        commentCount: build.commentCount,
        latestVersion: build.latestVersion,
        createdAt: build.createdAt,
        updatedAt: build.updatedAt,
        login: appUser.login,
        displayName: appUser.displayName,
        avatarUrl: appUser.avatarUrl,
      })
      .from(build)
      .innerJoin(appUser, eq(appUser.id, build.ownerId))
      .where(and(condition, sql`NOT ${banActiveSql}`))
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(build)
      .innerJoin(appUser, eq(appUser.id, build.ownerId))
      .where(and(condition, sql`NOT ${banActiveSql}`)),
  ]);

  return {
    hits: rows.map(({ login, displayName, avatarUrl, ...r }) => ({ ...r, owner: { login, displayName, avatarUrl } })),
    total,
    page: f.page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Werte für die Filterauswahl: nur, was in öffentlichen Builds tatsächlich vorkommt. */
export async function searchFacets(db: Database, mode: "pvp" | "pve") {
  const base = and(eq(build.status, "published"), eq(build.visibility, "public"), eq(build.mode, mode));
  const [weapons, calibers, patches] = await Promise.all([
    db.select({ value: build.weaponExtId, n: sql<number>`count(*)::int` }).from(build).where(base).groupBy(build.weaponExtId).orderBy(desc(sql`count(*)`)),
    db.select({ value: build.caliber, n: sql<number>`count(*)::int` }).from(build).where(and(base, sql`${build.caliber} IS NOT NULL`)).groupBy(build.caliber).orderBy(asc(build.caliber)),
    db.select({ value: build.patchLabel, n: sql<number>`count(*)::int` }).from(build).where(and(base, sql`${build.patchLabel} IS NOT NULL`)).groupBy(build.patchLabel).orderBy(desc(build.patchLabel)),
  ]);
  return {
    weapons: weapons.map((w) => ({ value: w.value, count: w.n })),
    calibers: calibers.map((c) => ({ value: c.value!, count: c.n })),
    patches: patches.map((p) => ({ value: p.value!, count: p.n })),
  };
}

