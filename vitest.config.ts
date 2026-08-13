import { defineConfig } from "vitest/config";
import path from "node:path";
import { TEST_DATABASE_URL } from "./tests/db-path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      // Route handlers import `@/lib/env`, which throws unless these are set.
      YOUTUBE_API_KEY: "test-key",
      GOOGLE_PROJECT_ID: "test-project",
      GOOGLE_CLOUD_LOCATION: "us-central1",
    },
    // The workspace isolation tests share one SQLite file, so test files must
    // not run in parallel with each other.
    fileParallelism: false,
  },
});
