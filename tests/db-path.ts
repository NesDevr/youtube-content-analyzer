import path from "node:path";

/**
 * One fixed throwaway database for the whole test run. It has to be a fixed
 * path rather than a random one because the Vitest config injects the URL into
 * worker processes, which cannot see anything global setup puts in `process.env`.
 */
// Prisma resolves SQLite URLs relative to prisma/schema.prisma. Keeping this
// throwaway file alongside the schema avoids a Windows schema-engine failure
// with absolute `file:C:/...` URLs.
export const TEST_DB_PATH = path.join(process.cwd(), "prisma", "test.db");
export const TEST_DATABASE_URL = "file:./test.db";
