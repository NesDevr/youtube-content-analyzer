import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { TEST_DB_PATH } from "./db-path";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (filename: string) => { exec(sql: string): void; close(): void };
};

/**
 * Builds a throwaway SQLite database from the Prisma schema so the workspace
 * isolation tests run against real queries instead of mocks. The developer's
 * `prisma/dev.db` is never touched.
 */
export default function setup() {
  rmSync(TEST_DB_PATH, { force: true });
  mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });

  // Prisma's Windows schema engine intermittently fails before printing an
  // error while building a fresh SQLite test database. Apply the project's
  // checked-in migrations directly instead: tests exercise the same schema the
  // app ships, without depending on that external binary.
  const database = new DatabaseSync(TEST_DB_PATH);
  const migrationsPath = path.join(process.cwd(), "prisma", "migrations");
  for (const name of readdirSync(migrationsPath).filter((name) => statSync(path.join(migrationsPath, name)).isDirectory()).sort()) {
    const file = path.join(migrationsPath, name, "migration.sql");
    try { database.exec(readFileSync(file, "utf8")); }
    catch (error) { throw new Error(`Failed applying ${name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  database.close();

  return () => rmSync(TEST_DB_PATH, { force: true });
}
