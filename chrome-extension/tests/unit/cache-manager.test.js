/**
 * CacheManager Unit Tests
 *
 * Validates Content-Hashed Local Storage Caching (chrome.storage.local)
 * - Key schema: cache_${videoId}_${contentHash}
 * - 7-day TTL expiration
 * - 10MB LRU storage auto-eviction
 * - In-memory fallback on storage failure
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("CacheManager - Content-Hashed Caching & Eviction", () => {
  let CacheManager;
  let cacheManager;
  let mockStorage;

  beforeEach(async () => {
    mockStorage = {};

    chrome.storage.local.get.mockImplementation((keys) => {
      if (typeof keys === "string") {
        return Promise.resolve({ [keys]: mockStorage[keys] });
      }
      if (keys === null) {
        return Promise.resolve({ ...mockStorage });
      }
      if (Array.isArray(keys)) {
        const result = {};
        keys.forEach((key) => {
          if (mockStorage[key]) result[key] = mockStorage[key];
        });
        return Promise.resolve(result);
      }
      return Promise.resolve({});
    });

    chrome.storage.local.set.mockImplementation((items) => {
      Object.assign(mockStorage, items);
      return Promise.resolve();
    });

    chrome.storage.local.remove.mockImplementation((keys) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach((key) => delete mockStorage[key]);
      return Promise.resolve();
    });

    const module = await import("../../cache-manager.js");
    CacheManager = module.CacheManager || module.default;
    cacheManager = new CacheManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Content-Hashed Key Schema & Latency", () => {
    it("should generate key with schema cache_${videoId}_${contentHash}", async () => {
      const testData = {
        video_id: "abcdefghijk",
        content_hash: "hash123456",
        claims: [{ claim_text: "Sample claim" }],
      };

      await cacheManager.saveToCache("abcdefghijk", testData, "hash123456");

      expect(mockStorage["cache_abcdefghijk_hash123456"]).toBeDefined();
      expect(mockStorage["cache_abcdefghijk_hash123456"].contentHash).toBe("hash123456");
    });

    it("should return cached data in <20ms on cache hit", async () => {
      const testData = {
        video_id: "abcdefghijk",
        claims: [{ claim_text: "Fast retrieval claim" }],
      };

      await cacheManager.saveToCache("abcdefghijk", testData, "hash789");

      const startTime = performance.now();
      const result = await cacheManager.checkCache("abcdefghijk", "hash789");
      const duration = performance.now() - startTime;

      expect(result).toEqual(testData);
      expect(duration).toBeLessThan(20);
    });

    it("should lookup by videoId prefix and select the newest entry by timestamp", async () => {
      const olderData = { video_id: "12345678901", version: "old" };
      const newerData = { video_id: "12345678901", version: "new" };

      mockStorage["cache_12345678901_hash1"] = {
        schemaVersion: 1,
        timestamp: Date.now() - 10000,
        lastAccessed: Date.now() - 10000,
        contentHash: "hash1",
        data: olderData,
      };

      mockStorage["cache_12345678901_hash2"] = {
        schemaVersion: 1,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        contentHash: "hash2",
        data: newerData,
      };

      const result = await cacheManager.checkCache("12345678901");
      expect(result).toEqual(newerData);
    });

    it("should remove all hashed and unhashed keys on remove(videoId)", async () => {
      mockStorage["cache_v99"] = { data: { v: 1 } };
      mockStorage["cache_v99_hashA"] = { data: { v: 2 } };
      mockStorage["cache_v99_hashB"] = { data: { v: 3 } };
      mockStorage["cache_other"] = { data: { v: 4 } };

      await cacheManager.remove("v99");

      expect(mockStorage["cache_v99"]).toBeUndefined();
      expect(mockStorage["cache_v99_hashA"]).toBeUndefined();
      expect(mockStorage["cache_v99_hashB"]).toBeUndefined();
      expect(mockStorage["cache_other"]).toBeDefined();
    });
  });

  describe("7-Day TTL Expiration Policy", () => {
    it("should return data for entries within 7 days", async () => {
      const freshEntry = {
        schemaVersion: 1,
        timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000, // 6 days old
        lastAccessed: Date.now(),
        contentHash: "hashFresh",
        data: { video_id: "freshVideo", claims: [] },
      };

      mockStorage["cache_freshVideo_hashFresh"] = freshEntry;

      const result = await cacheManager.checkCache("freshVideo", "hashFresh");
      expect(result).toEqual(freshEntry.data);
    });

    it("should auto-evict entries older than 7 days and return null", async () => {
      const expiredEntry = {
        schemaVersion: 1,
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days old (>7 days)
        lastAccessed: Date.now() - 8 * 24 * 60 * 60 * 1000,
        contentHash: "hashExpired",
        data: { video_id: "expiredVideo", claims: [] },
      };

      mockStorage["cache_expiredVideo_hashExpired"] = expiredEntry;

      const result = await cacheManager.checkCache("expiredVideo", "hashExpired");
      expect(result).toBeNull();
      expect(mockStorage["cache_expiredVideo_hashExpired"]).toBeUndefined();
    });
  });

  describe("10MB LRU Storage Eviction Ceiling", () => {
    it("should evict oldest lastAccessed entries when total size exceeds 10MB limit", async () => {
      const now = Date.now();
      const largePayload = "x".repeat(2 * 1024 * 1024); // ~2MB string payload (~4MB UTF-16)

      // Add 3 large entries (~12MB total, exceeding 10MB limit)
      for (let i = 1; i <= 3; i++) {
        const key = `cache_video${i}_hash${i}`;
        mockStorage[key] = {
          schemaVersion: 1,
          timestamp: now,
          lastAccessed: now - (10 - i) * 10000, // video1 is oldest lastAccessed
          contentHash: `hash${i}`,
          data: { video_id: `video${i}`, payload: largePayload },
        };
      }

      // Trigger eviction
      await cacheManager.evictExpiredAndLRU();

      // Oldest entry (video1) should be evicted to bring total storage under 10MB
      expect(mockStorage["cache_video1_hash1"]).toBeUndefined();
      expect(mockStorage["cache_video3_hash3"]).toBeDefined();
    });
  });

  describe("Fallback & Clearing Operations", () => {
    it("should fall back to in-memory cache when chrome.storage.local.set throws", async () => {
      chrome.storage.local.set.mockRejectedValueOnce(new Error("Storage Write Failed"));

      const testData = { video_id: "fallback123", claims: [] };
      await cacheManager.saveToCache("fallback123", testData, "hashFallback");

      chrome.storage.local.get.mockRejectedValueOnce(new Error("Storage Read Failed"));
      const retrieved = await cacheManager.checkCache("fallback123", "hashFallback");
      expect(retrieved).toEqual(testData);
    });

    it("should preserve non-entry keys like cache_metrics and cache_metadata during eviction and clear", async () => {
      mockStorage["cache_metrics"] = { totalHits: 5, totalMisses: 2 };
      mockStorage["cache_metadata"] = { schemaVersion: 1 };
      mockStorage["cache_validVideo_h1"] = {
        schemaVersion: 1,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        data: { video_id: "validVideo", claims: [] },
      };

      await cacheManager.evictExpiredAndLRU();

      expect(mockStorage["cache_metrics"]).toEqual({ totalHits: 5, totalMisses: 2 });
      expect(mockStorage["cache_metadata"]).toEqual({ schemaVersion: 1 });
      expect(mockStorage["cache_validVideo_h1"]).toBeDefined();

      await cacheManager.clear();

      expect(mockStorage["cache_metrics"]).toEqual({ totalHits: 5, totalMisses: 2 });
      expect(mockStorage["cache_metadata"]).toEqual({ schemaVersion: 1 });
      expect(mockStorage["cache_validVideo_h1"]).toBeUndefined();
    });
  });
});
