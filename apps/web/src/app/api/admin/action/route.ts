import type { NextRequest } from "next/server";
import {
  banUserFor,
  hardDeleteBuild,
  hideBuild,
  hideComment,
  InputError,
  purgeUserContent,
  requireFresh,
  requireRole,
  resolveReports,
  restoreBuild,
  restoreComment,
  revokeSessions,
  setUserRoleById,
  unbanUserById,
  updateSettings,
} from "@tbh/builds";
import type { GameMode } from "@tbh/data-adapters";
import { fetchTarkovDevDataset } from "@tbh/data-adapters";
import type { NameIssue } from "@tbh/data-adapters";
import { loadDisplayNames, NameOverrideError, removeNameOverride, setNameOverride } from "@tbh/game-data";
import { activateDataset, discardDataset, getDataset, importDataset, ImportRefusedError, rollbackDataset } from "@tbh/import";
import { readJson, withUser } from "@/lib/api";
import { activeDataset, invalidateWeaponBundles } from "@/lib/gunsmith-server";
import { db } from "@/lib/server";
import { invalidateSiteSettings } from "@/lib/site";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const int = (v: unknown) => {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) throw new InputError("Ungültige ID.");
  return v;
};
const mode = (v: unknown): GameMode => {
  if (v !== "pvp" && v !== "pve") throw new InputError("Modus muss pvp oder pve sein.");
  return v;
};

/** Nur ein Import gleichzeitig je Prozess. */
let importRunning = false;

/**
 * Alle Aktionen des Admin-Bereichs. Jede Aktion prüft die Rolle selbst in der Datenbank;
 * diese Route prüft zusätzlich Herkunft und Sitzung (withUser).
 */
export async function POST(request: NextRequest) {
  return withUser(request, async (actor) => {
    const body = (await readJson(request)) as Record<string, unknown>;
    const d = db();
    const staff = actor;
    try {
      switch (body["type"]) {
        case "report.resolve":
          return resolveReports(d, staff, { targetType: body["targetType"], targetId: body["targetId"], action: body["action"], reason: body["reason"] });
        case "build.hide":
          return hideBuild(d, staff, str(body["publicId"]), body["reason"]);
        case "build.restore":
          return restoreBuild(d, staff, str(body["publicId"]));
        case "build.delete":
          return hardDeleteBuild(d, staff, str(body["publicId"]), body["reason"]);
        case "comment.hide":
          return hideComment(d, staff, int(body["id"]), body["reason"]);
        case "comment.restore":
          return restoreComment(d, staff, int(body["id"]));
        case "user.role":
          return setUserRoleById(d, staff, int(body["userId"]), body["role"]);
        case "user.ban":
          return banUserFor(d, staff, int(body["userId"]), body["duration"], body["reason"]);
        case "user.unban":
          return unbanUserById(d, staff, int(body["userId"]));
        case "user.sessions":
          return { sessions: await revokeSessions(d, staff, int(body["userId"])) };
        case "user.purge":
          return purgeUserContent(d, staff, int(body["userId"]), body["reason"]);
        case "setting.update": {
          const r = await updateSettings(d, staff, { banner: body["banner"], maintenance: body["maintenance"] });
          invalidateSiteSettings();
          return r;
        }
        case "name.set": {
          await requireRole(d, staff, "admin");
          const lang = body["lang"] === "de" || body["lang"] === "en" ? body["lang"] : null;
          const field = body["field"] === "name" || body["field"] === "short_name" ? body["field"] : null;
          if (!lang || !field) throw new InputError("Sprache oder Feld ungültig.");
          await setNameOverride(d, { extId: str(body["extId"]), lang, field, value: str(body["value"]), note: str(body["note"]) || null, sourceValue: str(body["sourceValue"]) || null }, { label: staff.login, userId: staff.id });
          invalidateWeaponBundles();
          return;
        }
        case "name.remove": {
          await requireRole(d, staff, "admin");
          const lang = body["lang"] === "de" || body["lang"] === "en" ? body["lang"] : null;
          const field = body["field"] === "name" || body["field"] === "short_name" ? body["field"] : null;
          if (!lang || !field) throw new InputError("Sprache oder Feld ungültig.");
          const removed = await removeNameOverride(d, { extId: str(body["extId"]), lang, field }, { label: staff.login, userId: staff.id });
          invalidateWeaponBundles();
          return { removed };
        }
        case "name.apply_suggestions": {
          // Alle eindeutigen Vorschläge des aktiven Prüfberichts übernehmen (nur noch nicht korrigierte).
          await requireRole(d, staff, "admin");
          const lang = body["lang"] === "de" || body["lang"] === "en" ? body["lang"] : null;
          if (!lang) throw new InputError("Sprache ungültig.");
          const ds = await activeDataset("pvp");
          if (!ds) throw new InputError("Kein aktiver Datensatz.");
          const row = await getDataset(d, ds.id);
          const issues = ((row?.dataset.report as { nameIssueList?: NameIssue[] } | undefined)?.nameIssueList ?? []).filter((i) => i.lang === lang && i.suggestion);
          const names = await loadDisplayNames(d, ds.id, lang, issues.map((i) => i.itemExtId));
          let applied = 0;
          for (const i of issues.slice(0, 500)) {
            const field = i.field === "shortName" ? "short_name" : "name";
            if (names.get(i.itemExtId)?.overridden[i.field === "shortName" ? "shortName" : "name"]) continue;
            await setNameOverride(d, { extId: i.itemExtId, lang, field, value: i.suggestion!, note: "Vorschlag aus dem Prüfbericht", sourceValue: i.value }, { label: staff.login, userId: staff.id });
            applied++;
          }
          invalidateWeaponBundles();
          return { applied };
        }
        case "import.fetch": {
          await requireRole(d, staff, "admin");
          if (importRunning) throw new InputError("Ein Import läuft bereits.");
          importRunning = true;
          try {
            const fetched = await fetchTarkovDevDataset({ mode: mode(body["mode"]), ...(process.env["TARKOV_DEV_BASE_URL"] ? { baseUrl: process.env["TARKOV_DEV_BASE_URL"] } : {}) });
            const r = await importDataset(d, fetched, { actor: staff.login });
            return { datasetId: r.datasetId };
          } finally {
            importRunning = false;
          }
        }
        case "import.activate":
          await requireRole(d, staff, "admin");
          requireFresh(staff);
          return activateDataset(d, int(body["id"]), str(body["patch"]), staff.login);
        case "import.discard":
          await requireRole(d, staff, "admin");
          return discardDataset(d, int(body["id"]), staff.login);
        case "import.rollback":
          await requireRole(d, staff, "admin");
          requireFresh(staff);
          return rollbackDataset(d, mode(body["mode"]), staff.login);
        default:
          throw new InputError("Unbekannte Aktion.");
      }
    } catch (error) {
      // Fachliche Ablehnungen von Import und Namen als Eingabefehler zurückgeben (mit Grund).
      if (error instanceof ImportRefusedError || error instanceof NameOverrideError) throw new InputError(error.message);
      throw error;
    }
  });
}
