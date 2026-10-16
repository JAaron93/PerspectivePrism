import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PerspectivePrismClient } from "../../client.js";

describe("T3.3: Side Panel Quota State & Error Routing (FR5, NFR5)", () => {
  let sidepanelModule;
  const sidepanelHtmlPath = path.resolve(__dirname, "../../sidepanel.html");
  const sidepanelHtml = fs.readFileSync(sidepanelHtmlPath, "utf8");

  beforeEach(() => {
    vi.resetModules();

    document.body.innerHTML = sidepanelHtml;

    chrome.runtime.onMessage.addListener.mockClear();
    chrome.runtime.sendMessage.mockClear();
    chrome.tabs.query.mockClear();
    chrome.storage.local.get.mockClear();

    // Mock storage returning an existing key so onboarding does not trigger immediately on load
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      const result = { config: { supadataApiKey: "existing-valid-key" } };
      if (callback) callback(result);
      return Promise.resolve(result);
    });

    chrome.tabs.query.mockImplementation((queryInfo, callback) => {
      const tabs = [{ id: 101, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }];
      if (callback) callback(tabs);
      return Promise.resolve(tabs);
    });

    chrome.runtime.sendMessage.mockImplementation((message) => {
      if (message.type === "GET_ANALYSIS_STATE") {
        return Promise.resolve({
          success: true,
          state: { status: "idle" },
        });
      }
      return Promise.resolve({ success: true });
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  describe("T3.3: HTML Markup & Links for #state-supadata-quota", () => {
    it("should have #state-supadata-quota container with hidden attribute by default", () => {
      const quotaContainer = document.getElementById("state-supadata-quota");
      expect(quotaContainer).not.toBeNull();
      expect(quotaContainer.classList.contains("state-container")).toBe(true);
      expect(quotaContainer.hasAttribute("hidden")).toBe(true);
    });

    it("should contain the required heading, 100/month message, and upgrade link", () => {
      const quotaContainer = document.getElementById("state-supadata-quota");
      expect(quotaContainer.textContent).toContain("Transcript Quota Reached");
      expect(quotaContainer.textContent).toContain("100 transcript fetches");

      const upgradeLink = quotaContainer.querySelector('a[href*="supadata.ai/pricing"]');
      expect(upgradeLink).not.toBeNull();
      expect(upgradeLink.getAttribute("href")).toBe("https://supadata.ai/pricing");
      expect(upgradeLink.getAttribute("target")).toBe("_blank");
      expect(upgradeLink.textContent).toContain("Upgrade Plan ↗");
    });

    it("should have a 'Change API Key' button with id #pp-quota-change-key-btn", () => {
      const changeKeyBtn = document.getElementById("pp-quota-change-key-btn");
      expect(changeKeyBtn).not.toBeNull();
      expect(changeKeyBtn.textContent.trim()).toBe("Change API Key");
    });
  });

  describe("T3.3: Client Quota Error Propagation & Retry Prevention", () => {
    it("should propagate error_code on failed status and shouldRetryError should return false", async () => {
      const client = new PerspectivePrismClient("http://localhost:8000");

      const quotaError = new Error("Monthly transcript quota reached.");
      quotaError.code = "SUPADATA_QUOTA_EXHAUSTED";
      expect(client.shouldRetryError(quotaError)).toBe(false);

      const missingKeyError = new Error("No Supadata API key provided.");
      missingKeyError.code = "SUPADATA_KEY_REQUIRED";
      expect(client.shouldRetryError(missingKeyError)).toBe(false);

      const invalidKeyError = new Error("Invalid Supadata API key.");
      invalidKeyError.code = "SUPADATA_KEY_INVALID";
      expect(client.shouldRetryError(invalidKeyError)).toBe(false);
    });

    it("should throw with err.code set to SUPADATA_QUOTA_EXHAUSTED in pollJobStatus", async () => {
      const client = new PerspectivePrismClient("http://localhost:8000");
      const controller = new AbortController();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "failed",
          error: "Monthly quota reached",
          error_code: "SUPADATA_QUOTA_EXHAUSTED",
        }),
      });

      await expect(client.pollJobStatus("job_123", controller.signal)).rejects.toMatchObject({
        message: "Monthly quota reached",
        code: "SUPADATA_QUOTA_EXHAUSTED",
      });
    });
  });

  describe("T3.3: Side Panel Quota State Routing", () => {
    it("should render #state-supadata-quota when startAnalysis receives SUPADATA_QUOTA_EXHAUSTED", async () => {
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "ANALYZE_VIDEO") {
          return Promise.resolve({
            success: false,
            error: "Supadata monthly transcript quota reached.",
            code: "SUPADATA_QUOTA_EXHAUSTED",
          });
        }
        return Promise.resolve({ success: true, state: { status: "idle" } });
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        expect(chrome.tabs.query).toHaveBeenCalled();
      });

      await sidepanelModule.startAnalysis("dQw4w9WgXcQ");

      const quotaContainer = document.getElementById("state-supadata-quota");
      expect(quotaContainer.style.display).toBe("flex");
      expect(quotaContainer.hasAttribute("hidden")).toBe(false);
      expect(document.getElementById("state-error").style.display).toBe("none");
    });

    it("should switch to #state-onboarding-key when clicking 'Change API Key'", async () => {
      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        expect(chrome.tabs.query).toHaveBeenCalled();
      });

      sidepanelModule.showState("supadata-quota");
      const quotaContainer = document.getElementById("state-supadata-quota");
      expect(quotaContainer.style.display).toBe("flex");

      const changeKeyBtn = document.getElementById("pp-quota-change-key-btn");
      changeKeyBtn.click();

      const onboardingContainer = document.getElementById("state-onboarding-key");
      expect(onboardingContainer.style.display).toBe("flex");
      expect(quotaContainer.style.display).toBe("none");
      expect(document.activeElement).toBe(document.getElementById("supadata-key-input"));
    });

    it("should transition to #state-supadata-quota when receiving background state error with SUPADATA_QUOTA_EXHAUSTED", async () => {
      let messageListener;
      chrome.runtime.onMessage.addListener.mockImplementation((listener) => {
        messageListener = listener;
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        expect(messageListener).toBeDefined();
      });

      messageListener(
        {
          type: "ANALYSIS_STATE_CHANGED",
          videoId: "dQw4w9WgXcQ",
          state: {
            status: "error",
            code: "SUPADATA_QUOTA_EXHAUSTED",
            errorMessage: "Supadata monthly transcript quota reached.",
          },
        },
        {},
        () => {}
      );

      const quotaContainer = document.getElementById("state-supadata-quota");
      expect(quotaContainer.style.display).toBe("flex");
      expect(document.getElementById("state-error").style.display).toBe("none");
    });
  });
});
