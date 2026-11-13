import type { NextRequest } from "next/server";
import { listDrafts, saveDraft } from "@tbh/builds";
import { readJson, withUser } from "@/lib/api";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Eigene Entwürfe auflisten. */
export async function GET(request: NextRequest) {
  return withUser(request, async (actor) => ({ drafts: await listDrafts(db(), actor) }));
}

/** Neuen Entwurf anlegen. */
export async function POST(request: NextRequest) {
  return withUser(request, async (actor) => saveDraft(db(), actor, await readJson(request)));
}
