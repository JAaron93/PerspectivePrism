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

    // Capture console messages from pages
    context.on("page", (page) => {
      page.on("console", (msg) => {
        console.log(`[PAGE CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
      });
    });

    // Wait for service worker and pre-configure storage
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");
    
    // Capture console messages from service worker
    background.on("console", (msg) => {
      console.log(`[SW CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });

    await background.evaluate(async () => {
      await new Promise((resolve) => {
        chrome.storage.sync.set({
          consent: { given: true, policyVersion: "1.0.0" },
          config: { backendUrl: "http://localhost:8000" }
        }, resolve);
      });
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
