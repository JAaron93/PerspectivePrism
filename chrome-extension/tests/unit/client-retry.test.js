/**
 * Client Retry Logic Unit Tests
 *
 * Tests retry mechanisms in PerspectivePrismClient:
 * - shouldRetryError logic
 * - Retry scheduling (alarms)
 * - Max retries enforcement
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

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

    // Import the client (class only, to avoid side effects of instantation in module scope if any)
    const clientModule = await import("../../client.js");
    const PerspectivePrismClient = clientModule.default || clientModule.PerspectivePrismClient;

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

    it.todo("should retry on 500 status - requires HttpError to be exported from client.js");
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
