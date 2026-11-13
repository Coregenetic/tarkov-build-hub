import type { NextRequest } from "next/server";
import { setBookmark } from "@tbh/builds";
import { withUser } from "@/lib/api";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ publicId: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { publicId } = await params;
  return withUser(request, (actor) => setBookmark(db(), actor, publicId, true));
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { publicId } = await params;
  return withUser(request, (actor) => setBookmark(db(), actor, publicId, false));
}
