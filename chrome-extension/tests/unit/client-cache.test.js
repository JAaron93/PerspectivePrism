/**
 * Client Cache Operations Unit Tests
 *
 * Tests cache operations in PerspectivePrismClient: checkCache, saveToCache,
 * isExpired, enforceCacheLimits, schema migration, and cleanup.
 * Target: 90% coverage
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock client.js - we'll need to set up the class properly
// For now, we'll use a simplified approach by importing and mocking dependencies

describe("PerspectivePrismClient - Cache Operations", () => {
  let client;
  let mockStorage;

  beforeEach(async () => {
    // Reset chrome.storage.local mock
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

    //  Import the client
    const clientModule = await import("../../client.js");
    const PerspectivePrismClient =
      clientModule.default || clientModule.PerspectivePrismClient;

    client = new PerspectivePrismClient("https://api.example.com");

    // Wait for recovery to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  describe("checkCache()", () => {
    it("should return null for cache miss", async () => {
      const result = await client.checkCache("abc123def45");
      expect(result).toBeNull();
    });

    it("should return data for cache hit with valid entry", async () => {
      const testData = {
        video_id: "abc123def45",
        claims: [],
        metadata: { analyzed_at: new Date().toISOString() },
      };

      const cacheEntry = {
        schemaVersion: 1,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        data: testData,
      };

      mockStorage["cache_abc123def45"] = cacheEntry;

      const result = await client.checkCache("abc123def45");
      expect(result).toEqual(testData);
    });

    it("should return null for expired entry", async () => {
      const testData = {
        video_id: "abc123def45",
        claims: [],
        metadata: { analyzed_at: new Date().toISOString() },
      };

      // Entry from 25 hours ago (expired, TTL is 24 hours)
      const cacheEntry = {
        schemaVersion: 1,
        timestamp: Date.now() - 25 * 60 * 60 * 1000,
        lastAccessed: Date.now() - 25 * 60 * 60 * 1000,
        data: testData,
      };

      mockStorage["cache_abc123def45"] = cacheEntry;

      const result = await client.checkCache("abc123def45");
      expect(result).toBeNull();

      // Should have removed expired entry
      expect(mockStorage["cache_abc123def45"]).toBeUndefined();
    });

    it("should migrate old schema versions", async () => {
      // V0 entry (no schemaVersion)
      const v0Entry = {
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        data: {
          video_id: "abc123def45",
          claims: [],
          metadata: { analyzed_at: new Date().toISOString() },
        },
      };

      mockStorage["cache_abc123def45"] = v0Entry;

      const result = await client.checkCache("abc123def45");

      // Should return migrated data
      expect(result).toBeDefined();
      expect(result.video_id).toBe("abc123def45");

      // Should have saved migrated version
      const saved = mockStorage["cache_abc123def45"];
      expect(saved.schemaVersion).toBe(1);
    });

    it("should discard future schema versions", async () => {
      const futureEntry = {
        schemaVersion: 999,
        timestamp: Date.now(),
        data: { video_id: "abc123def45" },
      };

      mockStorage["cache_abc123def45"] = futureEntry;

      const result = await client.checkCache("abc123def45");
      expect(result).toBeNull();

      // Should have removed incompatible entry
      expect(mockStorage["cache_abc123def45"]).toBeUndefined();
    });
  });

  describe("saveToCache()", () => {
    it("should store entry with correct structure", async () => {
      const testData = {
        video_id: "abc123def45",
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

      await client.saveToCache("abc123def45", testData);

      const saved = mockStorage["cache_abc123def45"];
      expect(saved).toBeDefined();
      expect(saved.data).toEqual(testData);
      expect(saved.timestamp).toBeDefined();
      expect(saved.lastAccessed).toBeDefined();
    });

    it("should add schemaVersion to entry", async () => {
      const testData = {
        video_id: "abc123def45",
        claims: [],
        metadata: { analyzed_at: new Date().toISOString() },
      };

      await client.saveToCache("abc123def45", testData);

      const saved = mockStorage["cache_abc123def45"];
      expect(saved.schemaVersion).toBe(1);
    });

    it("should reject entries > 1 MB", async () => {
      // Create a large data object
      const largeClaims = [];
      for (let i = 0; i < 10000; i++) {
        largeClaims.push({
          claim_text: "a".repeat(200),
          truth_profile: {
            overall_assessment: "test",
            perspectives: {},
            bias_indicators: {
              logical_fallacies: [],
              emotional_manipulation: [],
              deception_score: 0,
            },
          },
        });
      }

      const largeData = {
        video_id: "abc123def45",
        claims: largeClaims,
        metadata: { analyzed_at: new Date().toISOString() },
      };

      await expect(
        client.saveToCache("abc123def45", largeData),
      ).rejects.toThrow();
    });

    it("should validate data before caching", async () => {
      const invalidData = {
        // Missing video_id
        claims: [],
        metadata: { analyzed_at: new Date().toISOString() },
      };

      // Should not throw, but should not cache invalid data
      await client.saveToCache("abc123def45", invalidData);

      // Invalid data should not be cached
      expect(mockStorage["cache_abc123def45"]).toBeUndefined();
    });
  });

  describe("isExpired()", () => {
    it("should return true for expired entries", () => {
      const expiredEntry = {
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      };

      expect(client.isExpired(expiredEntry)).toBe(true);
    });

    it("should return false for fresh entries", () => {
      const freshEntry = {
        timestamp: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
      };

      expect(client.isExpired(freshEntry)).toBe(false);
    });

    it("should return true for missing timestamp", () => {
      expect(client.isExpired({})).toBe(true);
      expect(client.isExpired(null)).toBe(true);
      expect(client.isExpired(undefined)).toBe(true);
    });
  });

  describe("enforceCacheLimits()", () => {
    it("should evict oldest entries when over MAX_CACHE_ITEMS", async () => {
      // Add 51 entries (MAX is 50)
      const now = Date.now();
      for (let i = 0; i < 51; i++) {
        mockStorage[`cache_video${i}`] = {
          schemaVersion: 1,
          timestamp: now,
          lastAccessed: now - i * 1000, // Older entries have earlier lastAccessed
          data: {
            video_id: `video${i}`,
            claims: [],
            metadata: { analyzed_at: new Date().toISOString() },
          },
        };
      }

      await client.enforceCacheLimits();

      // Should have removed oldest entry (video50 has the oldest lastAccessed)
      const remaining = Object.keys(mockStorage).filter((k) =>
        k.startsWith("cache_"),
      );
      expect(remaining.length).toBe(50);
      expect(mockStorage["cache_video50"]).toBeUndefined();
    });

    it("should not evict if under limit", async () => {
      // Add 10 entries (well under limit)
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        mockStorage[`cache_video${i}`] = {
          schemaVersion: 1,
          timestamp: now,
          lastAccessed: now,
          data: {
            video_id: `video${i}`,
            claims: [],
            metadata: { analyzed_at: new Date().toISOString() },
          },
        };
      }

      await client.enforceCacheLimits();

      const remaining = Object.keys(mockStorage).filter((k) =>
        k.startsWith("cache_"),
      );
      expect(remaining.length).toBe(10);
    });
  });

  describe("clearCache()", () => {
    it("should remove all cache entries", async () => {
      // Add some cache entries
      mockStorage["cache_video1"] = { data: {} };
      mockStorage["cache_video2"] = { data: {} };
      mockStorage["other_key"] = { data: {} };

      await client.clearCache();

      // Cache entries should be removed
      expect(mockStorage["cache_video1"]).toBeUndefined();
      expect(mockStorage["cache_video2"]).toBeUndefined();

      // Other keys should remain
      expect(mockStorage["other_key"]).toBeDefined();
    });
  });

  describe("remove()", () => {
    it("should remove specific cache entry", async () => {
      mockStorage["cache_abc123def45"] = { data: {} };
      mockStorage["cache_xyz789ghi01"] = { data: {} };

      await client.remove("abc123def45");

      expect(mockStorage["cache_abc123def45"]).toBeUndefined();
      expect(mockStorage["cache_xyz789ghi01"]).toBeDefined();
    });
  });

  describe("cleanupExpiredCache()", () => {
    it("should remove only expired entries", async () => {
      const now = Date.now();
      const oldTimestamp = now - 25 * 60 * 60 * 1000; // 25 hours ago
      const freshTimestamp = now - 1 * 60 * 60 * 1000; // 1 hour ago

      mockStorage["cache_expired1"] = {
        timestamp: oldTimestamp,
        data: {
          video_id: "expired1",
          claims: [],
          metadata: { analyzed_at: new Date().toISOString() },
        },
      };
      mockStorage["cache_expired2"] = {
        timestamp: oldTimestamp,
        data: {
          video_id: "expired2",
          claims: [],
          metadata: { analyzed_at: new Date().toISOString() },
        },
      };
      mockStorage["cache_fresh"] = {
        timestamp: freshTimestamp,
        data: {
          video_id: "fresh",
          claims: [],
          metadata: { analyzed_at: new Date().toISOString() },
        },
      };

      await client.cleanupExpiredCache();

      expect(mockStorage["cache_expired1"]).toBeUndefined();
      expect(mockStorage["cache_expired2"]).toBeUndefined();
      expect(mockStorage["cache_fresh"]).toBeDefined();
    });
  });

  describe("Schema Migration", () => {
    it("should apply V0→V1 migration", async () => {
      const v0Entry = {
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        data: {
          video_id: "abc123def45",
          claims: [],
          metadata: { analyzed_at: new Date().toISOString() },
        },
      };

      const migrated = await client.migrateCacheEntry(v0Entry);

      expect(migrated).toBeDefined();
      expect(migrated.schemaVersion).toBe(1);
    });

    it("should return entry if already current version", async () => {
      const currentEntry = {
        schemaVersion: 1,
        timestamp: Date.now(),
        data: {
          video_id: "abc123def45",
          claims: [],
          metadata: { analyzed_at: new Date().toISOString() },
        },
      };

      const result = await client.migrateCacheEntry(currentEntry);

      expect(result).toEqual(currentEntry);
    });

    it("should return null for invalid data in V0→V1", () => {
      const invalidV0 = {
        timestamp: Date.now(),
        data: {
          // Missing claims and metadata - invalid structure
          video_id: "abc123def45",
        },
      };

      const result = client.migrateV0ToV1(invalidV0);
      expect(result).toBeNull();
    });
  });

  describe("estimateSize()", () => {
    it("should calculate entry size in bytes", () => {
      const entry = {
        schemaVersion: 1,
        timestamp: Date.now(),
        data: {
          video_id: "abc123def45",
          claims: [],
          metadata: { analyzed_at: new Date().toISOString() },
        },
      };

      const size = client.estimateSize(entry);

      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe("number");
    });

    it("should handle circular references gracefully", () => {
      const circular = { a: 1 };
      circular.self = circular;

      const size = client.estimateSize(circular);

      // Should return 0 for unstringifiable objects
      expect(size).toBe(0);
    });
  });
});
