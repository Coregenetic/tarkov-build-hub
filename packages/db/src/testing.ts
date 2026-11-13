import { sql } from "drizzle-orm";
import { connect } from "./client.ts";
import { runMigrations } from "./migrate.ts";

/**
 * Nur für Tests: leert die Datenbank vollständig und spielt alle Migrationen neu ein.
 * Bricht ab, wenn der Datenbankname nicht auf "_test" endet – Schutz vor Unfällen.
 */
export async function resetTestDatabase(url: string): Promise<void> {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`resetTestDatabase verweigert: „${name}“ ist keine Testdatenbank (Name muss auf _test enden).`);
  }
  const handle = connect(url);
  try {
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await handle.db.execute(sql`CREATE SCHEMA public`);
  } finally {
    await handle.close();
  }
  await runMigrations(url);
}
