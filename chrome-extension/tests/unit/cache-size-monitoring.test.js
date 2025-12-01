/**
 * Unit tests for cache size monitoring functionality
 * Tests MetricsTracker and QuotaManager integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MetricsTracker } from "../../metrics-tracker.js";
import { QuotaManager } from "../../quota-manager.js";

// Mock chrome.storage API
const mockStorage = {
  local: {
    data: {},
    get: vi.fn((keys) => {
      if (typeof keys === "string") {
        return Promise.resolve({ [keys]: mockStorage.local.data[keys] });
      }
      if (keys === null) {
        return Promise.resolve({ ...mockStorage.local.data });
      }
      const result = {};
      keys.forEach((key) => {
        if (mockStorage.local.data[key] !== undefined) {
          result[key] = mockStorage.local.data[key];
        }
      });
      return Promise.resolve(result);
    }),
    set: vi.fn((items) => {
      Object.assign(mockStorage.local.data, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach((key) => delete mockStorage.local.data[key]);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      mockStorage.local.data = {};
      return Promise.resolve();
    }),
    QUOTA_BYTES: 10 * 1024 * 1024, // 10 MB
  },
};

global.chrome = {
  storage: mockStorage,
};

describe("MetricsTracker", () => {
  let metricsTracker;

  beforeEach(() => {
    metricsTracker = new MetricsTracker();
    mockStorage.local.data = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Cache Hit/Miss Tracking", () => {
    it("should record cache hits", async () => {
      await metricsTracker.recordCacheHit("video123");
      await metricsTracker.recordCacheHit("video456");

      const stats = await metricsTracker.getHitMissRate();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
      expect(stats.total).toBe(2);
      expect(stats.hitRate).toBe("100.00");
    });

    it("should record cache misses", async () => {
      await metricsTracker.recordCacheMiss("video123");
      await metricsTracker.recordCacheMiss("video456");

      const stats = await metricsTracker.getHitMissRate();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
      expect(stats.total).toBe(2);
      expect(stats.missRate).toBe("100.00");
    });

    it("should calculate hit rate correctly", async () => {
      await metricsTracker.recordCacheHit("video1");
      await metricsTracker.recordCacheHit("video2");
      await metricsTracker.recordCacheHit("video3");
      await metricsTracker.recordCacheMiss("video4");

      const stats = await metricsTracker.getHitMissRate();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(1);
      expect(stats.total).toBe(4);
      expect(stats.hitRate).toBe("75.00");
      expect(stats.missRate).toBe("25.00");
    });

    it("should handle zero requests", async () => {
      const stats = await metricsTracker.getHitMissRate();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.hitRate).toBe("0.00");
      expect(stats.missRate).toBe("0.00");
    });
  });

  describe("Eviction Event Tracking", () => {
    it("should record eviction events", async () => {
      const videoIds = ["video1", "video2", "video3"];
      const freedSpace = 1024 * 500; // 500 KB

      await metricsTracker.recordEviction(
        videoIds,
        freedSpace,
        "quota_pressure",
      );

      const events = await metricsTracker.getRecentEvictions(10);
      expect(events).toHaveLength(1);
      expect(events[0].videoIds).toEqual(videoIds);
      expect(events[0].freedSpace).toBe(freedSpace);
      expect(events[0].freedSpaceKB).toBe("500.00");
      expect(events[0].reason).toBe("quota_pressure");
      expect(events[0].count).toBe(3);
    });

    it("should limit eviction history to MAX_METRICS_HISTORY", async () => {
      // Record 150 eviction events (more than MAX_METRICS_HISTORY of 100)
      for (let i = 0; i < 150; i++) {
        await metricsTracker.recordEviction([`video${i}`], 1024, "lru");
      }

      const events = await metricsTracker.getRecentEvictions(200);
      expect(events.length).toBeLessThanOrEqual(100);
    });

    it("should return recent evictions in reverse chronological order", async () => {
      await metricsTracker.recordEviction(["video1"], 1024, "lru");
      await new Promise((resolve) => setTimeout(resolve, 10));
      await metricsTracker.recordEviction(["video2"], 2048, "quota_pressure");
      await new Promise((resolve) => setTimeout(resolve, 10));
      await metricsTracker.recordEviction(["video3"], 3072, "expiration");

      const events = await metricsTracker.getRecentEvictions(3);
      expect(events[0].videoIds).toEqual(["video3"]);
      expect(events[1].videoIds).toEqual(["video2"]);
      expect(events[2].videoIds).toEqual(["video1"]);
    });
  });

  describe("Quota Snapshot Tracking", () => {
    it("should record quota snapshots", async () => {
      const quotaStatus = {
        used: 5 * 1024 * 1024, // 5 MB
        quota: 10 * 1024 * 1024, // 10 MB
        usagePercentage: "50.00",
        level: "normal",
        available: 5 * 1024 * 1024,
      };

      await metricsTracker.recordQuotaSnapshot(quotaStatus);

      const history = await metricsTracker.getStorageHistory(10);
      expect(history).toHaveLength(1);
      expect(history[0].used).toBe(quotaStatus.used);
      expect(history[0].usedMB).toBe("5.00");
      expect(history[0].usagePercentage).toBe("50.00");
      expect(history[0].level).toBe("normal");
    });

    it("should track storage usage over time", async () => {
      // Simulate increasing storage usage
      const snapshots = [
        {
          used: 1 * 1024 * 1024,
          quota: 10 * 1024 * 1024,
          usagePercentage: "10.00",
          level: "normal",
        },
        {
          used: 3 * 1024 * 1024,
          quota: 10 * 1024 * 1024,
          usagePercentage: "30.00",
          level: "normal",
        },
        {
          used: 8 * 1024 * 1024,
          quota: 10 * 1024 * 1024,
          usagePercentage: "80.00",
          level: "warning",
        },
        {
          used: 9.5 * 1024 * 1024,
          quota: 10 * 1024 * 1024,
          usagePercentage: "95.00",
          level: "critical",
        },
      ];

      for (const snapshot of snapshots) {
        await metricsTracker.recordQuotaSnapshot(snapshot);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const history = await metricsTracker.getStorageHistory(10);
      expect(history).toHaveLength(4);

      // Verify chronological order
      expect(parseFloat(history[0].usagePercentage)).toBeLessThan(
        parseFloat(history[1].usagePercentage),
      );
      expect(parseFloat(history[1].usagePercentage)).toBeLessThan(
        parseFloat(history[2].usagePercentage),
      );
      expect(parseFloat(history[2].usagePercentage)).toBeLessThan(
        parseFloat(history[3].usagePercentage),
      );

      // Verify level progression
      expect(history[3].level).toBe("critical");
    });

    it("should limit snapshot history to MAX_METRICS_HISTORY", async () => {
      // Record 150 snapshots (more than MAX_METRICS_HISTORY of 100)
      for (let i = 0; i < 150; i++) {
        const quotaStatus = {
          used: i * 1024,
          quota: 10 * 1024 * 1024,
          usagePercentage: (((i * 1024) / (10 * 1024 * 1024)) * 100).toFixed(2),
          level: "normal",
        };
        await metricsTracker.recordQuotaSnapshot(quotaStatus);
      }

      const history = await metricsTracker.getStorageHistory(200);
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe("Metrics Reset", () => {
    it("should reset all metrics", async () => {
      // Add some metrics
      await metricsTracker.recordCacheHit("video1");
      await metricsTracker.recordCacheMiss("video2");
      await metricsTracker.recordEviction(["video3"], 1024, "lru");
      await metricsTracker.recordQuotaSnapshot({
        used: 5 * 1024 * 1024,
        quota: 10 * 1024 * 1024,
        usagePercentage: "50.00",
        level: "normal",
      });

      // Reset
      await metricsTracker.reset();

      // Verify all metrics are cleared
      const hitMissStats = await metricsTracker.getHitMissRate();
      expect(hitMissStats.hits).toBe(0);
      expect(hitMissStats.misses).toBe(0);

      const evictions = await metricsTracker.getRecentEvictions(10);
      expect(evictions).toHaveLength(0);

      const history = await metricsTracker.getStorageHistory(10);
      expect(history).toHaveLength(0);
    });
  });
});

describe("QuotaManager Integration", () => {
  let quotaManager;
  let mockClient;

  beforeEach(() => {
    mockStorage.local.data = {};

    // Create mock client with required methods
    mockClient = {
      getStats: vi.fn(() =>
        Promise.resolve({
          totalEntries: 0,
          totalSize: 0,
          totalSizeMB: "0.00",
        }),
      ),
      estimateSize: vi.fn((entry) => {
        return JSON.stringify(entry).length * 2;
      }),
      metricsTracker: new MetricsTracker(),
    };

    quotaManager = new QuotaManager(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Quota Status Checking", () => {
    it("should check quota status correctly", async () => {
      mockClient.getStats.mockResolvedValue({
        totalEntries: 10,
        totalSize: 5 * 1024 * 1024, // 5 MB
        totalSizeMB: "5.00",
      });

      const status = await quotaManager.checkQuota();

      expect(status.used).toBe(5 * 1024 * 1024);
      expect(status.quota).toBe(10 * 1024 * 1024);
      expect(parseFloat(status.usagePercentage)).toBe(50.0);
      expect(status.level).toBe("normal");
      expect(status.available).toBe(5 * 1024 * 1024);
    });

    it("should detect warning level at 80% usage", async () => {
      mockClient.getStats.mockResolvedValue({
        totalEntries: 20,
        totalSize: 8.5 * 1024 * 1024, // 8.5 MB (85%)
        totalSizeMB: "8.50",
      });

      const status = await quotaManager.checkQuota();
      expect(status.level).toBe("warning");
    });

    it("should detect critical level at 95% usage", async () => {
      mockClient.getStats.mockResolvedValue({
        totalEntries: 30,
        totalSize: 9.6 * 1024 * 1024, // 9.6 MB (96%)
        totalSizeMB: "9.60",
      });

      const status = await quotaManager.checkQuota();
      expect(status.level).toBe("critical");
    });
  });

  describe("Storage Usage Monitoring", () => {
    it("should track storage usage over time via quota snapshots", async () => {
      const metricsTracker = mockClient.metricsTracker;

      // Simulate storage growth
      const usageLevels = [
        { totalSize: 2 * 1024 * 1024, totalSizeMB: "2.00" },
        { totalSize: 5 * 1024 * 1024, totalSizeMB: "5.00" },
        { totalSize: 8 * 1024 * 1024, totalSizeMB: "8.00" },
      ];

      for (const usage of usageLevels) {
        mockClient.getStats.mockResolvedValue({
          totalEntries: 10,
          ...usage,
        });

        const quotaStatus = await quotaManager.checkQuota();
        await metricsTracker.recordQuotaSnapshot(quotaStatus);
      }

      const history = await metricsTracker.getStorageHistory(10);
      expect(history).toHaveLength(3);

      // Verify increasing usage
      expect(parseFloat(history[0].usedMB)).toBeLessThan(
        parseFloat(history[1].usedMB),
      );
      expect(parseFloat(history[1].usedMB)).toBeLessThan(
        parseFloat(history[2].usedMB),
      );
    });
  });

  describe("Eviction Event Logging", () => {
    it("should log eviction events when quota is exceeded", async () => {
      const metricsTracker = mockClient.metricsTracker;

      // Set up cache entries
      mockStorage.local.data = {
        cache_video1: {
          videoId: "video1",
          data: { video_id: "video1", claims: [] },
          timestamp: 1000,
          lastAccessed: 1000,
        },
        cache_video2: {
          videoId: "video2",
          data: { video_id: "video2", claims: [] },
          timestamp: 2000,
          lastAccessed: 2000,
        },
        cache_video3: {
          videoId: "video3",
          data: { video_id: "video3", claims: [] },
          timestamp: 3000,
          lastAccessed: 3000,
        },
      };

      // Mock high storage usage
      mockClient.getStats.mockResolvedValue({
        totalEntries: 3,
        totalSize: 9.5 * 1024 * 1024, // 9.5 MB (95%)
        totalSizeMB: "9.50",
      });

      // Try to ensure space for a new entry
      const requiredSize = 1 * 1024 * 1024; // 1 MB
      await quotaManager.ensureSpace(requiredSize);

      // Verify eviction was logged
      const evictions = await metricsTracker.getRecentEvictions(10);
      expect(evictions.length).toBeGreaterThan(0);
      expect(evictions[0].reason).toBe("quota_pressure");
    });
  });
});

describe("Cache Size Monitoring Integration", () => {
  beforeEach(() => {
    mockStorage.local.data = {};
  });

  it("should provide complete monitoring data", async () => {
    const metricsTracker = new MetricsTracker();

    // Simulate cache operations
    await metricsTracker.recordCacheHit("video1");
    await metricsTracker.recordCacheHit("video2");
    await metricsTracker.recordCacheMiss("video3");

    // Simulate eviction
    await metricsTracker.recordEviction(["video4", "video5"], 2048, "lru");

    // Simulate quota snapshots
    await metricsTracker.recordQuotaSnapshot({
      used: 5 * 1024 * 1024,
      quota: 10 * 1024 * 1024,
      usagePercentage: "50.00",
      level: "normal",
    });

    // Verify all monitoring data is available
    const hitMissStats = await metricsTracker.getHitMissRate();
    expect(hitMissStats.total).toBe(3);
    expect(hitMissStats.hitRate).toBe("66.67");

    const evictions = await metricsTracker.getRecentEvictions(10);
    expect(evictions).toHaveLength(1);

    const history = await metricsTracker.getStorageHistory(10);
    expect(history).toHaveLength(1);
  });
});
