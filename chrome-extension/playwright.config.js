import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/integration",
  testMatch: "**/*.spec.js",
  use: {
    headless: false,
  },
});
