import type { NextRequest } from "next/server";
import { startFork } from "@tbh/builds";
import { readJson, withUser } from "@/lib/api";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Variante einer konkreten Version als eigenen Entwurf anlegen. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return withUser(request, async (actor) => {
    const body = (await readJson(request)) as { version?: unknown };
    const version = typeof body.version === "number" && Number.isInteger(body.version) && body.version > 0 ? body.version : undefined;
    return startFork(db(), actor, publicId, version);
  });
}
