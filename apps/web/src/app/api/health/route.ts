import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Für Docker-Healthcheck und Monitoring: prüft, ob die Datenbank antwortet. */
export async function GET() {
  try {
    await db().execute(sql`select 1`);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
