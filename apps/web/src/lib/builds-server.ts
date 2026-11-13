import "server-only";
import type { Deps } from "@tbh/builds";
import { getGameData } from "./gunsmith-server";

/** Abhängigkeiten des Build-Dienstes: Spieldaten aus dem Prozess-Cache. */
export const buildDeps: Deps = { getGameData };
