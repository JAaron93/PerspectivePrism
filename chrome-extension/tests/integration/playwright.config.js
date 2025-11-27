import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Extensions usually need to run sequentially or with careful isolation
  reporter: "html",
  use: {
    trace: "on-first-retry",
    headless: false, // Extensions only work in headed mode usually, or specific headless new
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
