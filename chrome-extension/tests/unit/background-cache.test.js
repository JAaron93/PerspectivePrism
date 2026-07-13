import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Service Worker Caching Authority & Fallback", () => {
  let PerspectivePrismClient;
  let client;
  let mockStorage;

  beforeEach(async () => {
    mockStorage = {};

    // Mock chrome.storage.local
    chrome.storage.local.get.mockImplementation((keys) => {
      if (typeof keys === "string") return Promise.resolve({ [keys]: mockStorage[keys] });
      return Promise.resolve(mockStorage);
    });

    chrome.storage.local.set.mockImplementation((items) => {
      Object.assign(mockStorage, items);
      return Promise.resolve();
    });

    chrome.storage.local.remove.mockImplementation((keys) => {
      delete mockStorage[keys];
      return Promise.resolve();
    });

    // Reset chrome messaging
    chrome.runtime.sendMessage.mockClear();

    // Import the client
    const clientModule = await import("../../client.js");
    PerspectivePrismClient = clientModule.default || clientModule.PerspectivePrismClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Delegation from Non-Background Context", () => {
    beforeEach(() => {
      // Mock window object to simulate being in DOM context
      global.window = {};
    });

    afterEach(() => {
      delete global.window;
    });

    it("should delegate checkCache to Service Worker when in window context", async () => {
      client = new PerspectivePrismClient("https://api.example.com", { delegateCache: true });

      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: { video_id: "12345678901", claims: [] }
      });

      const result = await client.checkCache("12345678901");
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CHECK_CACHE",
          videoId: "12345678901"
        })
      );
      expect(result).toBeDefined();
    });

    it("should delegate saveToCache to Service Worker when in window context", async () => {
      client = new PerspectivePrismClient("https://api.example.com", { delegateCache: true });

      chrome.runtime.sendMessage.mockResolvedValue({ success: true });

      const testData = {
        video_id: "12345678901",
        claims: [
          {
            claim_text: "Test claim",
            truth_profile: {
              overall_assessment: "test",
              perspectives: {},
              bias_indicators: {
                logical_fallacies: [],
                emotional_manipulation: [],
                deception_score: 0,
              },
            },
          },
        ],
        metadata: { analyzed_at: new Date().toISOString() },
      };
      await client.saveToCache("12345678901", testData);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SAVE_TO_CACHE",
          videoId: "12345678901",
          data: testData
        })
      );
    });
  });

  describe("Fallback to In-Memory Cache on Storage Failures", () => {
    it("should fall back to in-memory cache when chrome.storage.local.set throws", async () => {
      client = new PerspectivePrismClient("https://api.example.com");

      // Force storage set to throw error (simulate quota exceeded or write failure)
      chrome.storage.local.set.mockRejectedValue(new Error("Quota Exceeded"));

      const testData = {
        video_id: "12345678901",
        claims: [
          {
            claim_text: "Test claim",
            truth_profile: {
              overall_assessment: "test",
              perspectives: {},
              bias_indicators: {
                logical_fallacies: [],
                emotional_manipulation: [],
                deception_score: 0,
              },
            },
          },
        ],
        metadata: { analyzed_at: new Date().toISOString() },
      };

      // Save should complete without throwing to the caller (it handles the failure gracefully)
      await expect(client.saveToCache("12345678901", testData)).resolves.not.toThrow();

      // Since set failed, mockStorage should not have the key
      expect(mockStorage["cache_12345678901"]).toBeUndefined();

      // Retrieve should succeed using the in-memory fallback
      // Mock local.get to also throw to ensure it is not used for retrieval
      chrome.storage.local.get.mockRejectedValue(new Error("Read error"));

      const retrieved = await client.checkCache("12345678901");
      expect(retrieved).toEqual(testData);
    });
  });
});
