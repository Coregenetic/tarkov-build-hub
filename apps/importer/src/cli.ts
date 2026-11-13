import os from "node:os";
import { parseArgs } from "node:util";
import { fetchTarkovDevDataset, SourceFormatError, type GameMode } from "@tbh/data-adapters";
import { banUser, setRole, unbanUser, type Role } from "@tbh/auth";
import { connect } from "@tbh/db";
import {
  activateDataset,
  discardDataset,
  getDataset,
  importDataset,
  ImportRefusedError,
  listDatasets,
  rollbackDataset,
} from "./service.ts";
import { verifyPresets } from "./verify.ts";

const HELP = `Tarkov Build Hub – Verwaltung

Befehle:
  import   --mode pvp|pve [--from-dir ORDNER] [--base-url URL] [--allow-duplicate]
           Ruft die Daten ab, prüft sie und legt sie als VORSCHAU an (noch nicht sichtbar).
  list     [--mode pvp|pve]          Alle Datensätze anzeigen
  show     <id>                      Prüfbericht eines Datensatzes anzeigen
  activate <id> --patch BEZEICHNUNG  Vorschau freigeben; bisher aktiver wird archiviert
  discard  <id>                      Vorschau verwerfen
  rollback --mode pvp|pve            Zum vorherigen Datensatz zurückkehren
  verify-presets <id>                Alle Presets mit der Kompatibilitäts-Engine prüfen

  role  <login|twitch-id> user|moderator|admin   Rolle vergeben (Nutzer muss sich einmal angemeldet haben)
  ban   <login|twitch-id> --reason TEXT          Sperren und alle Sitzungen beenden
  unban <login|twitch-id>                        Sperre aufheben

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
      reason: { type: "string" },
      "allow-duplicate": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, arg, arg2] = positionals;
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
      case "verify-presets": {
        const id = parseId(arg);
        const r = await verifyPresets(db, id);
        console.log(
          `Datensatz #${id}: ${r.total} Waffen-Presets · ${r.valid} gültig · ${r.complete} vollständig · ` +
            `${r.fullyAssembled} vollständig zusammengesetzt · ${r.problems.length} auffällig`,
        );
        console.log(`  (${r.ammoRounds} Patronen in Magazinen nicht mitgezählt, ${r.skippedNonWeapon} Nicht-Waffen-Presets übersprungen)`);
        for (const p of r.problems) {
          const codes = p.issues.map((i) => `${i.code}${i.slotNameId ? `(${i.slotNameId})` : ""}`).join(", ");
          console.log(`  ${p.presetId}  ${p.name ?? "?"}  gültig=${p.valid}  übrig=${p.leftover.length}  ${codes}`);
        }
        if (r.problems.length > 0) process.exitCode = 2;
        break;
      }
      case "role": {
        if (!arg || !["user", "moderator", "admin"].includes(arg2 ?? "")) throw new ImportRefusedError("Nutzung: role <login|twitch-id> user|moderator|admin");
        const user = await setRole(db, arg, arg2 as Role, actor);
        console.log(`${user.displayName} (${user.login}) hat jetzt die Rolle „${user.role}“.`);
        break;
      }
      case "ban": {
        if (!arg || !values.reason) throw new ImportRefusedError("Nutzung: ban <login|twitch-id> --reason TEXT");
        await banUser(db, arg, values.reason, actor);
        console.log(`${arg} ist gesperrt, alle Sitzungen wurden beendet.`);
        break;
      }
      case "unban": {
        if (!arg) throw new ImportRefusedError("Nutzung: unban <login|twitch-id>");
        await unbanUser(db, arg, actor);
        console.log(`Sperre für ${arg} aufgehoben.`);
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
  } else if (error instanceof Error && /unbekannt/.test(error.message)) {
    console.error(error.message);
  } else if (error instanceof SourceFormatError) {
    console.error(error.message);
    for (const d of error.details) console.error(`  ${d}`);
  } else {
    console.error("Unerwarteter Fehler:", error);
  }
  process.exitCode = 1;
});
