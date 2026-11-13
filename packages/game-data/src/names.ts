import { and, eq, inArray } from "drizzle-orm";
import { auditLog, itemName, itemNameOverride, type Database } from "@tbh/db";

export type NameLang = "de" | "en";
export type NameField = "name" | "short_name";

export interface DisplayName {
  name: string;
  shortName: string;
  /** Original der Quelle, falls ein eigener Name gilt. */
  source: { name: string; shortName: string };
  overridden: { name: boolean; shortName: boolean };
}

export class NameOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NameOverrideError";
  }
}

/** Steuerzeichen, unsichtbare Zeichen und Richtungsumschalter (Unicode-Kategorie Cc und Cf). */
const CONTROL = /[\p{Cc}\p{Cf}]/u;

/** Prüft einen eigenen Namen: 1–200 Zeichen, keine Steuer- oder Richtungszeichen. */
export function validateOverrideValue(value: string): string {
  const v = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (v.length === 0 || v.length > 200) throw new NameOverrideError("Name muss 1 bis 200 Zeichen lang sein.");
  if (CONTROL.test(v)) throw new NameOverrideError("Name enthält unsichtbare Steuerzeichen.");
  return v;
}

export interface Actor {
  /** Anzeigename im Protokoll, z. B. Twitch-Login oder "cli:root". */
  label: string;
  userId: number | null;
}

/**
 * Anzeigenamen eines Datensatzes – eigene Namen ersetzen die der Quelle.
 * Ohne extIds werden alle Items geladen.
 */
export async function loadDisplayNames(db: Database, datasetId: number, lang: NameLang, extIds?: readonly string[]): Promise<Map<string, DisplayName>> {
  if (extIds && extIds.length === 0) return new Map();
  const [rows, overrides] = await Promise.all([
    db
      .select({ extId: itemName.extId, name: itemName.name, shortName: itemName.shortName })
      .from(itemName)
      .where(and(eq(itemName.datasetId, datasetId), eq(itemName.lang, lang), extIds ? inArray(itemName.extId, [...extIds]) : undefined)),
    db
      .select({ extId: itemNameOverride.extId, field: itemNameOverride.field, value: itemNameOverride.value })
      .from(itemNameOverride)
      .where(and(eq(itemNameOverride.lang, lang), extIds ? inArray(itemNameOverride.extId, [...extIds]) : undefined)),
  ]);
  const byItem = new Map<string, { name?: string; shortName?: string }>();
  for (const o of overrides) {
    const entry = byItem.get(o.extId) ?? {};
    if (o.field === "name") entry.name = o.value;
    else entry.shortName = o.value;
    byItem.set(o.extId, entry);
  }
  const result = new Map<string, DisplayName>();
  for (const r of rows) {
    const o = byItem.get(r.extId);
    result.set(r.extId, {
      name: o?.name ?? r.name,
      shortName: o?.shortName ?? r.shortName,
      source: { name: r.name, shortName: r.shortName },
      overridden: { name: o?.name !== undefined, shortName: o?.shortName !== undefined },
    });
  }
  return result;
}

export async function listNameOverrides(db: Database) {
  return db.select().from(itemNameOverride).orderBy(itemNameOverride.extId, itemNameOverride.lang, itemNameOverride.field);
}

/** Setzt oder ändert einen eigenen Namen. Protokolliert vorher/nachher. */
export async function setNameOverride(
  db: Database,
  input: { extId: string; lang: NameLang; field: NameField; value: string; note?: string | null; sourceValue?: string | null },
  actor: Actor,
): Promise<void> {
  const value = validateOverrideValue(input.value);
  const note = input.note?.trim() || null;
  if (note && note.length > 500) throw new NameOverrideError("Notiz ist zu lang (höchstens 500 Zeichen).");
  if (!/^[0-9a-f]{24}$/i.test(input.extId)) throw new NameOverrideError("Ungültige Item-ID.");
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ value: itemNameOverride.value })
      .from(itemNameOverride)
      .where(and(eq(itemNameOverride.extId, input.extId), eq(itemNameOverride.lang, input.lang), eq(itemNameOverride.field, input.field)))
      .for("update");
    if (before?.value === value) return;
    await tx
      .insert(itemNameOverride)
      .values({ extId: input.extId, lang: input.lang, field: input.field, value, note, sourceValue: input.sourceValue ?? null, createdBy: actor.userId })
      .onConflictDoUpdate({
        target: [itemNameOverride.extId, itemNameOverride.lang, itemNameOverride.field],
        set: { value, note, sourceValue: input.sourceValue ?? null, updatedAt: new Date() },
      });
    await tx.insert(auditLog).values({
      actor: actor.label,
      actorUserId: actor.userId,
      action: "item_name.set",
      target: `item:${input.extId}:${input.lang}:${input.field}`,
      details: { before: before?.value ?? input.sourceValue ?? null, after: value, source: input.sourceValue ?? null, note },
    });
  });
}

/** Entfernt einen eigenen Namen – danach gilt wieder die Quelle. */
export async function removeNameOverride(db: Database, input: { extId: string; lang: NameLang; field: NameField }, actor: Actor): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(itemNameOverride)
      .where(and(eq(itemNameOverride.extId, input.extId), eq(itemNameOverride.lang, input.lang), eq(itemNameOverride.field, input.field)))
      .returning({ value: itemNameOverride.value, sourceValue: itemNameOverride.sourceValue });
    const row = removed[0];
    if (!row) return false;
    await tx.insert(auditLog).values({
      actor: actor.label,
      actorUserId: actor.userId,
      action: "item_name.remove",
      target: `item:${input.extId}:${input.lang}:${input.field}`,
      details: { before: row.value, after: row.sourceValue },
    });
    return true;
  });
}
