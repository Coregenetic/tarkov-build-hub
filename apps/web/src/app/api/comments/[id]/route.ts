import type { NextRequest } from "next/server";
import { deleteOwnComment, editComment } from "@tbh/builds";
import { parseId, readJson, withUser } from "@/lib/api";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(request, async (actor) => {
    const body = (await readJson(request)) as { body?: unknown };
    await editComment(db(), actor, parseId(id), body.body);
  });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(request, (actor) => deleteOwnComment(db(), actor, parseId(id)));
}
