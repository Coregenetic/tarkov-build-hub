import { NextResponse, type NextRequest } from "next/server";
import { listComments } from "@tbh/builds";
import { currentUser, db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Kommentare eines Builds (zum Nachladen nach dem Schreiben). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const user = await currentUser();
  const comments = await listComments(db(), publicId, user ? { id: user.id, role: user.role } : null);
  return NextResponse.json(comments, { headers: { "Cache-Control": "no-store" } });
}
