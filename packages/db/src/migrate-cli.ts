import { runMigrations } from "./migrate.ts";

/** Kommandozeile: wendet alle ausstehenden Migrationen an (DATABASE_URL aus der Umgebung). */
runMigrations()
  .then(() => console.log("Migrationen angewendet."))
  .catch((error: unknown) => {
    console.error("Migration fehlgeschlagen:", error);
    process.exitCode = 1;
  });
