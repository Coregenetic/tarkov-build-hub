import os from "node:os";
import { parseArgs } from "node:util";
import { fetchTarkovDevDataset, SourceFormatError, type GameMode } from "@tbh/data-adapters";
import { connect } from "@tbh/db";
import {
  activateDataset,
  discardDataset,
  getDataset,
  importDataset,
  ImportRefusedError,
  listDatasets,
  rollbackDataset,
} from "./service.js";

const HELP = `Tarkov Build Hub – Spieldaten-Import

Befehle:
  import   --mode pvp|pve [--from-dir ORDNER] [--base-url URL] [--allow-duplicate]
           Ruft die Daten ab, prüft sie und legt sie als VORSCHAU an (noch nicht sichtbar).
  list     [--mode pvp|pve]          Alle Datensätze anzeigen
  show     <id>                      Prüfbericht eines Datensatzes anzeigen
  activate <id> --patch BEZEICHNUNG  Vorschau freigeben; bisher aktiver wird archiviert
  discard  <id>                      Vorschau verwerfen
  rollback --mode pvp|pve            Zum vorherigen Datensatz zurückkehren

Umgebung: DATABASE_URL (Pflicht), TARKOV_DEV_BASE_URL, TBH_ACTOR`;

function parseMode(value: string | undefined): GameMode {
  if (value === "pvp" || value === "pve") return value;
  throw new ImportRefusedError("--mode muss pvp oder pve sein.");
}

function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ImportRefusedError("Bitte eine gültige Datensatz-ID angeben.");
  return id;
}

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      mode: { type: "string" },
      "from-dir": { type: "string" },
      "base-url": { type: "string" },
      patch: { type: "string" },
      "allow-duplicate": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, arg] = positionals;
  if (!command || values.help) {
    console.log(HELP);
    return;
  }

  const actor = process.env["TBH_ACTOR"] ?? `cli:${os.userInfo().username}`;
  const { db, close } = connect();
  try {
    switch (command) {
      case "import": {
        const mode = parseMode(values.mode);
        console.log(`Rufe ${mode.toUpperCase()}-Daten ab …`);
        const fetched = await fetchTarkovDevDataset({
          mode,
          ...(values["from-dir"] ? { fromDir: values["from-dir"] } : {}),
          ...((values["base-url"] ?? process.env["TARKOV_DEV_BASE_URL"]) ? { baseUrl: (values["base-url"] ?? process.env["TARKOV_DEV_BASE_URL"])! } : {}),
        });
        const { datasetId, report } = await importDataset(db, fetched, { actor, allowDuplicate: values["allow-duplicate"] });
        console.log(`Vorschau angelegt: Datensatz #${datasetId}`);
        printReport(report);
        console.log(`\nFreigeben mit:  importer activate ${datasetId} --patch <Patch-Bezeichnung>`);
        break;
      }
      case "list": {
        const rows = await listDatasets(db, values.mode ? parseMode(values.mode) : undefined);
        if (rows.length === 0) console.log("Noch keine Datensätze.");
        for (const r of rows) {
          console.log(
            `#${r.id}  ${r.mode.padEnd(3)}  ${r.status.padEnd(9)}  ${String(r.itemCount).padStart(5)} Items  ` +
              `abgerufen ${r.fetchedAt.toISOString()}  Patch ${r.patch ?? "—"}`,
          );
        }
        break;
      }
      case "show": {
        const row = await getDataset(db, parseId(arg));
        if (!row) throw new ImportRefusedError(`Datensatz #${arg} existiert nicht.`);
        console.log(`#${row.dataset.id}  ${row.dataset.mode}  ${row.dataset.status}  Patch ${row.patch ?? "—"}`);
        console.log(`Quelle ${row.dataset.sourceUrl}  Stand ${row.dataset.sourceUpdatedAt?.toISOString() ?? "—"}`);
        printReport(row.dataset.report as Parameters<typeof printReport>[0]);
        break;
      }
      case "activate": {
        if (!values.patch) throw new ImportRefusedError("--patch fehlt.");
        const id = parseId(arg);
        await activateDataset(db, id, values.patch, actor);
        console.log(`Datensatz #${id} ist jetzt aktiv (Patch ${values.patch}).`);
        break;
      }
      case "discard": {
        const id = parseId(arg);
        await discardDataset(db, id, actor);
        console.log(`Datensatz #${id} verworfen.`);
        break;
      }
      case "rollback": {
        const result = await rollbackDataset(db, parseMode(values.mode), actor);
        console.log(`Zurückgerollt: #${result.from} archiviert, #${result.to} wieder aktiv.`);
        break;
      }
      default:
        console.log(HELP);
        process.exitCode = 1;
    }
  } finally {
    await close();
  }
}

function printReport(report: {
  itemCount: number;
  gunCount: number;
  presetCount: number;
  slotCount: number;
  allowedLinkCount: number;
  danglingAllowed: number;
  warnings: string[];
  errors: string[];
}): void {
  console.log(
    `  ${report.itemCount} Items · ${report.gunCount} Waffen · ${report.presetCount} Presets · ` +
      `${report.slotCount} Slots · ${report.allowedLinkCount} Kompatibilitäts-Verweise`,
  );
  for (const w of report.warnings) console.log(`  Warnung: ${w}`);
  for (const e of report.errors) console.log(`  Fehler: ${e}`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof ImportRefusedError) {
    console.error(error.message);
    if (error.report) printReport(error.report);
  } else if (error instanceof SourceFormatError) {
    console.error(error.message);
    for (const d of error.details) console.error(`  ${d}`);
  } else {
    console.error("Unerwarteter Fehler:", error);
  }
  process.exitCode = 1;
});
