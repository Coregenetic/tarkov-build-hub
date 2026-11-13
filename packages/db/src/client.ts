import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  db: Database;
  close: () => Promise<void>;
}

export function connect(databaseUrl = process.env["DATABASE_URL"]): DbHandle {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL ist nicht gesetzt. Siehe .env.example.");
  }
  const client = postgres(databaseUrl, { max: 5, onnotice: () => undefined });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}
