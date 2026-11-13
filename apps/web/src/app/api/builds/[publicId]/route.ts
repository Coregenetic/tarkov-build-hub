import type { NextRequest } from "next/server";
import { deleteOwnBuild, setVisibility } from "@tbh/builds";
import { InputError } from "@tbh/builds";
import { readJson, withUser } from "@/lib/api";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ publicId: string }> };

/** Sichtbarkeit ändern (nur Ersteller). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { publicId } = await params;
  return withUser(request, async (actor) => {
    const body = (await readJson(request)) as { visibility?: unknown };
    if (body.visibility !== "public" && body.visibility !== "unlisted") throw new InputError("Sichtbarkeit muss public oder unlisted sein.");
    await setVisibility(db(), actor, publicId, body.visibility);
  });
}

/** Eigenen Build löschen. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { publicId } = await params;
  return withUser(request, async (actor) => deleteOwnBuild(db(), actor, publicId));
}
