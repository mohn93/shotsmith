import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { testTimeout: 120000, hookTimeout: 180000, include: ["test/**/*.test.ts"], globalSetup: ["test/global-setup.ts"] },
});
