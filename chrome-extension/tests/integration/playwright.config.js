import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "**/*.spec.js",
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Extensions usually need to run sequentially or with careful isolation
  reporter: "html",
  use: {
    trace: "on-first-retry",
    headless: false,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
