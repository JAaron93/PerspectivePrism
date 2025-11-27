import { test as base, chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the extension build directory (root of chrome-extension)
const extensionPath = path.resolve(__dirname, "../../");

export const test = base.extend({
  context: async ({}, use) => {
    const pathToExtension = extensionPath;
    const context = await chromium.launchPersistentContext("", {
      headless: false, // Extensions require headed mode (or headless=new which is default in recent versions but explicit is safer for extensions)
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // Wait for extension to load
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");

    const extensionId = background.url().split("/")[2];
    await use(extensionId);
  },
});

export const expect = base.expect;
