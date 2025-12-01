/**
 * Cache Performance Test
 *
 * Verifies that cached analysis results are retrieved within 500ms
 * as specified in Requirements 3.2 and 5.3
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock chrome API
const storage = {};
global.chrome = {
  storage: {
    local: {
      get: vi.fn(async (key) => {
        // Simulate realistic storage latency (1-5ms)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 4 + 1),
        );

        if (key === null) return storage;
        if (typeof key === "string")
          return key in storage ? { [key]: storage[key] } : {};
        if (Array.isArray(key)) {
          const res = {};
          key.forEach((k) => {
            if (k in storage) res[k] = storage[k];
          });
          return res;
        }
        return storage;
      }),
      set: vi.fn(async (items) => {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 4 + 1),
        );
        Object.assign(storage, items);
      }),
      remove: vi.fn(async (keys) => {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 2 + 1),
        );
        if (typeof keys === "string") keys = [keys];
        keys.forEach((k) => delete storage[k]);
      }),
    },
  },
  alarms: {
    create: vi.fn(async () => {}),
    onAlarm: { addListener: vi.fn(() => {}) },
    getAll: vi.fn(async () => []),
    clear: vi.fn(async () => {}),
  },
  runtime: {
    onMessage: { addListener: vi.fn(() => {}) },
  },
};

// Import client after mocking chrome
const { PerspectivePrismClient } = await import("../../client.js");

describe("Cache Performance Tests", () => {
  let client;
  const testVideoId = "dQw4w9WgXcQ"; // Valid 11-character YouTube video ID

  // Create realistic test data
  const createTestData = (videoId) => ({
    video_id: videoId,
    metadata: {
      analyzed_at: new Date().toISOString(),
      video_title: "Test Video Title",
    },
    claims: [
      {
        claim_text: "This is a test claim about a scientific fact.",
        timestamp: "00:01:23",
        truth_profile: {
          perspectives: {
            scientific: {
              assessment: "This claim is supported by peer-reviewed research.",
              confidence: 0.85,
              supporting_evidence: [
                "Study from Nature Journal 2023",
                "Meta-analysis from Cochrane Review",
              ],
            },
            journalistic: {
              assessment: "Multiple reputable sources confirm this claim.",
              confidence: 0.78,
              supporting_evidence: [
                "New York Times article",
                "BBC News report",
              ],
            },
          },
          bias_indicators: {
            logical_fallacies: [],
            emotional_manipulation: [],
            deception_score: 0.1,
          },
          overall_assessment: "Claim is well-supported by evidence.",
        },
      },
      {
        claim_text: "Another claim with different perspectives.",
        timestamp: "00:03:45",
        truth_profile: {
          perspectives: {
            partisan_left: {
              assessment: "This aligns with progressive viewpoints.",
              confidence: 0.65,
              supporting_evidence: ["Progressive think tank report"],
            },
            partisan_right: {
              assessment: "This contradicts conservative principles.",
              confidence: 0.6,
              supporting_evidence: ["Conservative policy analysis"],
            },
          },
          bias_indicators: {
            logical_fallacies: ["Appeal to emotion"],
            emotional_manipulation: ["Fear-based language"],
            deception_score: 0.4,
          },
          overall_assessment: "Claim shows political bias.",
        },
      },
    ],
  });

  beforeEach(async () => {
    // Clear storage
    Object.keys(storage).forEach((key) => delete storage[key]);

    // Reset mocks
    vi.clearAllMocks();

    // Create client
    client = new PerspectivePrismClient("http://localhost:8000");

    // Setup test cache
    const testData = createTestData(testVideoId);
    await client.saveToCache(testVideoId, testData);
  });

  it("should retrieve cached data in under 500ms (requirement threshold)", async () => {
    const startTime = performance.now();
    const result = await client.checkCache(testVideoId);
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(result).not.toBeNull();
    expect(result.video_id).toBe(testVideoId);
    expect(duration).toBeLessThan(500); // Requirement: < 500ms
  });

  it("should retrieve cached data in under 100ms (ideal target)", async () => {
    const startTime = performance.now();
    const result = await client.checkCache(testVideoId);
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(result).not.toBeNull();
    expect(duration).toBeLessThan(100); // Ideal: < 100ms for instant feel
  });

  it("should consistently retrieve cache in under 500ms over multiple iterations", async () => {
    const iterations = 20;
    const durations = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const result = await client.checkCache(testVideoId);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result).not.toBeNull();
      durations.push(duration);
    }

    // All iterations should be under 500ms
    const allUnderThreshold = durations.every((d) => d < 500);
    expect(allUnderThreshold).toBe(true);

    // Calculate statistics
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const sorted = [...durations].sort((a, b) => a - b);
    const p95Index = Math.ceil(sorted.length * 0.95) - 1;
    const p95 = sorted[p95Index];

    // Log statistics for visibility
    console.log(`Cache Performance Statistics (${iterations} iterations):`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Maximum: ${max.toFixed(2)}ms`);
    console.log(`  P95: ${p95.toFixed(2)}ms`);

    // Verify P95 is under threshold
    expect(p95).toBeLessThan(500);
  });

  it("should handle cache miss quickly (under 100ms)", async () => {
    const nonExistentVideoId = "nonExistent"; // Valid 11-character format

    const startTime = performance.now();
    const result = await client.checkCache(nonExistentVideoId);
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(result).toBeNull();
    expect(duration).toBeLessThan(100); // Cache miss should be even faster
  });

  it("should retrieve cache with migration in under 500ms", async () => {
    // Create a legacy V0 entry (no schemaVersion)
    const legacyVideoId = "abcdefghijk"; // Valid 11-character ID
    const legacyData = createTestData(legacyVideoId);
    const legacyEntry = {
      version: "v1", // Old string version
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      data: legacyData,
    };
    storage[`cache_${legacyVideoId}`] = legacyEntry;

    const startTime = performance.now();
    const result = await client.checkCache(legacyVideoId);
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(result).not.toBeNull();
    expect(result.video_id).toBe(legacyVideoId);
    expect(duration).toBeLessThan(500); // Even with migration, should be under 500ms
  });

  it("should not block on lastAccessed update", async () => {
    // This test verifies that the lastAccessed update doesn't slow down the response
    const startTime = performance.now();
    const result = await client.checkCache(testVideoId);
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(result).not.toBeNull();

    // The lastAccessed update is async and shouldn't block
    // So the duration should be minimal (just the get operation)
    expect(duration).toBeLessThan(50); // Should be very fast
  });

  it("should handle large cache entries efficiently", async () => {
    // Create a larger entry with more claims
    const largeVideoId = "12345678901"; // Valid 11-character ID
    const largeData = createTestData(largeVideoId);

    // Add more claims to make it larger
    for (let i = 0; i < 8; i++) {
      largeData.claims.push({
        ...largeData.claims[0],
        claim_text: `Additional claim ${i + 1} with more text to increase size.`,
      });
    }

    await client.saveToCache(largeVideoId, largeData);

    const startTime = performance.now();
    const result = await client.checkCache(largeVideoId);
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(result).not.toBeNull();
    expect(result.claims.length).toBe(10); // 2 original + 8 added
    expect(duration).toBeLessThan(500); // Even large entries should be under 500ms
  });
});
