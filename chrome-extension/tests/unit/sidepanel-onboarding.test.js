import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("T3.1 & T3.2: Side Panel Onboarding Key UI & Logic", () => {
  let sidepanelModule;
  const sidepanelHtmlPath = path.resolve(__dirname, "../../sidepanel.html");
  const sidepanelHtml = fs.readFileSync(sidepanelHtmlPath, "utf8");

  beforeEach(() => {
    vi.resetModules();

    // Populate jsdom document with the actual sidepanel.html content
    document.body.innerHTML = sidepanelHtml;

    // Reset chrome mock APIs
    chrome.runtime.onMessage.addListener.mockClear();
    chrome.runtime.sendMessage.mockClear();
    chrome.tabs.query.mockClear();
    chrome.storage.local.get.mockClear();
    chrome.storage.local.set.mockClear();

    // Default tab query returns a YouTube video page
    chrome.tabs.query.mockImplementation((queryInfo, callback) => {
      const tabs = [{ id: 101, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }];
      if (callback) callback(tabs);
      return Promise.resolve(tabs);
    });

    // Default runtime message handling
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

  describe("T3.1: Side Panel HTML Markup & Accessibility (NFR5, FR2)", () => {
    it("should have #state-onboarding-key container with hidden attribute by default", () => {
      const container = document.getElementById("state-onboarding-key");
      expect(container).not.toBeNull();
      expect(container.classList.contains("state-container")).toBe(true);
      expect(container.hasAttribute("hidden")).toBe(true);
    });

    it("should contain the required heading, explanation, and steps", () => {
      const container = document.getElementById("state-onboarding-key");
      expect(container.textContent).toContain("Set Up Your Free Transcript Key");
      expect(container.textContent).toContain("100 transcript fetches per month");
      expect(container.textContent).toContain("no credit card required");

      const stepsList = container.querySelector("ol");
      expect(stepsList).not.toBeNull();
      const listItems = stepsList.querySelectorAll("li");
      expect(listItems.length).toBeGreaterThanOrEqual(3);
    });

    it("should have an accessible password input linked to a label", () => {
      const input = document.getElementById("supadata-key-input");
      expect(input).not.toBeNull();
      expect(input.getAttribute("type")).toBe("password");
      expect(input.getAttribute("autocomplete")).toBe("off");

      const label = document.querySelector('label[for="supadata-key-input"]');
      expect(label).not.toBeNull();
      expect(label.textContent.trim()).toBe("API Key");
    });

    it("should have a toggle visibility button with proper accessibility attributes", () => {
      const toggleBtn = document.getElementById("supadata-key-toggle");
      expect(toggleBtn).not.toBeNull();
      expect(toggleBtn.getAttribute("aria-label")).toBe("Show API key");
    });

    it("should have a 'Get Free Key' link pointing to supadata.ai with target='_blank' and rel='noopener'", () => {
      const container = document.getElementById("state-onboarding-key");
      const link = container.querySelector('a[href*="supadata.ai"]');
      expect(link).not.toBeNull();
      expect(link.getAttribute("href")).toBe("https://supadata.ai");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    });

    it("should have a 'Save & Continue' button and a privacy notice", () => {
      const saveBtn = document.getElementById("supadata-key-save");
      expect(saveBtn).not.toBeNull();
      expect(saveBtn.textContent.trim()).toBe("Save & Continue");

      const container = document.getElementById("state-onboarding-key");
      expect(container.textContent).toContain("stored locally on this device only");
      expect(container.textContent).toContain("never stored on our servers");
    });
  });

  describe("T3.2: Onboarding State Logic in sidepanel.js (FR2, FR3, NFR1, NFR5)", () => {
    it("should call showState('onboarding-key') on load when supadataApiKey is empty", async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { supadataApiKey: "" } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        const onboarding = document.getElementById("state-onboarding-key");
        expect(onboarding.style.display).toBe("flex");
        expect(onboarding.hasAttribute("hidden")).toBe(false);
      });

      const input = document.getElementById("supadata-key-input");
      expect(document.activeElement).toBe(input);
    });

    it("should NOT call showState('onboarding-key') when supadataApiKey is non-empty", async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { supadataApiKey: "existing-valid-key" } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        expect(chrome.tabs.query).toHaveBeenCalled();
      });

      const onboarding = document.getElementById("state-onboarding-key");
      expect(onboarding.style.display).toBe("none");
    });

    it("should toggle input type between 'password' and 'text' and update aria-label", async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { supadataApiKey: "" } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        const onboarding = document.getElementById("state-onboarding-key");
        expect(onboarding.style.display).toBe("flex");
      });

      const input = document.getElementById("supadata-key-input");
      const toggleBtn = document.getElementById("supadata-key-toggle");

      expect(input.type).toBe("password");
      expect(toggleBtn.getAttribute("aria-label")).toBe("Show API key");

      toggleBtn.click();
      expect(input.type).toBe("text");
      expect(toggleBtn.getAttribute("aria-label")).toBe("Hide API key");

      toggleBtn.click();
      expect(input.type).toBe("password");
      expect(toggleBtn.getAttribute("aria-label")).toBe("Show API key");
    });

    it("should show inline validation error and NOT save when clicking save with empty input", async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { supadataApiKey: "" } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        const onboarding = document.getElementById("state-onboarding-key");
        expect(onboarding.style.display).toBe("flex");
      });

      const input = document.getElementById("supadata-key-input");
      const saveBtn = document.getElementById("supadata-key-save");
      const errorMsg = document.getElementById("supadata-key-error");

      input.value = "   ";
      saveBtn.click();

      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(errorMsg.style.display).not.toBe("none");
      expect(errorMsg.textContent.length).toBeGreaterThan(0);
    });

    it("should save key and transition away from onboarding state when clicking save with valid input", async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { supadataApiKey: "" } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        const onboarding = document.getElementById("state-onboarding-key");
        expect(onboarding.style.display).toBe("flex");
      });

      const input = document.getElementById("supadata-key-input");
      const saveBtn = document.getElementById("supadata-key-save");

      input.value = "  supa_test_key_12345  ";
      saveBtn.click();

      await vi.waitFor(() => {
        expect(chrome.storage.local.set).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              supadataApiKey: "supa_test_key_12345",
            }),
          }),
        );
      });

      const onboarding = document.getElementById("state-onboarding-key");
      expect(onboarding.style.display).toBe("none");
    });

    it("should transition to onboarding state when analysis fails with SUPADATA_KEY_REQUIRED", async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { supadataApiKey: "bad-or-missing-key" } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });

      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "ANALYZE_VIDEO") {
          return Promise.resolve({
            success: false,
            error: "No Supadata API key provided.",
            code: "SUPADATA_KEY_REQUIRED",
          });
        }
        return Promise.resolve({ success: true, state: { status: "idle" } });
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        expect(chrome.tabs.query).toHaveBeenCalled();
      });

      await sidepanelModule.startAnalysis("dQw4w9WgXcQ");

      const onboarding = document.getElementById("state-onboarding-key");
      expect(onboarding.style.display).toBe("flex");
      expect(document.getElementById("state-error").style.display).toBe("none");
    });

    it("should trigger fresh analysis for current video when saving key instead of restoring stale error", async () => {
      let storedConfig = { supadataApiKey: "" };
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { ...storedConfig } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });
      chrome.storage.local.set.mockImplementation((items, callback) => {
        if (items.config) storedConfig = { ...items.config };
        if (callback) callback();
        return Promise.resolve();
      });

      chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        const tabs = [{ id: 101, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }];
        if (callback) callback(tabs);
        return Promise.resolve(tabs);
      });

      // Background session state simulates a prior missing key error
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "GET_ANALYSIS_STATE") {
          return Promise.resolve({
            success: true,
            state: { status: "error", code: "SUPADATA_KEY_REQUIRED" },
          });
        }
        if (message.type === "ANALYZE_VIDEO") {
          return Promise.resolve({
            success: true,
            data: { video_id: message.videoId, claims: [] },
          });
        }
        return Promise.resolve({ success: true });
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        const onboarding = document.getElementById("state-onboarding-key");
        expect(onboarding.style.display).toBe("flex");
      });

      const input = document.getElementById("supadata-key-input");
      const saveBtn = document.getElementById("supadata-key-save");

      input.value = "new-valid-supadata-key";
      saveBtn.click();

      // Verify that ANALYZE_VIDEO was dispatched for the active video with the new key
      await vi.waitFor(() => {
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "ANALYZE_VIDEO",
            videoId: "dQw4w9WgXcQ",
            supadataApiKey: "new-valid-supadata-key",
          }),
        );
      });
    });

    it("should maintain onboarding state across tab switching to a non-video tab and back when key is not configured", async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { supadataApiKey: "" } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });

      let currentActiveTabs = [{ id: 101, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }];
      chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        if (callback) callback(currentActiveTabs);
        return Promise.resolve(currentActiveTabs);
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        const onboarding = document.getElementById("state-onboarding-key");
        expect(onboarding.style.display).toBe("flex");
      });

      // 1. User opens a new tab to sign up (non-YouTube URL)
      currentActiveTabs = [{ id: 102, url: "https://supadata.ai" }];
      await sidepanelModule.checkCurrentTabState();

      // Should still show onboarding-key, NOT idle
      const onboarding = document.getElementById("state-onboarding-key");
      expect(onboarding.style.display).toBe("flex");
      expect(document.getElementById("state-idle").style.display).toBe("none");

      // 2. User switches back to YouTube video
      currentActiveTabs = [{ id: 101, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }];
      await sidepanelModule.checkCurrentTabState();

      // Should still show onboarding-key, NOT idle
      expect(onboarding.style.display).toBe("flex");
      expect(document.getElementById("state-idle").style.display).toBe("none");
    });

    it("should discard stale SUPADATA_KEY_REQUIRED error on tab update if key is now configured", async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { supadataApiKey: "configured-key-123" } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });

      // Background still holds a stale error state for this video
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "GET_ANALYSIS_STATE") {
          return Promise.resolve({
            success: true,
            state: { status: "error", code: "SUPADATA_KEY_REQUIRED", apiKey: "" },
          });
        }
        return Promise.resolve({ success: true });
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        expect(chrome.tabs.query).toHaveBeenCalled();
      });

      await sidepanelModule.checkCurrentTabState();

      // Since key is configured, stale error should be discarded and idle shown
      const onboarding = document.getElementById("state-onboarding-key");
      expect(onboarding.style.display).toBe("none");
      const idle = document.getElementById("state-idle");
      expect(idle.style.display).toBe("flex");
    });

    it("should keep onboarding form visible on tab update when key error occurred with same invalid key", async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { config: { supadataApiKey: "bad-key-xyz" } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });

      // Background holds SUPADATA_KEY_INVALID for this video with the same key
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "GET_ANALYSIS_STATE") {
          return Promise.resolve({
            success: true,
            state: {
              status: "error",
              code: "SUPADATA_KEY_INVALID",
              errorMessage: "Invalid API key provided.",
              apiKey: "bad-key-xyz",
            },
          });
        }
        return Promise.resolve({ success: true });
      });

      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        expect(chrome.tabs.query).toHaveBeenCalled();
      });

      await sidepanelModule.checkCurrentTabState();

      // Since the key has NOT changed, the onboarding form should remain visible
      const onboarding = document.getElementById("state-onboarding-key");
      expect(onboarding.style.display).toBe("flex");
      expect(document.getElementById("state-idle").style.display).toBe("none");

      // And the error message should be displayed
      const errorMsg = document.getElementById("supadata-key-error");
      expect(errorMsg.style.display).toBe("block");
      expect(errorMsg.textContent).toContain("Invalid API key");
    });
  });
});
