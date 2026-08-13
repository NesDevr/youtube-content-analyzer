import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { TEST_DB_PATH, TEST_DATABASE_URL } from "./db-path";

/**
 * Builds a throwaway SQLite database from the Prisma schema so the workspace
 * isolation tests run against real queries instead of mocks. The developer's
 * `prisma/dev.db` is never touched.
 */
export default function setup() {
  rmSync(TEST_DB_PATH, { force: true });
  mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });

  // Run the Prisma CLI through node directly: spawning `npx.cmd` fails with
  // EINVAL on Windows unless a shell is used.
  execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"),
      "db",
      "push",
      "--skip-generate",
      "--accept-data-loss",
    ],
    { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "inherit" }
  );

  return () => rmSync(TEST_DB_PATH, { force: true });
}
