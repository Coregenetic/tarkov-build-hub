import type { MetadataRoute } from "next";
import { and, desc, eq } from "drizzle-orm";
import { build } from "@tbh/db";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Sitemap: Übersichten und alle öffentlichen Builds (höchstens 5.000). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env["PUBLIC_BASE_URL"] ?? "http://127.0.0.1:3002";
  const rows = await db()
    .select({ publicId: build.publicId, updatedAt: build.updatedAt })
    .from(build)
    .where(and(eq(build.status, "published"), eq(build.visibility, "public")))
    .orderBy(desc(build.updatedAt))
    .limit(5000);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/builds`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/gunsmith`, changeFrequency: "weekly", priority: 0.6 },
    ...rows.map((r) => ({ url: `${base}/b/${r.publicId}`, lastModified: r.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
