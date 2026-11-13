import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    testTimeout: 60_000,
    // Datenbank-Tests teilen sich eine Testdatenbank und laufen deshalb nacheinander.
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
