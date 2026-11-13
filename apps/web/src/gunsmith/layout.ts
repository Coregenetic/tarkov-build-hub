/**
 * Aufbauansicht: ordnet die verbauten Teile einer Waffe automatisch an.
 *
 * Es gibt keine Bilder fertig zusammengebauter Waffen in den Daten. Deshalb
 * wird die Waffe „explodiert“ dargestellt: eine Achse von hinten nach vorn
 * (Schaft … Gehäuse … Lauf … Mündung … Dämpfer), darüber Optik, Spannhebel,
 * Gasblock und Anbauten, darunter Griff, Magazin, Vordergriff.
 *
 * Grundlage ist nur der technische Slot-Name (nameId) aus den Daten. Teile in
 * unbekannten Slots landen in der Reihe „Weitere Teile“ – nichts wird
 * verschwiegen oder geraten.
 */

export type Zone = "left" | "axis" | "top" | "bottom" | "extra";

export interface LayoutSlot {
  id: string;
  nameId: string;
}

export interface LayoutItem {
  /** Inventargröße in Feldern. */
  w: number;
  h: number;
  slots: readonly LayoutSlot[];
}

export interface LayoutNode {
  itemId: string;
  slots?: Readonly<Record<string, LayoutNode>>;
}

export interface LayoutBox {
  /** Pfad als Slot-IDs, "" = Waffe. */
  key: string;
  path: string[];
  zone: Zone;
  x: number;
  y: number;
  w: number;
  h: number;
  itemId: string | null;
  /** Slot dieses Kastens (null bei der Waffe). */
  slotId: string | null;
  slotNameId: string | null;
  depth: number;
}

export interface Layout {
  width: number;
  height: number;
  boxes: LayoutBox[];
  /** Höhe der Achsen-Linie (für die Hilfslinie). */
  axisY: number;
}

export interface LayoutOptions {
  /** Pixel je Inventarfeld. */
  unit?: number;
  /** Leere Slots dieser Arten als „+“-Kästen zeigen. */
  showEmpty?: (slot: LayoutSlot, parentItemId: string, context: { depth: number; parentSlotNameId: string | null }) => boolean;
  /** Platz unter jedem Kasten für die Beschriftung. */
  caption?: number;
}

const ZONE_RULES: [RegExp, Zone][] = [
  [/^mod_stock/, "left"],
  [/^mod_(reciever|barrel|muzzle|handguard)/, "axis"],
  [/^mod_(pistol_?grip|magazine|foregrip|launcher|bipod)/, "bottom"],
  [/^mod_(scope|sight|charge|gas_block|mount|tactical|flashlight|equipment|nvg)/, "top"],
];

export function zoneOf(nameId: string, parentNameId: string | null): Zone {
  const id = nameId.toLowerCase();
  // Unterer Handschutz steckt im Handschutz-Slot des Handschutzes.
  if (id.startsWith("mod_handguard") && parentNameId?.toLowerCase().startsWith("mod_handguard")) return "bottom";
  for (const [re, zone] of ZONE_RULES) if (re.test(id)) return zone;
  return "extra";
}

/** Reihenfolge entlang der Achse von hinten nach vorn. */
function axisRank(nameId: string): number {
  const id = nameId.toLowerCase();
  if (id.startsWith("mod_stock")) return 0;
  if (id.startsWith("mod_reciever")) return 1;
  if (id.startsWith("mod_gas_block")) return 2;
  if (id.startsWith("mod_handguard")) return 3;
  if (id.startsWith("mod_barrel")) return 4;
  if (id.startsWith("mod_muzzle")) return 6;
  return 5;
}

interface Pending {
  path: string[];
  zone: Zone;
  itemId: string | null;
  slot: LayoutSlot | null;
  depth: number;
  w: number;
  h: number;
  /** Nächster Vorfahr auf der Achse (Schlüssel). */
  anchor: string;
  order: number;
}

const GAP = 10;
const ROW_GAP = 14;

export function layoutBuild(root: LayoutNode, items: Readonly<Record<string, LayoutItem>>, options: LayoutOptions = {}): Layout {
  const unit = options.unit ?? 42;
  const caption = options.caption ?? 18;
  const size = (itemId: string | null, zone: Zone, isRoot: boolean) => {
    if (!itemId) return { w: 64, h: 46 };
    const it = items[itemId];
    const cw = it?.w ?? 1;
    const ch = it?.h ?? 1;
    // Inventargrößen sind klein (die M4A1-Unterschale hat 1×1), deshalb großzügige Mindestmaße.
    const maxW = isRoot ? 240 : zone === "axis" || zone === "left" ? 190 : 140;
    return {
      w: Math.max(isRoot ? 120 : 62, Math.min(maxW, cw * unit + 16)),
      h: Math.max(isRoot ? 84 : 48, Math.min(isRoot ? 120 : 100, ch * unit + 8)),
    };
  };

  const pending: Pending[] = [];
  let order = 0;
  const visit = (node: LayoutNode, path: string[], slot: LayoutSlot | null, parentNameId: string | null, depth: number, anchor: string) => {
    const isRoot = path.length === 0;
    const zone: Zone = isRoot ? "axis" : zoneOf(slot!.nameId, parentNameId);
    const key = path.join("/");
    pending.push({ path, zone, itemId: node.itemId, slot, depth, ...size(node.itemId, zone, isRoot), anchor, order: order++ });
    const nextAnchor = zone === "axis" || zone === "left" ? key : anchor;
    const def = items[node.itemId];
    const slots = [...(def?.slots ?? [])].sort((a, b) => axisRank(a.nameId) - axisRank(b.nameId));
    for (const s of slots) {
      const child = node.slots?.[s.id];
      if (child) visit(child, [...path, s.id], s, slot?.nameId ?? null, depth + 1, nextAnchor);
      else if (options.showEmpty?.(s, node.itemId, { depth: depth + 1, parentSlotNameId: slot?.nameId ?? null })) {
        const z = zoneOf(s.nameId, slot?.nameId ?? null);
        pending.push({ path: [...path, s.id], zone: z, itemId: null, slot: s, depth: depth + 1, ...size(null, z, false), anchor: nextAnchor, order: order++ });
      }
    }
    // Slots, die im Build stehen, aber am Item nicht existieren: trotzdem zeigen (die Prüfung meldet sie).
    for (const [slotId, child] of Object.entries(node.slots ?? {})) {
      if (!def?.slots.some((s) => s.id === slotId)) {
        visit(child, [...path, slotId], { id: slotId, nameId: "unknown" }, slot?.nameId ?? null, depth + 1, nextAnchor);
      }
    }
  };
  visit(root, [], null, null, 0, "");

  const boxes = new Map<string, LayoutBox>();
  const toBox = (p: Pending, x: number, y: number): LayoutBox => ({
    key: p.path.join("/"),
    path: p.path,
    zone: p.zone,
    x,
    y,
    w: p.w,
    h: p.h,
    itemId: p.itemId,
    slotId: p.slot?.id ?? null,
    slotNameId: p.slot?.nameId ?? null,
    depth: p.depth,
  });

  // 1. Achse: links die Schaft-Kette (tiefer = weiter hinten), dann Waffe und alles nach vorn in Besuchsreihenfolge.
  const left = pending.filter((p) => p.zone === "left").sort((a, b) => b.depth - a.depth || a.order - b.order);
  const axis = pending.filter((p) => p.zone === "axis").sort((a, b) => a.order - b.order);
  const axisHeight = Math.max(60, ...[...left, ...axis].map((p) => p.h));
  let x = 0;
  for (const p of [...left, ...axis]) {
    boxes.set(p.path.join("/"), toBox(p, x, (axisHeight - p.h) / 2));
    x += p.w + GAP;
  }
  const axisRight = x - GAP;

  // 2. Oben und unten: an ihrem Achsen-Vorfahren ausrichten, Reihen ohne Überlappung füllen.
  const placeRows = (list: Pending[], direction: -1 | 1) => {
    const rows: { right: number; height: number; items: { p: Pending; x: number }[] }[] = [];
    const sorted = [...list].sort((a, b) => {
      const ax = boxes.get(a.anchor);
      const bx = boxes.get(b.anchor);
      return (ax ? ax.x + ax.w / 2 : 0) - (bx ? bx.x + bx.w / 2 : 0) || a.order - b.order;
    });
    for (const p of sorted) {
      const a = boxes.get(p.anchor);
      const want = a ? a.x + a.w / 2 - p.w / 2 : 0;
      let best = -1;
      let bestShift = Infinity;
      for (let r = 0; r < rows.length; r++) {
        const shift = Math.max(want, rows[r]!.right + GAP) - want;
        if (shift <= p.w * 0.6) {
          best = r;
          break;
        }
        if (shift < bestShift) {
          bestShift = shift;
          best = r;
        }
      }
      if (best === -1 || (bestShift !== Infinity && rows.length < 3 && bestShift > p.w * 0.6)) {
        rows.push({ right: -Infinity, height: 0, items: [] });
        best = rows.length - 1;
      }
      const row = rows[best]!;
      const px = Math.max(want, row.right + GAP);
      row.items.push({ p, x: px });
      row.right = px + p.w;
      row.height = Math.max(row.height, p.h);
    }
    let offset = direction === -1 ? -ROW_GAP : axisHeight + caption + ROW_GAP;
    for (const row of rows) {
      const rowTop = direction === -1 ? offset - caption - row.height : offset;
      for (const { p, x: px } of row.items) boxes.set(p.path.join("/"), toBox(p, px, rowTop + (row.height - p.h)));
      offset = direction === -1 ? rowTop - ROW_GAP : rowTop + row.height + caption + ROW_GAP;
    }
    return offset;
  };
  placeRows(pending.filter((p) => p.zone === "top"), -1);
  let bottomEnd = placeRows(pending.filter((p) => p.zone === "bottom"), 1);

  // 3. Weitere Teile: eigene Reihe(n) ganz unten, links beginnend.
  const extra = pending.filter((p) => p.zone === "extra");
  if (extra.length > 0) {
    let ex = 0;
    let rowH = 0;
    const maxW = Math.max(axisRight, 600);
    for (const p of extra) {
      if (ex > 0 && ex + p.w > maxW) {
        bottomEnd += rowH + caption + ROW_GAP;
        ex = 0;
        rowH = 0;
      }
      boxes.set(p.path.join("/"), toBox(p, ex, bottomEnd));
      ex += p.w + GAP;
      rowH = Math.max(rowH, p.h);
    }
  }

  // 4. Auf (0,0) verschieben.
  const all = [...boxes.values()];
  const minX = Math.min(...all.map((b) => b.x));
  const minY = Math.min(...all.map((b) => b.y));
  const pad = 8;
  for (const b of all) {
    b.x = Math.round(b.x - minX + pad);
    b.y = Math.round(b.y - minY + pad);
  }
  const width = Math.max(...all.map((b) => b.x + b.w)) + pad;
  const height = Math.max(...all.map((b) => b.y + b.h + caption)) + pad;
  return { width, height, boxes: all.sort((a, b) => a.y - b.y || a.x - b.x), axisY: Math.round(axisHeight / 2 - minY + pad) };
}

/** Überlappen zwei Kästen (inklusive Beschriftung darunter)? Für Tests und Prüfskripte. */
export function overlaps(a: LayoutBox, b: LayoutBox, caption = 18): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h + caption && b.y < a.y + a.h + caption;
}
