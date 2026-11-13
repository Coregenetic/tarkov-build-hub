import type { NextRequest } from "next/server";
import { fileReport } from "@tbh/builds";
import { readJson, withUser } from "@/lib/api";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Build oder Kommentar melden. */
export async function POST(request: NextRequest) {
  return withUser(request, async (actor) => fileReport(db(), actor, (await readJson(request)) as Parameters<typeof fileReport>[2]));
}
