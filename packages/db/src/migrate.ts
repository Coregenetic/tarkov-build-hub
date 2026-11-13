import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect } from "./client.ts";

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function runMigrations(databaseUrl?: string): Promise<void> {
  const { db, close } = connect(databaseUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => console.log("Migrationen angewendet."))
    .catch((error: unknown) => {
      console.error("Migration fehlgeschlagen:", error);
      process.exitCode = 1;
    });
}
