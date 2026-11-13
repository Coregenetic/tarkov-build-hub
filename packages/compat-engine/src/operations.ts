import { slotRejects, validateBuild } from "./validate.js";
import type { BuildNode, BuildPath, GameData, Issue, ItemDef } from "./types.js";

export class BuildPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildPathError";
  }
}

/** Liefert den Knoten an einem Pfad oder undefined. */
export function getNode(root: BuildNode, path: BuildPath): BuildNode | undefined {
  let node: BuildNode | undefined = root;
  for (const slotId of path) {
    node = node?.slots?.[slotId];
    if (!node) return undefined;
  }
  return node;
}

function setAt(root: BuildNode, path: BuildPath, replace: (current: BuildNode | undefined) => BuildNode | undefined): BuildNode {
  if (path.length === 0) {
    const next = replace(root);
    if (!next) throw new BuildPathError("Die Waffe selbst kann nicht entfernt werden.");
    return next;
  }
  const [head, ...rest] = path as [string, ...string[]];
  const slots = { ...(root.slots ?? {}) };
  const child = slots[head];
  if (rest.length > 0) {
    if (!child) throw new BuildPathError(`Pfad existiert nicht: ${path.join(" › ")}`);
    slots[head] = setAt(child, rest, replace);
  } else {
    const next = replace(child);
    if (next) slots[head] = next;
    else delete slots[head];
  }
  return { ...root, slots };
}

export interface ReplaceResult {
  build: BuildNode;
  /**
   * Teile, die abgenommen wurden, weil das neue Teil ihren Slot nicht hat.
   * Sie werden nie still verworfen, sondern hier gemeldet.
   */
  detached: { slotId: string; node: BuildNode }[];
}

/**
 * Setzt ein Teil in einen Slot ein (oder ersetzt das vorhandene).
 * Unterteile des alten Teils wandern in den Slot des neuen Teils mit derselben ID oder,
 * falls es die nicht gibt, mit demselben Slot-Typ (nameId, z. B. "mod_muzzle").
 * Ob sie dort passen, entscheidet danach validateBuild – sie werden markiert, nicht still entfernt.
 * Nur Unterteile ohne passenden Slot-Typ werden abgenommen und in `detached` gemeldet.
 */
export function installPart(root: BuildNode, parentPath: BuildPath, slotId: string, itemId: string, data?: GameData): ReplaceResult {
  const detached: ReplaceResult["detached"] = [];
  const build = setAt(root, [...parentPath, slotId], (current) => {
    if (!current?.slots) return { itemId };
    const newSlots = data?.getItem(itemId)?.slots;
    if (!newSlots) return { itemId, slots: current.slots };
    const oldSlots = data?.getItem(current.itemId)?.slots ?? [];
    const kept: Record<string, BuildNode> = {};
    for (const [childSlot, child] of Object.entries(current.slots)) {
      let target = newSlots.find((s) => s.id === childSlot);
      if (!target) {
        const nameId = oldSlots.find((s) => s.id === childSlot)?.nameId;
        target = nameId ? newSlots.find((s) => s.nameId === nameId && !kept[s.id]) : undefined;
      }
      if (target && !kept[target.id]) kept[target.id] = child;
      else detached.push({ slotId: childSlot, node: child });
    }
    return Object.keys(kept).length > 0 ? { itemId, slots: kept } : { itemId };
  });
  return { build, detached };
}

/** Nimmt ein Teil samt allem darunter ab. */
export function removePart(root: BuildNode, parentPath: BuildPath, slotId: string): ReplaceResult {
  let removed: BuildNode | undefined;
  const build = setAt(root, [...parentPath, slotId], (current) => {
    removed = current;
    return undefined;
  });
  return { build, detached: removed ? [{ slotId, node: removed }] : [] };
}

export interface CandidateCheck {
  itemId: string;
  fits: boolean;
  /** Probleme, die das Teil selbst verursachen würde (ohne Kinder des bisherigen Teils). */
  issues: Issue[];
}

/**
 * Bewertet Kandidaten für einen Slot: passt das Teil in den Slot und verträgt es sich
 * mit dem Rest des Builds? Für die Teile-Auswahl im Gunsmith.
 */
export function checkCandidates(
  data: GameData,
  root: BuildNode,
  parentPath: BuildPath,
  slotId: string,
  candidateIds?: Iterable<string>,
): CandidateCheck[] {
  const parent = getNode(root, parentPath);
  const parentItem = parent ? data.getItem(parent.itemId) : undefined;
  const slot = parentItem?.slots.find((s) => s.id === slotId);
  if (!slot) throw new BuildPathError(`Slot ${slotId} existiert an diesem Teil nicht.`);

  const ids = candidateIds ? [...candidateIds] : listSlotCandidates(data, slot.id, parentItem!);
  const targetPath = [...parentPath, slotId];
  const targetKey = targetPath.join("/");
  return ids.map((itemId) => {
    const trial = setAt(root, targetPath, () => ({ itemId }));
    const result = validateBuild(data, trial);
    const relevant = result.issues.filter(
      (i) =>
        i.severity === "error" &&
        (i.path.join("/") === targetKey || (i.otherPath !== null && i.otherPath.join("/") === targetKey)),
    );
    return { itemId, fits: relevant.length === 0, issues: relevant };
  });
}

/** Alle Items, die laut Slot-Filter grundsätzlich in diesen Slot dürfen. */
export function listSlotCandidates(data: GameData, slotId: string, parentItem: ItemDef): string[] {
  const slot = parentItem.slots.find((s) => s.id === slotId);
  if (!slot) return [];
  const out = new Set<string>();
  for (const id of slot.allowedItems) {
    const item = data.getItem(id);
    if (item && !slotRejects(slot, item)) out.add(id);
  }
  if (slot.allowedCategories.size > 0) {
    for (const item of data.items()) if (!slotRejects(slot, item)) out.add(item.id);
  }
  return [...out].sort();
}

export interface AssemblyResult {
  build: BuildNode;
  /** Teile, für die kein passender freier Slot gefunden wurde. */
  leftover: string[];
}

/**
 * Baut aus einer flachen Teileliste (z. B. einem Preset) einen Build-Baum.
 * Sucht per Rückverfolgung eine Belegung, bei der möglichst alle Teile einen erlaubten Slot finden.
 */
export function assembleFromParts(data: GameData, rootItemId: string, partIds: readonly string[]): AssemblyResult {
  const pool = partIds.filter((id) => id !== rootItemId);
  let best: { build: BuildNode; used: number } = { build: { itemId: rootItemId }, used: -1 };
  let steps = 0;
  const MAX_STEPS = 50_000;

  // Offene Slots werden in Reihenfolge abgearbeitet; ein Slot darf leer bleiben.
  type Open = { path: BuildPath; slotId: string };
  const openSlotsOf = (itemId: string, path: BuildPath): Open[] =>
    (data.getItem(itemId)?.slots ?? []).map((s) => ({ path, slotId: s.id }));

  const search = (build: BuildNode, open: Open[], remaining: string[]): void => {
    if (++steps > MAX_STEPS) return;
    const used = pool.length - remaining.length;
    if (used > best.used) best = { build, used };
    if (remaining.length === 0 || open.length === 0) return;
    const [next, ...rest] = open as [Open, ...Open[]];
    const parent = getNode(build, next.path);
    const slot = parent ? data.getItem(parent.itemId)?.slots.find((s) => s.id === next.slotId) : undefined;
    if (slot) {
      const tried = new Set<string>();
      for (let i = 0; i < remaining.length; i++) {
        const id = remaining[i]!;
        if (tried.has(id)) continue;
        tried.add(id);
        const item = data.getItem(id);
        if (!item || slotRejects(slot, item)) continue;
        const nextBuild = setAt(build, [...next.path, next.slotId], () => ({ itemId: id }));
        const nextRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
        search(nextBuild, [...openSlotsOf(id, [...next.path, next.slotId]), ...rest], nextRemaining);
        if (best.used === pool.length) return;
      }
    }
    search(build, rest, remaining); // Slot leer lassen
  };

  search({ itemId: rootItemId }, openSlotsOf(rootItemId, []), pool);

  const placed: string[] = [];
  const collect = (n: BuildNode) => {
    placed.push(n.itemId);
    for (const c of Object.values(n.slots ?? {})) collect(c);
  };
  collect(best.build);
  const leftover = [...pool];
  for (const id of placed.slice(1)) {
    const idx = leftover.indexOf(id);
    if (idx >= 0) leftover.splice(idx, 1);
  }
  return { build: best.build, leftover };
}

export interface ModifierSums {
  ergonomics: number;
  /** Summe der Rückstoß-Modifikatoren als Anteil (−0.29 = −29 %). */
  recoilModifier: number;
  weight: number;
  price: number;
  /** Teile ohne Preis in den Daten. */
  missingPrice: number;
  partCount: number;
}

/**
 * Summiert die Modifikatoren der Anbauteile laut Quelle (ohne die Waffe selbst).
 * Das sind Summen, keine Endwerte der Waffe – die Spielformel ist hier bewusst nicht nachgebaut.
 */
export function sumModifiers(data: GameData, root: BuildNode): ModifierSums {
  const sums: ModifierSums = { ergonomics: 0, recoilModifier: 0, weight: 0, price: 0, missingPrice: 0, partCount: 0 };
  const walk = (node: BuildNode, isRoot: boolean) => {
    if (!isRoot) {
      const m = data.getItem(node.itemId)?.modifiers;
      sums.partCount++;
      sums.ergonomics += m?.ergonomics ?? 0;
      sums.recoilModifier += m?.recoilModifier ?? 0;
      sums.weight += m?.weight ?? 0;
      if (m?.price == null) sums.missingPrice++;
      else sums.price += m.price;
    }
    for (const child of Object.values(node.slots ?? {})) walk(child, false);
  };
  walk(root, true);
  sums.recoilModifier = Math.round(sums.recoilModifier * 10_000) / 10_000;
  sums.ergonomics = Math.round(sums.ergonomics * 100) / 100;
  sums.weight = Math.round(sums.weight * 1000) / 1000;
  return sums;
}
