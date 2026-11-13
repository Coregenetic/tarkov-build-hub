import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeTarkovDev, parseTranslations, SourceFormatError } from "./normalize.ts";
import type { TranslationTable } from "./normalize.ts";
import { LANGS } from "../types.ts";
import type { FetchedDataset, GameMode, Lang } from "../types.ts";

export const DEFAULT_BASE_URL = "https://json.tarkov.dev";

/** Pfadsegment der Quelle je Spielmodus. */
export const MODE_PATH: Record<GameMode, string> = { pvp: "regular", pve: "pve" };

export interface FetchOptions {
  mode: GameMode;
  baseUrl?: string;
  langs?: readonly Lang[];
  fetchImpl?: typeof fetch;
  /** Zeitlimit je Anfrage in Millisekunden. */
  timeoutMs?: number;
  /** Lokaler Ordner mit bereits geladenen Dateien (items.json, items_de.json …) statt Netzwerk. */
  fromDir?: string;
  now?: () => Date;
}

export interface FetchResult extends FetchedDataset {
  rejected: { id: string; reason: string }[];
}

async function download(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "tarkov-build-hub-importer" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error);
    throw new SourceFormatError(`Quelle nicht erreichbar: ${url} (${cause})`);
  }
  if (!response.ok) {
    throw new SourceFormatError(`Abruf fehlgeschlagen: ${url} antwortete mit HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new SourceFormatError(`${label} ist kein gültiges JSON`, [String(error)]);
  }
}

export async function fetchTarkovDevDataset(options: FetchOptions): Promise<FetchResult> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const langs = options.langs ?? LANGS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const modePath = MODE_PATH[options.mode];
  const itemsUrl = `${baseUrl}/${modePath}/items`;

  const load = async (name: string, url: string): Promise<Uint8Array> =>
    options.fromDir ? new Uint8Array(await readFile(path.join(options.fromDir, `${name}.json`))) : download(url, fetchImpl, timeoutMs);

  const itemsBytes = await load("items", itemsUrl);
  const translationBytes: Partial<Record<Lang, Uint8Array>> = {};
  const translations: Partial<Record<Lang, TranslationTable>> = {};
  for (const lang of langs) {
    const bytes = await load(`items_${lang}`, `${baseUrl}/${modePath}/items_${lang}`);
    translationBytes[lang] = bytes;
    translations[lang] = parseTranslations(parseJson(bytes, `items_${lang}`));
  }

  // Händler, Tauschangebote und Aufgaben (für die Beschaffung). Pflicht: fehlen sie, bricht der Import ab.
  const extra: Record<string, Uint8Array> = {};
  const loadExtra = async (name: string): Promise<unknown> => {
    const bytes = await load(name, `${baseUrl}/${modePath}/${name}`);
    extra[name] = bytes;
    return parseJson(bytes, name);
  };
  const loadExtraTranslations = async (base: string): Promise<Partial<Record<Lang, TranslationTable>>> => {
    const tables: Partial<Record<Lang, TranslationTable>> = {};
    for (const lang of langs) tables[lang] = parseTranslations(await loadExtra(`${base}_${lang}`));
    return tables;
  };
  const tradersJson = await loadExtra("traders");
  const traderTranslations = await loadExtraTranslations("traders");
  const bartersJson = await loadExtra("barters");
  const tasksJson = await loadExtra("tasks");
  const taskTranslations = await loadExtraTranslations("tasks");

  const hash = createHash("sha256");
  hash.update(itemsBytes);
  for (const lang of langs) {
    const bytes = translationBytes[lang];
    if (bytes) hash.update(bytes);
  }
  for (const name of Object.keys(extra).sort()) {
    const bytes = extra[name];
    if (bytes) hash.update(bytes);
  }

  const { dataset, rejected } = normalizeTarkovDev({
    mode: options.mode,
    sourceUrl: itemsUrl,
    fetchedAt: (options.now?.() ?? new Date()).toISOString(),
    itemsJson: parseJson(itemsBytes, "items"),
    translations,
    tradersJson,
    traderTranslations,
    bartersJson,
    tasksJson,
    taskTranslations,
  });

  return {
    dataset,
    raw: { items: itemsBytes, translations: translationBytes, extra },
    checksum: hash.digest("hex"),
    rejected,
  };
}
