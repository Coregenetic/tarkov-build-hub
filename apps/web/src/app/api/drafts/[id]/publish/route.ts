import type { NextRequest } from "next/server";
import { publishDraft } from "@tbh/builds";
import { parseId, readJson, withUser } from "@/lib/api";
import { buildDeps } from "@/lib/builds-server";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Entwurf veröffentlichen – verbindliche Prüfung mit der Engine auf dem Server. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(request, async (actor) => publishDraft(db(), actor, parseId(id), await readJson(request), buildDeps));
}
