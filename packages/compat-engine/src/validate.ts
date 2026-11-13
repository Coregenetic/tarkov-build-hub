import type {
  BuildNode,
  BuildPath,
  GameData,
  Issue,
  IssueCode,
  ItemDef,
  NodeReport,
  Severity,
  SlotDef,
  ValidationResult,
} from "./types.js";

interface Installed {
  path: BuildPath;
  node: BuildNode;
  item: ItemDef | undefined;
  parentItemId: string | null;
  slotId: string | null;
  slotNameId: string | null;
  report: NodeReport;
}

function makeIssue(code: IssueCode, severity: Severity, fields: Partial<Issue> & { path: BuildPath }): Issue {
  return {
    code,
    severity,
    path: fields.path,
    itemId: fields.itemId ?? null,
    slotId: fields.slotId ?? null,
    slotNameId: fields.slotNameId ?? null,
    parentItemId: fields.parentItemId ?? null,
    otherItemId: fields.otherItemId ?? null,
    otherPath: fields.otherPath ?? null,
  };
}

function hasAny(set: ReadonlySet<string>, values: readonly string[]): boolean {
  for (const v of values) if (set.has(v)) return true;
  return false;
}

/** Passt dieses Item laut Filter in den Slot? Liefert null bei Erfolg, sonst den Grund. */
export function slotRejects(slot: SlotDef, item: ItemDef): "not_allowed" | "excluded" | null {
  const allowed = slot.allowedItems.has(item.id) || hasAny(slot.allowedCategories, item.categories);
  if (!allowed) return "not_allowed";
  if (slot.excludedItems.has(item.id) || hasAny(slot.excludedCategories, item.categories)) return "excluded";
  return null;
}

function pathKey(path: BuildPath): string {
  return path.join("/");
}

/**
 * Prüft einen kompletten Build gegen einen Datensatz.
 * Reine Funktion: gleicher Build + gleiche Daten = gleiches Ergebnis, im Browser wie auf dem Server.
 */
export function validateBuild(data: GameData, root: BuildNode): ValidationResult {
  const installed: Installed[] = [];
  const issues: Issue[] = [];

  const add = (target: Installed, issue: Issue) => {
    target.report.issues.push(issue);
    issues.push(issue);
  };

  // 1. Baum ablaufen, jedes Teil gegen den Slot seines Eltern-Teils prüfen.
  const walk = (node: BuildNode, path: BuildPath, parent: Installed | null, slot: SlotDef | null, slotKey: string | null) => {
    const item = data.getItem(node.itemId);
    const entry: Installed = {
      path,
      node,
      item,
      parentItemId: parent?.node.itemId ?? null,
      slotId: slotKey,
      slotNameId: slot?.nameId ?? null,
      report: {
        path,
        itemId: node.itemId,
        parentItemId: parent?.node.itemId ?? null,
        slotId: slotKey,
        slotNameId: slot?.nameId ?? null,
        status: "ok",
        issues: [],
      },
    };
    installed.push(entry);
    const base = { path, itemId: node.itemId, slotId: slotKey, slotNameId: slot?.nameId ?? null, parentItemId: entry.parentItemId };

    if (!item) {
      add(entry, makeIssue("unknown_item", "error", base));
    } else if (parent && !parent.item) {
      add(entry, makeIssue("parent_unknown", "error", base));
    } else if (parent && !slot) {
      add(entry, makeIssue("unknown_slot", "error", base));
    } else if (slot) {
      const reason = slotRejects(slot, item);
      if (reason) add(entry, makeIssue(reason, "error", base));
    }

    for (const [childSlotId, child] of Object.entries(node.slots ?? {})) {
      const childSlot = item?.slots.find((s) => s.id === childSlotId) ?? null;
      walk(child, [...path, childSlotId], entry, childSlot, childSlotId);
    }
  };
  walk(root, [], null, null, null);

  const byPath = new Map(installed.map((i) => [pathKey(i.path), i]));
  const known = installed.filter((i): i is Installed & { item: ItemDef } => i.item !== undefined);

  // 2. Pflicht-Slots.
  for (const entry of known) {
    for (const slot of entry.item.slots) {
      if (slot.required && !entry.node.slots?.[slot.id]) {
        add(
          entry,
          makeIssue("missing_required", "incomplete", {
            path: entry.path,
            itemId: entry.node.itemId,
            slotId: slot.id,
            slotNameId: slot.nameId,
            parentItemId: entry.parentItemId,
          }),
        );
      }
    }
  }

  // 3. Konflikte zwischen allen verbauten Teilen (in beide Richtungen, die Quelle trägt sie oft nur einseitig ein).
  for (let a = 0; a < known.length; a++) {
    for (let b = a + 1; b < known.length; b++) {
      const x = known[a]!;
      const y = known[b]!;
      let code: IssueCode | null = null;
      if (x.item.conflictingItems.has(y.item.id) || y.item.conflictingItems.has(x.item.id)) code = "conflict_item";
      else if (hasAny(x.item.conflictingCategories, y.item.categories) || hasAny(y.item.conflictingCategories, x.item.categories)) {
        code = "conflict_category";
      }
      if (!code) continue;
      // Am später verbauten Teil anzeigen, das Gegenstück wird mitgenannt.
      add(
        y,
        makeIssue(code, "error", {
          path: y.path,
          itemId: y.item.id,
          slotId: y.slotId,
          slotNameId: y.slotNameId,
          parentItemId: y.parentItemId,
          otherItemId: x.item.id,
          otherPath: x.path,
        }),
      );
    }
  }

  // 4. Gesperrte Slots: ein verbautes Teil blockiert einen Slot, der trotzdem belegt ist.
  const blockers = known.filter((k) => k.item.conflictingSlotIds.size > 0);
  if (blockers.length > 0) {
    for (const entry of installed) {
      if (!entry.slotId) continue;
      for (const blocker of blockers) {
        if (blocker === entry || !blocker.item.conflictingSlotIds.has(entry.slotId)) continue;
        add(
          entry,
          makeIssue("blocked_slot", "error", {
            path: entry.path,
            itemId: entry.node.itemId,
            slotId: entry.slotId,
            slotNameId: entry.slotNameId,
            parentItemId: entry.parentItemId,
            otherItemId: blocker.item.id,
            otherPath: blocker.path,
          }),
        );
      }
    }
  }

  for (const entry of byPath.values()) {
    const report = entry.report;
    if (report.issues.some((i) => i.code === "unknown_item" || i.code === "parent_unknown")) report.status = "unknown";
    else if (report.issues.some((i) => i.severity === "error")) report.status = "error";
  }

  return {
    datasetId: data.datasetId,
    valid: !issues.some((i) => i.severity === "error"),
    complete: !issues.some((i) => i.code === "missing_required"),
    issues,
    nodes: installed.map((i) => i.report),
  };
}
