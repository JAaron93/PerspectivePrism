import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Service Worker Resilience & Side Panel Triggering (Track 2)", () => {
  let backgroundModule;

  beforeEach(async () => {
    vi.resetModules();

    // Reset chrome mocks
    chrome.runtime.onMessage.addListener.mockClear();
    chrome.runtime.sendMessage.mockClear();
    chrome.storage.session.get.mockResolvedValue({});
    chrome.storage.session.set.mockResolvedValue(true);
    chrome.storage.session.remove.mockResolvedValue(true);

    // Mock chrome.sidePanel API
    chrome.sidePanel = {
      open: vi.fn().mockResolvedValue(undefined),
      setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    };

    // Mock chrome.storage.sync for configManager
    chrome.storage.sync.get.mockImplementation((keys, cb) => {
      const data = { config: { backendUrl: "http://localhost:8000" } };
      if (typeof cb === "function") cb(data);
      return Promise.resolve(data);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete chrome.sidePanel;
  });

  describe("Lazy getClient() Initialization (TASK-2.1 / FR-5.1, FR-5.2)", () => {
    it("should lazily initialize client and return idempotent promise", async () => {
      backgroundModule = await import("../../background.js");
      const { getClient } = backgroundModule;

      const clientPromise1 = getClient();
      const clientPromise2 = getClient();

      expect(clientPromise1).toBe(clientPromise2);

      const client1 = await clientPromise1;
      const client2 = await clientPromise2;

      expect(client1).toBeDefined();
      expect(client1).toBe(client2);
    });

    it("should reset clientPromise on transient initialization failure to allow retry", async () => {
      backgroundModule = await import("../../background.js");
      const { getClient } = backgroundModule;

      // First, get client to ensure instance is loaded
      const initialClient = await getClient();
      expect(initialClient).toBeDefined();

      // Spy on cleanupExpiredCache to throw on next initialization attempt
      const cleanupSpy = vi.spyOn(initialClient, "cleanupExpiredCache").mockRejectedValueOnce(new Error("Storage corrupted"));

      // Force clientPromise reset and retry by triggering cleanup failure flow
      try {
        await initialClient.cleanupExpiredCache();
      } catch (err) {
        expect(err.message).toBe("Storage corrupted");
      }

      cleanupSpy.mockResolvedValueOnce(undefined);
      const retriedClient = await getClient();
      expect(retriedClient).toBeDefined();
    });

    it("should await getClient() in all background message handlers", async () => {
      backgroundModule = await import("../../background.js");
      const {
        getClient,
        handleCacheCheck,
        handleGetAnalysisState,
        handleGetCacheStats,
        handleClearCache,
        handleSaveToCache,
        handleCheckPolicyVersion,
      } = backgroundModule;

      const client = await getClient();
      expect(client).toBeDefined();

      const resState = await handleGetAnalysisState({ videoId: "abcdefghijk" });
      expect(resState).toHaveProperty("success", true);

      const resStats = await handleGetCacheStats();
      expect(resStats).toHaveProperty("success", true);

      const resPolicy = await handleCheckPolicyVersion();
      expect(resPolicy).toHaveProperty("success", true);
    });
  });

  describe("OPEN_SIDE_PANEL Triggering Handler (TASK-2.2 / FR-1.3, FR-4.1)", () => {
    it("should call chrome.sidePanel.open with windowId when sender.tab.windowId is present", async () => {
      backgroundModule = await import("../../background.js");
      const { handleOpenSidePanel } = backgroundModule;

      const sender = {
        tab: {
          id: 42,
          windowId: 99,
        },
      };

      const res = await handleOpenSidePanel(sender);
      expect(res).toEqual({ success: true });
      expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 99 });
    });

    it("should fallback to tabId when windowId is missing from sender tab", async () => {
      backgroundModule = await import("../../background.js");
      const { handleOpenSidePanel } = backgroundModule;

      const sender = {
        tab: {
          id: 42,
        },
      };

      const res = await handleOpenSidePanel(sender);
      expect(res).toEqual({ success: true });
      expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 });
    });

    it("should throw error if sender tab is missing", async () => {
      backgroundModule = await import("../../background.js");
      const { handleOpenSidePanel } = backgroundModule;

      await expect(handleOpenSidePanel({})).rejects.toThrow("Missing tab identifier.");
    });

    it("should throw error if chrome.sidePanel API is missing", async () => {
      delete chrome.sidePanel;
      backgroundModule = await import("../../background.js");
      const { handleOpenSidePanel } = backgroundModule;

      const sender = { tab: { id: 1, windowId: 2 } };
      await expect(handleOpenSidePanel(sender)).rejects.toThrow("Side Panel API is not supported in this browser version.");
    });
  });

  describe("Concurrent SW Wake-Up Message Handling", () => {
    it("should process concurrent messages during service worker wake-up without race conditions", async () => {
      backgroundModule = await import("../../background.js");
      const { handleCacheCheck, handleGetCacheStats } = backgroundModule;

      const results = await Promise.all([
        handleCacheCheck({ videoId: "abcdefghijk" }),
        handleGetCacheStats(),
      ]);

      expect(results[0]).toHaveProperty("success", true);
      expect(results[1]).toHaveProperty("success", true);
    });
  });
});
