import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { build, buildVersion, dailyCounter, searchMiss, userActivityDay, type Database } from "@tbh/db";

/**
 * Statistik ohne Tracking-Dienst: Tageszähler und eine Zeile je aktivem Nutzer und Tag.
 * Keine IP-Adressen, keine Seitenaufrufe, keine Profile. Aktivität wird nach 90 Tagen gelöscht.
 */

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export async function bump(db: Database, key: string, n = 1, now = new Date()): Promise<void> {
  await db
    .insert(dailyCounter)
    .values({ day: dayKey(now), key, count: n })
    .onConflictDoUpdate({ target: [dailyCounter.day, dailyCounter.key], set: { count: sql`${dailyCounter.count} + ${n}` } });
}

export async function recordActivity(db: Database, userId: number, now = new Date()): Promise<void> {
  await db.insert(userActivityDay).values({ day: dayKey(now), userId }).onConflictDoNothing();
}

/** Suchbegriff ohne Treffer zählen (kleingeschrieben, höchstens 60 Zeichen). */
export async function recordSearchMiss(db: Database, query: string, now = new Date()): Promise<void> {
  const q = query.trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return;
  await db
    .insert(searchMiss)
    .values({ day: dayKey(now), query: q, count: 1 })
    .onConflictDoUpdate({ target: [searchMiss.day, searchMiss.query], set: { count: sql`${searchMiss.count} + 1` } });
}

export async function purgeOldActivity(db: Database, now = new Date()): Promise<number> {
  const cutoff = dayKey(new Date(now.getTime() - 90 * 86_400_000));
  const rows = await db.delete(userActivityDay).where(lt(userActivityDay.day, cutoff)).returning({ d: userActivityDay.day });
  await db.delete(searchMiss).where(lt(searchMiss.day, cutoff));
  return rows.length;
}

export interface StatsOverview {
  days: string[];
  newBuilds: number[];
  activeUsers: number[];
  totals: { builds: number; variants: number; comments: number; likes: number; logins: number; reports: number };
  topWeapons: { weaponExtId: string; count: number }[];
  searchMisses: { query: string; count: number }[];
}

/** Zahlen für den Admin-Bereich über die letzten `days` Tage (inklusive heute). */
export async function statsOverview(db: Database, days: number, now = new Date()): Promise<StatsOverview> {
  const list: string[] = [];
  for (let i = days - 1; i >= 0; i--) list.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
  const from = list[0]!;
  const fromDate = new Date(`${from}T00:00:00.000Z`);

  const [builds, active, counters, weapons, misses, variants] = await Promise.all([
    db
      .select({ day: sql<string>`to_char(${buildVersion.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(buildVersion)
      .where(and(eq(buildVersion.version, 1), gte(buildVersion.createdAt, fromDate)))
      .groupBy(sql`1`),
    db
      .select({ day: userActivityDay.day, n: sql<number>`count(*)::int` })
      .from(userActivityDay)
      .where(gte(userActivityDay.day, from))
      .groupBy(userActivityDay.day),
    db
      .select({ key: dailyCounter.key, n: sql<number>`sum(${dailyCounter.count})::int` })
      .from(dailyCounter)
      .where(gte(dailyCounter.day, from))
      .groupBy(dailyCounter.key),
    db
      .select({ weaponExtId: build.weaponExtId, n: sql<number>`count(*)::int` })
      .from(build)
      .where(gte(build.createdAt, fromDate))
      .groupBy(build.weaponExtId)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db
      .select({ query: searchMiss.query, n: sql<number>`sum(${searchMiss.count})::int` })
      .from(searchMiss)
      .where(gte(searchMiss.day, from))
      .groupBy(searchMiss.query)
      .orderBy(desc(sql`sum(${searchMiss.count})`))
      .limit(10),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(build)
      .where(and(gte(build.createdAt, fromDate), sql`${build.forkedFromLabel} IS NOT NULL`)),
  ]);
  const byDay = (rows: { day: string; n: number }[]) => {
    const m = new Map(rows.map((r) => [r.day, r.n]));
    return list.map((d) => m.get(d) ?? 0);
  };
  const c = new Map(counters.map((r) => [r.key, r.n]));
  const newBuilds = byDay(builds);
  return {
    days: list,
    newBuilds,
    activeUsers: byDay(active),
    totals: {
      builds: newBuilds.reduce((a, b) => a + b, 0),
      variants: variants[0]?.n ?? 0,
      comments: c.get("comments") ?? 0,
      likes: c.get("likes") ?? 0,
      logins: c.get("logins") ?? 0,
      reports: c.get("reports") ?? 0,
    },
    topWeapons: weapons.map((w) => ({ weaponExtId: w.weaponExtId, count: w.n })),
    searchMisses: misses.map((m) => ({ query: m.query, count: m.n })),
  };
}
