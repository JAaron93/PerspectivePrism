/**
 * Client Retry Logic Unit Tests
 *
 * Tests retry mechanisms in PerspectivePrismClient:
 * - shouldRetryError logic
 * - Retry scheduling (alarms)
 * - Max retries enforcement
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { PerspectivePrismClient, HttpError } from "../../client.js";

describe("PerspectivePrismClient - Retry Logic", () => {
  let client;
  let mockAlarms;

  beforeEach(async () => {
    // Mock chrome.storage.local (tests mock persistRequestState directly, so this is minimal)
    chrome.storage.local.get.mockImplementation((_keys) => Promise.resolve({}));
    chrome.storage.local.set.mockImplementation(() => Promise.resolve());

    // Mock chrome.alarms
    mockAlarms = [];
    chrome.alarms.create.mockImplementation((name, alarmInfo) => {
      mockAlarms.push({ name, ...alarmInfo });
      return Promise.resolve();
    });

    // We need to mock the global fetch for testing makeAnalysisRequest failures
    vi.stubGlobal('fetch', vi.fn());

    client = new PerspectivePrismClient("https://api.example.com");
    
    // Silence console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("shouldRetryError()", () => {
    it("should retry on network error", () => {
      const error = new TypeError("Network request failed");
      expect(client.shouldRetryError(error)).toBe(true);
    });

    it("should retry on 500 status", () => {
      const error = new HttpError(500, "Internal Server Error");
      expect(client.shouldRetryError(error)).toBe(true);
    });

    it("should retry on transient HTTP 429 status without credit exhaustion", () => {
      const error = new HttpError(429, "Too Many Requests");
      expect(client.shouldRetryError(error)).toBe(true);
    });

    it("should NOT retry when error code is QUOTA_EXHAUSTED", () => {
      const error = new HttpError(402, "Payment Required");
      error.code = "QUOTA_EXHAUSTED";
      error.isExhaustion = true;
      expect(client.shouldRetryError(error)).toBe(false);
    });

    it("should NOT retry when isExhaustion flag is true", () => {
      const error = new Error("Out of credits");
      // @ts-ignore
      error.isExhaustion = true;
      expect(client.shouldRetryError(error)).toBe(false);
    });
  });

  describe("Quota Exhaustion Interception (T2.1 / FR6)", () => {
    it("should throw HttpError with QUOTA_EXHAUSTED on HTTP 402 for modal host", async () => {
      const modalClient = new PerspectivePrismClient("https://workspace--app.modal.run");
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        statusText: "Payment Required",
        text: () => Promise.resolve("Payment required: account credits depleted"),
      });

      try {
        await modalClient.createAnalysisJob("https://www.youtube.com/watch?v=12345678901");
        expect.unreachable("Should have thrown HttpError");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.status).toBe(402);
        expect(err.code).toBe("QUOTA_EXHAUSTED");
        expect(err.isExhaustion).toBe(true);
      }
    });

    it("should NOT throw QUOTA_EXHAUSTED on HTTP 402 for self-hosted / non-modal host", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        statusText: "Payment Required",
        text: () => Promise.resolve("Subscription payment required"),
      });

      try {
        await client.createAnalysisJob("https://www.youtube.com/watch?v=12345678901");
        expect.unreachable("Should have thrown HttpError");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.status).toBe(402);
        expect(err.code).toBeUndefined();
        expect(err.isExhaustion).toBe(false);
      }
    });

    it("should throw HttpError with QUOTA_EXHAUSTED on *.modal.run 429 with case-insensitive credits message", async () => {
      const modalClient = new PerspectivePrismClient("https://workspace--app.modal.run");
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: () => Promise.resolve("Modal error: Out of compute credits"),
      });

      try {
        await modalClient.createAnalysisJob("https://www.youtube.com/watch?v=12345678901");
        expect.unreachable("Should have thrown HttpError");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.code).toBe("QUOTA_EXHAUSTED");
        expect(err.isExhaustion).toBe(true);
      }
    });

    it("should NOT throw QUOTA_EXHAUSTED on generic non-modal 429", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: () => Promise.resolve("Rate limit exceeded"),
      });

      try {
        await client.createAnalysisJob("https://www.youtube.com/watch?v=12345678901");
        expect.unreachable("Should have thrown HttpError");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.code).toBeUndefined();
        expect(err.isExhaustion).toBeFalsy();
      }
    });
  });

  describe("executeAnalysisRequest()", () => {
    it("should retry on fetch failure (network error)", async () => {
        // Mock fetch to fail
        global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));

        // Spy on persistRequestState (to avoid actual storage writes issues and track calls)
        client.persistRequestState = vi.fn().mockResolvedValue(true);
        client.cleanupPersistedRequest = vi.fn().mockResolvedValue(true);
        
        // Call execute
        const result = await client.executeAnalysisRequest("vid123", "http://url", 0);

        // Expect intermediate failure result
        expect(result.success).toBe(false);
        expect(result.isRetry).toBe(true);
        expect(result.error).toContain("retrying");

        // Expect alarm to be created
        expect(mockAlarms.length).toBe(1);
        expect(mockAlarms[0].name).toContain("retry::vid123::1");
        
        // Expect persistRequestState to be called with status 'retrying'
        expect(client.persistRequestState).toHaveBeenCalledWith(expect.objectContaining({
            status: "retrying",
            attemptCount: 1
        }));

        // Cleanup should NOT be called during retry
        expect(client.cleanupPersistedRequest).not.toHaveBeenCalled();
    });

    it("should give up after MAX_RETRIES", async () => {
        global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
        client.persistRequestState = vi.fn().mockResolvedValue(true);
        client.cleanupPersistedRequest = vi.fn().mockResolvedValue(true);
        client.notifyCompletion = vi.fn();

        // Max retries is 2. So attempt 2 (0-indexed? No, usually 1-indexed. The code says `attempt < this.MAX_RETRIES`.
        // attempt is 0 initially.
        // attempt 0 -> retry (attempt 1 next)
        // attempt 1 -> retry (attempt 2 next)
        // attempt 2 -> Stop.
        
        const result = await client.executeAnalysisRequest("vid123", "http://url", 2);

        expect(result.success).toBe(false);
        expect(result.isRetry).toBeFalsy(); // It's a terminal error, not a retry
        expect(result.originalError).toBe("Failed to fetch");
        
        // Should NOT create another alarm
        expect(mockAlarms.length).toBe(0);

        // Should call cleanup
        expect(client.cleanupPersistedRequest).toHaveBeenCalledWith("vid123");
    });
  });
});
