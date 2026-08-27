import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // GUI e2e tests, deliberately separate from `pnpm test` (vitest) — real
  // Electron windows are heavier and not part of the fast per-push suite.
  fullyParallel: false,
  reporter: "list",
});
