import { z } from "zod";
import type { BuildNode } from "@tbh/compat-engine";

/** Grenzen gegen Missbrauch: echte Builds haben unter 60 Teile und wenige Ebenen. */
export const LIMITS = {
  maxNodes: 150,
  maxDepth: 14,
  titleMin: 4,
  titleMax: 80,
  notesMax: 2000,
  draftsPerUser: 50,
  publishesPerHour: 10,
} as const;

export const PURPOSES = ["allround", "cqb", "long_range", "silent", "budget"] as const;
export type Purpose = (typeof PURPOSES)[number];

const itemId = z.string().regex(/^[0-9a-f]{24}$/i, "ungültige Item-ID");

export class InputError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "InputError";
  }
}

/** Prüft die Form eines Teilebaums (nicht die Kompatibilität – das macht die Engine). */
export function parseTree(value: unknown): BuildNode {
  let count = 0;
  const walk = (node: unknown, depth: number): BuildNode => {
    if (++count > LIMITS.maxNodes) throw new InputError(`Zu viele Teile (höchstens ${LIMITS.maxNodes}).`, "tree");
    if (depth > LIMITS.maxDepth) throw new InputError("Teilebaum ist zu tief verschachtelt.", "tree");
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new InputError("Teilebaum hat ein ungültiges Format.", "tree");
    const n = node as Record<string, unknown>;
    const id = itemId.safeParse(n["itemId"]);
    if (!id.success) throw new InputError("Teilebaum enthält eine ungültige Item-ID.", "tree");
    const slots = n["slots"];
    if (slots === undefined || slots === null) return { itemId: id.data };
    if (typeof slots !== "object" || Array.isArray(slots)) throw new InputError("Teilebaum hat ein ungültiges Format.", "tree");
    const out: Record<string, BuildNode> = {};
    for (const [slotId, child] of Object.entries(slots)) {
      if (!/^[0-9a-f]{24}$/i.test(slotId)) throw new InputError("Teilebaum enthält eine ungültige Slot-ID.", "tree");
      out[slotId] = walk(child, depth + 1);
    }
    return Object.keys(out).length ? { itemId: id.data, slots: out } : { itemId: id.data };
  };
  return walk(value, 0);
}

export function collectIds(node: BuildNode, out: string[] = []): string[] {
  out.push(node.itemId);
  for (const child of Object.values(node.slots ?? {})) collectIds(child, out);
  return out;
}

const clean = (v: string) => v.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" ? "\n" : "")).trim();

export const draftInputSchema = z.object({
  mode: z.enum(["pvp", "pve"]).default("pvp"),
  title: z.string().max(200).default(""),
  notes: z.string().max(4000).default(""),
  purpose: z.enum(PURPOSES).nullable().default(null),
  tree: z.unknown(),
  ammo: itemId.nullable().default(null),
});

export interface DraftInput {
  mode: "pvp" | "pve";
  title: string;
  notes: string;
  purpose: Purpose | null;
  tree: BuildNode;
  ammo: string | null;
}

export function parseDraftInput(value: unknown): DraftInput {
  const r = draftInputSchema.safeParse(value);
  if (!r.success) throw new InputError("Entwurf hat ein ungültiges Format.");
  const title = clean(r.data.title).replace(/\s+/g, " ");
  const notes = clean(r.data.notes);
  if (title.length > LIMITS.titleMax) throw new InputError(`Titel ist zu lang (höchstens ${LIMITS.titleMax} Zeichen).`, "title");
  if (notes.length > LIMITS.notesMax) throw new InputError(`Notizen sind zu lang (höchstens ${LIMITS.notesMax} Zeichen).`, "notes");
  return { mode: r.data.mode, title, notes, purpose: r.data.purpose, tree: parseTree(r.data.tree), ammo: r.data.ammo };
}

export const publishInputSchema = z.object({
  title: z.string(),
  notes: z.string().default(""),
  purpose: z.enum(PURPOSES),
  visibility: z.enum(["public", "unlisted"]).default("public"),
});

export interface PublishInput {
  title: string;
  notes: string;
  purpose: Purpose;
  visibility: "public" | "unlisted";
}

export function parsePublishInput(value: unknown): PublishInput {
  const r = publishInputSchema.safeParse(value);
  if (!r.success) throw new InputError("Bitte Titel und Einsatzzweck angeben.");
  const title = clean(r.data.title).replace(/\s+/g, " ");
  const notes = clean(r.data.notes);
  if (title.length < LIMITS.titleMin || title.length > LIMITS.titleMax) throw new InputError(`Titel muss ${LIMITS.titleMin} bis ${LIMITS.titleMax} Zeichen lang sein.`, "title");
  if (notes.length > LIMITS.notesMax) throw new InputError(`Notizen sind zu lang (höchstens ${LIMITS.notesMax} Zeichen).`, "notes");
  return { title, notes, purpose: r.data.purpose, visibility: r.data.visibility };
}
