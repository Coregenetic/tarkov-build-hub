import type { NextRequest } from "next/server";
import { deleteDraft, saveDraft } from "@tbh/builds";
import { parseId, readJson, withUser } from "@/lib/api";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(request, async (actor) => saveDraft(db(), actor, await readJson(request), parseId(id)));
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(request, async (actor) => deleteDraft(db(), actor, parseId(id)));
}
