import type { NextRequest } from "next/server";
import { startEdit } from "@tbh/builds";
import { withUser } from "@/lib/api";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Eigenen Build bearbeiten: Entwurf für die nächste Version. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return withUser(request, async (actor) => startEdit(db(), actor, publicId));
}
