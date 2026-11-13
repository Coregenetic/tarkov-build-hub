import type { NextRequest } from "next/server";
import { addComment } from "@tbh/builds";
import { readJson, withUser } from "@/lib/api";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return withUser(request, async (actor) => {
    const body = (await readJson(request)) as { body?: unknown };
    return addComment(db(), actor, publicId, body.body);
  });
}
