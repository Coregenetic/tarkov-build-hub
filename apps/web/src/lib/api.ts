import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { BuildError, InputError, type Actor } from "@tbh/builds";
import { createRateLimiter } from "@tbh/auth";
import { baseUrl, clientIp, currentUser } from "./server";

/** Grobe Bremse gegen automatisierte Anfragen (zusätzlich zu den Grenzen im Build-Dienst). */
const limiter = createRateLimiter({ windowMs: 60_000, max: 120 });

const STATUS: Record<BuildError["code"], number> = {
  not_found: 404,
  forbidden: 403,
  banned: 403,
  no_dataset: 503,
  invalid_build: 422,
  incomplete_build: 422,
  not_a_weapon: 422,
  ammo_not_allowed: 422,
  rate_limited: 429,
  limit_reached: 409,
  reauth_required: 401,
};

/**
 * Hülle für JSON-Routen, die einen angemeldeten Nutzer brauchen:
 * Herkunft prüfen (gegen fremde Seiten), Sitzung prüfen, Fehler einheitlich beantworten.
 */
export async function withUser(request: NextRequest, handler: (actor: Actor) => Promise<unknown>): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(baseUrl(request)).origin) {
    return NextResponse.json({ error: "forbidden", message: "Ungültige Herkunft." }, { status: 403 });
  }
  if (!limiter.hit(`api:${await clientIp()}`)) {
    return NextResponse.json({ error: "rate_limited", message: "Zu viele Anfragen." }, { status: 429 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Bitte mit Twitch anmelden." }, { status: 401 });
  try {
    const result = await handler({ id: user.id, login: user.login });
    return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InputError) return NextResponse.json({ error: "invalid_input", message: error.message, field: error.field ?? null }, { status: 400 });
    if (error instanceof BuildError) return NextResponse.json({ error: error.code, message: error.message, issues: error.issues }, { status: STATUS[error.code] });
    console.error(error);
    return NextResponse.json({ error: "server_error", message: "Unerwarteter Fehler." }, { status: 500 });
  }
}

export async function readJson(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  if (text.length > 200_000) throw new InputError("Anfrage ist zu groß.");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new InputError("Ungültiges JSON.");
  }
}

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new BuildError("not_found", "Nicht gefunden.");
  return id;
}
