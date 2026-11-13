import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_AREAS, BuildError, listAudit, type AuditArea } from "@tbh/builds";
import { currentUser, db, isStaff } from "@/lib/server";

export const dynamic = "force-dynamic";

/** CSV-Zelle: Anführungszeichen verdoppeln; Formel-Zeichen am Anfang entschärfen (Tabellenprogramme). */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Protokoll als CSV (höchstens 5000 neueste Einträge des Bereichs). Nur für Admins. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user || !isStaff(user)) return new NextResponse("Nicht gefunden", { status: 404 });
  const raw = request.nextUrl.searchParams.get("bereich") ?? "";
  const area = (Object.hasOwn(AUDIT_AREAS, raw) ? raw : null) as AuditArea | null;
  try {
    const { rows } = await listAudit(db(), { id: user.id, login: user.login }, { area, limit: 5000 });
    const lines = [["id", "zeit", "wer", "aktion", "ziel", "details"].join(";")];
    for (const r of rows) lines.push([r.id, r.at.toISOString(), r.actor, r.action, r.target, r.details].map(cell).join(";"));
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(`\uFEFF${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="protokoll-${area ?? "alle"}-${day}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof BuildError) return new NextResponse("Nicht gefunden", { status: 404 });
    throw error;
  }
}
