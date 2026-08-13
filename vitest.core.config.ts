import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["tests/outlier-metrics.test.ts"],
    env: {
      YOUTUBE_API_KEY: "test-key",
      GOOGLE_PROJECT_ID: "test-project",
      GOOGLE_CLOUD_LOCATION: "us-central1",
    },
  },
});
