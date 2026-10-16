import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { JSDOM } from "jsdom";

const STORED_CONFIG = {
  backendUrl: "http://localhost:8000",
  cacheEnabled: true,
  cacheDuration: 168,
  allowInsecureUrls: false,
  supadataApiKey: "",
};

describe("Options Page API Keys section (Track 4)", () => {
  let storedConfig;

  beforeEach(() => {
    vi.resetModules();

    // Mock DOM mirroring options.html, including the Track 4 API Keys section
    document.body.innerHTML = `
      <section class="section">
        <input type="url" id="backend-url" />
        <button type="button" id="test-connection" class="secondary">Test Connection</button>
        <div id="backend-url-error" class="error-message" role="alert"></div>
        <div id="backend-url-success" class="success-message" role="status"></div>
      </section>
      <section class="section">
        <input type="checkbox" id="cache-enabled" checked />
        <input type="number" id="cache-duration" value="168" />
        <div id="cache-duration-error" class="error-message" role="alert"></div>
        <input type="checkbox" id="allow-analysis" checked />
      </section>
      <section class="section">
        <button type="button" id="clear-all-data" class="danger">Clear All Cached Data</button>
        <button type="button" id="view-privacy-policy">View Privacy Policy</button>
        <button type="button" id="revoke-consent" class="danger">Revoke Consent</button>
      </section>
      <section class="section">
        <button type="button" id="save-settings" class="primary">Save Settings</button>
        <button type="button" id="reset-defaults">Reset to Defaults</button>
        <div id="save-success" class="success-message" role="status"></div>
        <div id="save-error" class="error-message" role="alert"></div>
      </section>
      <section class="section">
        <h2 class="section-title">API Keys</h2>
        <label for="options-supadata-key">Supadata API Key</label>
        <input type="password" id="options-supadata-key" autocomplete="off" />
        <button type="button" id="options-supadata-key-toggle" class="secondary" aria-label="Show API key"><span aria-hidden="true">👁</span></button>
        <div id="options-key-help" class="label-description">
          <a href="https://supadata.ai" target="_blank" rel="noopener noreferrer">How to get a free key ↗</a>
        </div>
        <button type="button" id="options-save-keys" class="primary">Save</button>
        <p id="options-key-status" aria-live="polite"></p>
      </section>
    `;

    storedConfig = { ...STORED_CONFIG };
    chrome.storage.local.get.mockImplementation(async () =>
      storedConfig === undefined ? {} : { config: { ...storedConfig } },
    );
    chrome.storage.local.set.mockImplementation(async () => {});
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  // options.js registers a DOMContentLoaded listener without a readyState
  // fallback, and jsdom has already fired the event before the module import.
  // Capture listeners per import (vi.resetModules creates a fresh module each
  // time) and invoke only the current one so stale imports cannot attach
  // duplicate handlers to shared DOM elements.
  async function initOptions() {
    const domReadyListeners = [];
    const addEventSpy = vi
      .spyOn(document, "addEventListener")
      .mockImplementation((type, listener) => {
        if (type === "DOMContentLoaded") domReadyListeners.push(listener);
      });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../options.js");

    addEventSpy.mockRestore();
    for (const listener of domReadyListeners) {
      listener();
    }

    // The final init step logs the ConsentManager availability check; waiting
    // for it guarantees event listeners are attached before a test clicks.
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        "[Options]",
        expect.stringContaining("ConsentManager not available"),
      );
    });
    warnSpy.mockRestore();
  }

  // Logger.persistLog also writes extension_logs entries; only assertions on
  // the config payload are relevant here.
  const configSaveCalls = () =>
    chrome.storage.local.set.mock.calls.filter(
      ([items]) =>
        items && Object.prototype.hasOwnProperty.call(items, "config"),
    );

  it("adds the API Keys section markup to options.html", () => {
    const html = readFileSync(
      resolve(__dirname, "../../options.html"),
      "utf-8",
    );
    const doc = new JSDOM(html).window.document;

    const input = doc.getElementById("options-supadata-key");
    expect(input).not.toBeNull();
    expect(input.type).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("off");

    const label = doc.querySelector('label[for="options-supadata-key"]');
    expect(label).not.toBeNull();

    const toggle = doc.getElementById("options-supadata-key-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-label")).toBe("Show API key");

    const link = doc.querySelector(
      '#options-key-help a[href="https://supadata.ai"]',
    );
    expect(link).not.toBeNull();
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");

    expect(doc.getElementById("options-save-keys")).not.toBeNull();

    const status = doc.getElementById("options-key-status");
    expect(status).not.toBeNull();
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("populates the stored key on load with the input masked", async () => {
    storedConfig.supadataApiKey = "stored-key";

    await initOptions();

    const input = document.getElementById("options-supadata-key");
    expect(input.value).toBe("stored-key");
    expect(input.type).toBe("password");
  });

  it("saves the trimmed key through ConfigManager on Save click", async () => {
    await initOptions();

    const input = document.getElementById("options-supadata-key");
    input.value = "  new-key  ";
    document.getElementById("options-save-keys").click();

    await vi.waitFor(() => {
      expect(configSaveCalls().length).toBeGreaterThan(0);
    });

    const payload = configSaveCalls().at(-1)[0].config;
    expect(payload.supadataApiKey).toBe("new-key");
    expect(payload.backendUrl).toBe(STORED_CONFIG.backendUrl);
    expect(payload.cacheEnabled).toBe(STORED_CONFIG.cacheEnabled);
  });

  it("shows a Saved confirmation in the live status region", async () => {
    await initOptions();

    document.getElementById("options-supadata-key").value = "new-key";
    document.getElementById("options-save-keys").click();

    await vi.waitFor(() => {
      const status = document.getElementById("options-key-status");
      expect(status.textContent).toBe("Saved.");
      expect(status.classList.contains("visible")).toBe(true);
      expect(status.classList.contains("error-message")).toBe(false);
    });
  });

  it("shows an error message when the save fails", async () => {
    await initOptions();

    // Reject only config writes; Logger.persistLog also writes extension_logs
    chrome.storage.local.set.mockImplementation(async (items) => {
      if (items && Object.prototype.hasOwnProperty.call(items, "config")) {
        throw new Error("storage fail");
      }
    });

    document.getElementById("options-supadata-key").value = "new-key";
    document.getElementById("options-save-keys").click();

    await vi.waitFor(() => {
      const status = document.getElementById("options-key-status");
      expect(status.textContent).toContain("Failed to save API key");
      expect(status.textContent).toContain("storage fail");
      expect(status.classList.contains("visible")).toBe(true);
    });
  });

  it("toggles key visibility with an updated aria-label", async () => {
    await initOptions();

    const input = document.getElementById("options-supadata-key");
    const toggle = document.getElementById("options-supadata-key-toggle");

    expect(input.type).toBe("password");

    toggle.click();
    expect(input.type).toBe("text");
    expect(toggle.getAttribute("aria-label")).toBe("Hide API key");

    toggle.click();
    expect(input.type).toBe("password");
    expect(toggle.getAttribute("aria-label")).toBe("Show API key");
  });

  it("never logs the raw key value", async () => {
    const consoleSpies = ["log", "warn", "error"].map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    await initOptions();

    document.getElementById("options-supadata-key").value = "new-key";
    document.getElementById("options-save-keys").click();

    await vi.waitFor(() => {
      expect(configSaveCalls().length).toBeGreaterThan(0);
    });

    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain("new-key");
      }
    }
  });

  it("persists an explicitly cleared (empty) key", async () => {
    storedConfig.supadataApiKey = "old-key";

    await initOptions();

    document.getElementById("options-supadata-key").value = "   ";
    document.getElementById("options-save-keys").click();

    await vi.waitFor(() => {
      expect(configSaveCalls().length).toBeGreaterThan(0);
    });

    expect(configSaveCalls().at(-1)[0].config.supadataApiKey).toBe("");
  });

  it("preserves supadataApiKey when general settings are saved", async () => {
    storedConfig = {
      ...STORED_CONFIG,
      backendUrl: "https://api.example.com",
      supadataApiKey: "existing-key",
    };

    await initOptions();

    document.getElementById("backend-url").value = "https://api.example.org";
    document.getElementById("save-settings").click();

    await vi.waitFor(() => {
      expect(configSaveCalls().length).toBeGreaterThan(0);
    });

    const payload = configSaveCalls().at(-1)[0].config;
    expect(payload.backendUrl).toBe("https://api.example.org");
    expect(payload.supadataApiKey).toBe("existing-key");
  });

  it("prevents overlapping saves from dropping each other's changes", async () => {
    await initOptions();

    const resolvers = [];
    chrome.storage.local.get.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );

    document.getElementById("save-settings").click();

    // Second save attempt while the first is in flight must be ignored
    document.getElementById("options-supadata-key").value = "new-key";
    document.getElementById("options-save-keys").click();

    for (const resolve of resolvers) {
      resolve({ config: { ...STORED_CONFIG, supadataApiKey: "old-key" } });
    }

    await vi.waitFor(() => {
      expect(configSaveCalls().length).toBeGreaterThan(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(configSaveCalls().length).toBe(1);
    expect(configSaveCalls()[0][0].config.supadataApiKey).toBe("old-key");
  });
});
