/**
 * Prüft die Aufbauansicht an allen Waffen-Presets eines Datensatzes:
 * jedes Teil genau einmal, keine Überlappung, keine Teile in „Weitere Teile“.
 * Aufruf: DATABASE_URL=… pnpm tsx apps/web/scripts/verify-layout.ts <datensatz-id>
 */
import { and, eq } from "drizzle-orm";
import { assembleFromParts, type BuildNode } from "@tbh/compat-engine";
import { connect, item, itemContains, itemName, itemSlot } from "@tbh/db";
import { loadGameData } from "@tbh/game-data";
import { layoutBuild, overlaps, type LayoutItem } from "../src/gunsmith/layout.ts";

const datasetId = Number(process.argv[2]);
const { db, close } = connect();
try {
  const data = await loadGameData(db, datasetId);
  const rows = await db
    .select({ extId: item.extId, types: item.types, w: item.width, h: item.height, properties: item.properties, name: itemName.shortName })
    .from(item)
    .leftJoin(itemName, and(eq(itemName.datasetId, item.datasetId), eq(itemName.extId, item.extId), eq(itemName.lang, "en")))
    .where(eq(item.datasetId, datasetId));
  const slots = await db.select().from(itemSlot).where(eq(itemSlot.datasetId, datasetId));
  const items: Record<string, LayoutItem> = {};
  for (const r of rows) items[r.extId] = { w: r.w ?? 1, h: r.h ?? 1, slots: [] };
  for (const s of slots.sort((a, b) => a.sort - b.sort)) (items[s.itemExtId]!.slots as { id: string; nameId: string }[]).push({ id: s.slotExtId, nameId: s.nameId });
  const types = new Map(rows.map((r) => [r.extId, r.types]));
  const contains = await db.select().from(itemContains).where(eq(itemContains.datasetId, datasetId));
  const parts = new Map<string, string[]>();
  for (const c of contains.sort((a, b) => a.sort - b.sort)) {
    if (types.get(c.containedExtId)?.includes("ammo")) continue;
    parts.set(c.itemExtId, [...(parts.get(c.itemExtId) ?? []), c.containedExtId]);
  }
  let total = 0;
  let bad = 0;
  const extraSlots = new Map<string, number>();
  let maxW = 0;
  let maxH = 0;
  for (const p of rows.filter((r) => r.types.includes("preset"))) {
    const base = (p.properties as Record<string, unknown>)["baseItem"];
    if (typeof base !== "string" || !types.get(base)?.includes("gun")) continue;
    total++;
    const build = assembleFromParts(data, base, (parts.get(p.extId) ?? []).filter((id) => id !== base)).build;
    const count = (n: BuildNode): number => 1 + Object.values(n.slots ?? {}).reduce((s, c) => s + count(c), 0);
    const l = layoutBuild(build, items);
    const problems: string[] = [];
    if (l.boxes.length !== count(build)) problems.push(`Kästen ${l.boxes.length} ≠ Teile ${count(build)}`);
    for (let i = 0; i < l.boxes.length; i++)
      for (let j = i + 1; j < l.boxes.length; j++) if (overlaps(l.boxes[i]!, l.boxes[j]!)) problems.push(`Überlappung ${l.boxes[i]!.slotNameId} / ${l.boxes[j]!.slotNameId}`);
    for (const b of l.boxes) if (b.zone === "extra") extraSlots.set(b.slotNameId ?? "?", (extraSlots.get(b.slotNameId ?? "?") ?? 0) + 1);
    maxW = Math.max(maxW, l.width);
    maxH = Math.max(maxH, l.height);
    if (problems.length) {
      bad++;
      console.log(`${p.extId} ${p.name}: ${problems.slice(0, 3).join("; ")}`);
    }
  }
  console.log(`${total} Waffen-Presets · ${total - bad} ohne Problem · ${bad} mit Problem · größte Fläche ${maxW}×${maxH}`);
  console.log("Slots in „Weitere Teile“:", Object.fromEntries(extraSlots));
  if (bad > 0) process.exitCode = 2;
} finally {
  await close();
}
