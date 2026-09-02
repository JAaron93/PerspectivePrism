/**
 * PerspectivePrismClient
 * Handles API communication with the backend, including retry logic and state persistence.
 */

import { logger } from "./logging-utils.js";
class PerspectivePrismClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.pendingRequests = new Map(); // In-memory deduplication
    this.pendingRequestOptions = new Map(); // In-memory options tracking for override deduplication
    this.abortControllers = new Map(); // Map<videoId, AbortController> for cancellation
    this.MAX_RETRIES = 2;
    this.RETRY_DELAYS = [2000, 4000]; // Exponential backoff: 2s, 4s
    this.TIMEOUT_MS = 120000; // 120 seconds
    this.MAX_REQUEST_AGE = 300000; // 5 minutes

    // Cache Configuration
    this.CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (604,800,000 ms)
    this.MAX_CACHE_ITEMS = 50;
    this.inMemoryCache = new Map();
    this.delegateCache = options.delegateCache ?? (typeof window !== "undefined" && (typeof process === "undefined" || !globalThis.process?.env?.VITEST));

    this.recoveryComplete = false;
    this.requestQueue = [];
    this.MAX_QUEUE_SIZE = 50;

    // Recover persisted requests on startup
    this.recoverPersistedRequests();

    // Setup alarm listener for retries
    this.setupAlarmListener();

    this.pendingResolvers = new Map(); // Map<videoId, Array<{resolve, reject, timeoutId}>>

    // Initialize QuotaManager for storage quota management
    // Note: QuotaManager class should be loaded before PerspectivePrismClient
    if (typeof QuotaManager !== "undefined") {
      this.quotaManager = new QuotaManager(this);
    }

    // Initialize MetricsTracker for monitoring cache performance
    if (typeof MetricsTracker !== "undefined") {
      this.metricsTracker = new MetricsTracker();
    }
  }

  /**
   * Analyze a video by its ID.
   * @param {string} videoId - The YouTube video ID.
   * @param {Object} [options] - Analysis options (e.g. forceOverride, metadata).
   * @returns {Promise<Object>} - The analysis result.
   */
  async analyzeVideo(videoId, options = {}) {
    // Validation
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return { success: false, error: "Invalid video ID format" };
    }

    // Handle recovery state
    if (!this.recoveryComplete) {
      if (this.requestQueue.length < this.MAX_QUEUE_SIZE) {
        logger.info(
          `[PerspectivePrismClient] Recovery in progress, queueing request for ${videoId}`,
        );
        return new Promise((resolve, reject) => {
          this.requestQueue.push({ videoId, options, resolve, reject });
        });
      } else {
        logger.warn(
          `[PerspectivePrismClient] Recovery queue full, rejecting request for ${videoId}`,
        );
        return {
          success: false,
          error: "Service recovering, please try again",
          status: "retry-after",
          delay: 1000,
        };
      }
    }

    return this.performAnalysis(videoId, options);
  }

  /**
   * Internal method to perform analysis logic (extracted from analyzeVideo)
   * @param {string} videoId
   * @param {Object} [options]
   */
  async performAnalysis(videoId, options = {}) {
    const isForceOverride = Boolean(
      options.forceOverride || options.force_override,
    );

    // 1. Check Cache (skip if forceOverride is requested)
    if (!isForceOverride) {
      const cachedResult = await this.checkCache(videoId);
      if (cachedResult) {
        logger.info(`[PerspectivePrismClient] Cache hit for ${videoId}`);
        return { success: true, data: cachedResult, cached: true };
      }
    }

    // Deduplication (In-memory)
    if (this.pendingRequests.has(videoId)) {
      const inFlightOptions = this.pendingRequestOptions.get(videoId) || {};
      const inFlightIsForce = Boolean(
        inFlightOptions.forceOverride || inFlightOptions.force_override,
      );

      if (isForceOverride && !inFlightIsForce) {
        logger.info(
          `[PerspectivePrismClient] Cancelling non-forced in-flight request for ${videoId} to start force override`,
        );
        const oldPromise = this.pendingRequests.get(videoId);
        await this.cancelAnalysis(videoId);
        if (oldPromise) {
          try {
            await oldPromise;
          } catch (_e) {
            // Expected cancellation rejection
          }
        }
      } else {
        logger.info(
          `[PerspectivePrismClient] Returning existing promise for ${videoId}`,
        );
        return this.pendingRequests.get(videoId);
      }
    }

    // Deduplication (Persistent)
    const persistedState = await this.getPersistedRequestState(videoId);
    if (persistedState && persistedState.status !== "completed") {
      const persistedIsForce = Boolean(
        persistedState.options?.forceOverride ||
          persistedState.options?.force_override,
      );

      if (isForceOverride && !persistedIsForce) {
        logger.info(
          `[PerspectivePrismClient] Clearing non-forced persisted request for ${videoId} to start force override`,
        );
        await this.cleanupPersistedRequest(videoId);
      } else {
        logger.info(
          `[PerspectivePrismClient] Attaching to persisted request for ${videoId}`,
        );
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            this.removeResolver(videoId, resolve);
            // Resolve with error instead of rejecting to match API contract
            resolve({
              success: false,
              error: "Analysis timed out (persisted)",
              videoId,
            });
          }, this.TIMEOUT_MS);

          const resolvers = this.pendingResolvers.get(videoId) || [];
          resolvers.push({ resolve, reject, timeoutId });
          this.pendingResolvers.set(videoId, resolvers);
        });
      }
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Create a promise for this request
    const requestPromise = this.executeAnalysisRequest(
      videoId,
      videoUrl,
      0,
      options,
    );
    this.pendingRequests.set(videoId, requestPromise);
    this.pendingRequestOptions.set(videoId, options);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      if (this.pendingRequests.get(videoId) === requestPromise) {
        this.pendingRequests.delete(videoId);
        this.pendingRequestOptions.delete(videoId);
      }
    }
  }

  /**
   * Execute the analysis request with retry logic.
   * @param {string} videoId
   * @param {string} videoUrl
   * @param {number} attempt
   * @param {Object} [options]
   */
  async executeAnalysisRequest(videoId, videoUrl, attempt = 0, options = {}) {
    // Persist state start
    await this.persistRequestState({
      videoId,
      videoUrl,
      startTime: Date.now(),
      attemptCount: attempt,
      status: "pending",
      options,
    });

    try {
      const result = await this.makeAnalysisRequest(
        videoUrl,
        videoId,
        options,
      );

      // Success
      await this.cleanupPersistedRequest(videoId);

      // Save to cache (may fail if entry is too large)
      try {
        await this.saveToCache(videoId, result);
      } catch (cacheError) {
        // Log but don't fail the request if caching fails due to size
        console.warn(
          `[PerspectivePrismClient] Failed to cache result for ${videoId}:`,
          cacheError.message,
        );
      }

      const successResult = { success: true, data: result };
      this.notifyCompletion(videoId, successResult);
      return successResult;
    } catch (error) {
      // If cancelled or aborted, do not schedule retries or log error
      // @ts-ignore
      if (error.name === "AbortError" || error.isCancelled || error.message?.includes("cancelled") || error.message?.includes("aborted")) {
        return {
          success: false,
          error: "Analysis cancelled",
          isCancelled: true,
        };
      }

      this.logError(
        `Analysis failed for ${videoId} (attempt ${attempt})`,
        error,
      );

      // Check if we should retry
      if (attempt < this.MAX_RETRIES && this.shouldRetryError(error)) {
        const delay = this.RETRY_DELAYS[attempt];
        console.log(`[PerspectivePrismClient] Scheduling retry in ${delay}ms`);

        // Update persisted state
        await this.persistRequestState({
          videoId,
          videoUrl,
          startTime: Date.now(),
          attemptCount: attempt + 1,
          lastError: error.message,
          status: "retrying",
          options,
        });

        // Schedule alarm with safe naming
        const alarmName = `retry::${videoId}::${attempt + 1}`;
        await chrome.alarms.create(alarmName, {
          when: Date.now() + delay,
        });

        return {
          success: false,
          error: "Analysis in progress (retrying)",
          isRetry: true,
        };
      } else {
        // Terminal failure
        await this.cleanupPersistedRequest(videoId);
        const userMessage = this.formatUserError(error);
        const errorResult = {
          success: false,
          error: userMessage,
          originalError: error.message,
        };
        this.notifyCompletion(videoId, errorResult);
        return errorResult;
      }
    }
  }

  /**
   * Cancel an in-flight analysis request
   * @param {string} videoId - The video ID to cancel
   * @returns {Promise<boolean>} - True if request was cancelled, false if no request found
   */
  async cancelAnalysis(videoId) {
    const controller = this.abortControllers.get(videoId);
    if (controller) {
      console.log(
        `[PerspectivePrismClient] Cancelling analysis for ${videoId}`,
      );
      controller.abort();
      this.abortControllers.delete(videoId);
    }

    // Clean up pending request
    this.pendingRequests.delete(videoId);
    this.pendingRequestOptions.delete(videoId);

    // Clean up persisted state and await completion so it doesn't race forced replacement
    try {
      await this.cleanupPersistedRequest(videoId);
    } catch (err) {
      console.error(
        `[PerspectivePrismClient] Failed to cleanup after cancel:`,
        err,
      );
    }

    // Notify any waiting resolvers
    const resolvers = this.pendingResolvers.get(videoId);
    if (resolvers) {
      resolvers.forEach(({ resolve, timeoutId }) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: "Analysis cancelled by user",
          cancelled: true,
        });
      });
      this.pendingResolvers.delete(videoId);
    }

    return Boolean(controller);
  }

  /**
   * Create an analysis job on the backend.
   * @param {string} videoUrl - Full YouTube video URL.
   * @param {Object} [options] - Options including forceOverride, metadata, and signal.
   * @returns {Promise<Object>} Backend job response object with job_id.
   */
  async createAnalysisJob(videoUrl, options = {}) {
    const requestBody = {
      url: videoUrl,
      force_override: Boolean(options.forceOverride || options.force_override),
    };

    if (options.metadata) {
      requestBody.metadata = options.metadata;
    }

    const response = await fetch(`${this.baseUrl}/analyze/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText);
    }

    const jobData = await response.json();
    const jobId = jobData.job_id;

    // Validate job_id is present before polling
    if (!jobId || typeof jobId !== "string" || jobId.trim() === "") {
      console.error(
        `[PerspectivePrismClient] Backend returned invalid job_id (type: ${typeof jobId})`,
      );
      throw new ValidationError("Backend returned invalid job_id");
    }

    return jobData;
  }

  /**
   * Make the actual HTTP request using the async job API.
   * @param {string} videoUrl
   * @param {string} videoId
   * @param {Object} [options]
   */
  async makeAnalysisRequest(videoUrl, videoId, options = {}) {
    const controller = new AbortController();
    let isTimeout = false;

    // Store abort controller for cancellation
    this.abortControllers.set(videoId, controller);

    const timeoutId = setTimeout(() => {
      isTimeout = true;
      controller.abort();
    }, this.TIMEOUT_MS);

    // Progress tracking
    const progressIntervals = [10000, 30000, 60000, 90000];
    const progressTimers = [];

    progressIntervals.forEach((delay) => {
      const timer = setTimeout(() => {
        this.broadcastProgress(videoId, {
          status: "analyzing",
          elapsedMs: delay,
          message: delay === 10000 ? "Still analyzing..." : undefined,
        });
      }, delay);
      progressTimers.push(timer);
    });

    try {
      // 1. Submit Job
      console.log(`[PerspectivePrismClient] Submitting job for ${videoId}`);
      const jobData = await this.createAnalysisJob(videoUrl, {
        ...options,
        signal: controller.signal,
      });
      const jobId = jobData.job_id;

      console.log(`[PerspectivePrismClient] Job submitted: ${jobId}`);

      // 2. Poll for Completion
      const result = await this.pollJobStatus(jobId, controller.signal);

      this.validateAnalysisData(result);
      return result;
    } catch (error) {
      if (error.name === "AbortError" || controller.signal.aborted) {
        if (isTimeout) {
          throw new TimeoutError("Analysis request timed out");
        }
        const cancelErr = new Error("Analysis cancelled");
        cancelErr.name = "AbortError";
        // @ts-ignore
        cancelErr.isCancelled = true;
        throw cancelErr;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      progressTimers.forEach((t) => clearTimeout(t));
      // Clean up abort controller only if this controller is still current
      if (this.abortControllers.get(videoId) === controller) {
        this.abortControllers.delete(videoId);
      }
    }
  }

  /**
   * Poll the job status until completion or failure.
   * @param {string} jobId
   * @param {AbortSignal} signal
   */
  async pollJobStatus(jobId, signal) {
    const POLL_INTERVAL_MS = 2000; // 2 seconds

    while (!signal.aborted) {
      try {
        const response = await fetch(`${this.baseUrl}/analyze/jobs/${jobId}`, {
          signal,
        });

        if (!response.ok) {
          // If 404, maybe job lost? Treat as error.
          throw new HttpError(response.status, response.statusText);
        }

        const statusData = await response.json();
        console.log(
          `[PerspectivePrismClient] Job ${jobId} status: ${statusData.status}`,
        );

        if (statusData.status === "completed") {
          return statusData.result;
        } else if (statusData.status === "failed") {
          throw new Error(
            statusData.error || "Job failed without error message",
          );
        }

        // If pending or processing, wait and retry
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      } catch (error) {
        if (signal.aborted) throw error;
        // If network error during polling, maybe retry a few times?
        // For now, let's just throw to trigger the main retry logic if it's a fetch error.
        throw error;
      }
    }
    throw new TimeoutError("Polling aborted");
  }

  broadcastProgress(videoId, progressData) {
    // Query tabs that match YouTube patterns (we have host permissions for these)
    chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs
          .sendMessage(tab.id, {
            type: "ANALYSIS_PROGRESS",
            videoId,
            payload: progressData,
          })
          .catch(() => {});
      }
    });
  }

  shouldRetryError(error) {
    // Don't retry validation errors or cancellations
    if (
      error instanceof ValidationError ||
      error.name === "AbortError" ||
      // @ts-ignore
      error.isCancelled ||
      error.message?.includes("cancelled") ||
      error.message?.includes("aborted")
    ) {
      return false;
    }

    // Retry on TimeoutError
    if (error instanceof TimeoutError) {
      return true;
    }

    // Retry on HttpError if 5xx or 429
    if (error instanceof HttpError) {
      if (error.status === 429 || error.status >= 500) {
        return true;
      }
      return false; // Don't retry other 4xx errors
    }

    // Retry on network errors (fetch failures usually don't have status)
    return true;
  }

  formatUserError(error) {
    if (error instanceof ValidationError) {
      return "The analysis data received was invalid. Please try again.";
    }
    if (error instanceof TimeoutError) {
      return "The analysis took too long. Please try again later.";
    }
    if (error instanceof HttpError) {
      if (error.status === 429) {
        return "Too many requests. Please wait a moment and try again.";
      }
      if (error.status >= 500) {
        return "Our servers are experiencing issues. Please try again later.";
      }
      return `Unable to complete analysis (Error ${error.status}).`;
    }

    // Handle network/connection errors (TypeError from fetch when backend is offline)
    if (
      error instanceof TypeError &&
      error.message &&
      (error.message.toLowerCase().includes("fetch") ||
        error.message.toLowerCase().includes("failed to fetch") ||
        error.message.toLowerCase().includes("networkerror"))
    ) {
      return "Cannot connect to Perspective Prism. Check your backend URL in settings.";
    }

    // Handle generic network errors
    if (
      error.message &&
      (error.message.includes("network") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("connection"))
    ) {
      return "Cannot connect to Perspective Prism. Check your backend URL in settings.";
    }

    return "An unexpected error occurred. Please try again.";
  }

  // --- Cache Management ---

  /**
   * Check cache for a video ID.
   * @param {string} videoId
   * @returns {Promise<Object|null>} Cached data or null if miss/expired
   */
  async checkCache(videoId) {
    if (this.delegateCache) {
      const response = await chrome.runtime.sendMessage({
        type: "CHECK_CACHE",
        videoId: videoId
      });
      if (response && response.success) {
        return response.data;
      }
      return null;
    }

    const legacyKey = `cache_${videoId}`;
    const prefix = `cache_${videoId}_`;
    const ttlMs = await this.getCacheTtlMs();

    // Check in-memory cache first (fallback)
    const validMem = [];
    for (const [memKey, entry] of this.inMemoryCache.entries()) {
      if (memKey === legacyKey || memKey.startsWith(prefix)) {
        if (this.isExpired(entry, ttlMs)) {
          this.inMemoryCache.delete(memKey);
        } else {
          validMem.push(entry);
        }
      }
    }
    if (validMem.length > 0) {
      validMem.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      return validMem[0].data;
    }

    try {
      const allStorage = await chrome.storage.local.get(null);
      const matchingKeys = Object.keys(allStorage).filter(
        (k) => k === legacyKey || k.startsWith(prefix),
      );

      if (matchingKeys.length === 0) return null;

      const validEntries = [];
      const expiredKeys = [];

      const ttlMs = await this.getCacheTtlMs();
      for (const k of matchingKeys) {
        const entry = allStorage[k];
        if (this.isExpired(entry, ttlMs)) {
          expiredKeys.push(k);
        } else {
          validEntries.push({ key: k, entry });
        }
      }

      if (expiredKeys.length > 0) {
        chrome.storage.local.remove(expiredKeys).catch(() => {});
      }

      if (validEntries.length === 0) return null;

      // Sort by timestamp descending (newest entry first)
      validEntries.sort((a, b) => (b.entry.timestamp || 0) - (a.entry.timestamp || 0));
      const newestItem = validEntries[0];
      let entry = newestItem.entry;
      const key = newestItem.key;

      // Apply Migrations
      const migratedEntry = await this.migrateCacheEntry(entry);

      if (!migratedEntry) {
        console.log(
          `[PerspectivePrismClient] Cache entry corrupted or migration failed for ${videoId}`,
        );
        await chrome.storage.local.remove(key);
        // Track cache miss due to migration failure
        if (this.metricsTracker) {
          try {
            await this.metricsTracker.recordCacheMiss(videoId);
          } catch (metricsError) {
            console.warn(
              "[PerspectivePrismClient] Failed to record cache miss metric:",
              metricsError,
            );
          }
        }
        return null;
      }

      // If migration occurred, save the updated entry
      if (migratedEntry !== entry) {
        console.log(
          `[PerspectivePrismClient] Saving migrated entry for ${videoId}`,
        );
        await chrome.storage.local.set({ [key]: migratedEntry });
        entry = migratedEntry;
      }

      // Update lastAccessed (async, don't wait)
      entry.lastAccessed = Date.now();
      chrome.storage.local.set({ [key]: entry });

      // Track cache hit
      if (this.metricsTracker) {
        try {
          await this.metricsTracker.recordCacheHit(videoId);
        } catch (metricsError) {
          console.warn(
            "[PerspectivePrismClient] Failed to record cache hit metric:",
            metricsError,
          );
        }
      }

      return entry.data;
    } catch (error) {
      console.error(
        `[PerspectivePrismClient] Cache check failed for ${videoId}:`,
        error,
      );
      // Track cache miss due to error
      if (this.metricsTracker) {
        try {
          await this.metricsTracker.recordCacheMiss(videoId);
        } catch (metricsError) {
          console.warn(
            "[PerspectivePrismClient] Failed to record cache miss metric:",
            metricsError,
          );
        }
      }
      return null;
    }
  }

  /**
   * Save analysis result to cache.
   * @param {string} videoId
   * @param {Object} data
   */
  async saveToCache(videoId, data) {
    // Validate data before caching
    try {
      this.validateAnalysisData(data);
    } catch (e) {
      console.error(
        `[PerspectivePrismClient] Refusing to cache invalid data for ${videoId}:`,
        e,
      );
      throw e;
    }

    if (this.delegateCache) {
      const response = await chrome.runtime.sendMessage({
        type: "SAVE_TO_CACHE",
        videoId: videoId,
        data: data
      });
      if (response && !response.success) {
        throw new Error(response.error || "Failed to save to cache");
      }
      return;
    }

    const contentHash =
      data.content_hash ||
      data.metadata?.content_hash ||
      (await this.computeContentHash(data));
    const key = `cache_${videoId}_${contentHash}`;
    const entry = {
      schemaVersion: PerspectivePrismClient.CURRENT_SCHEMA_VERSION,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      contentHash: contentHash,
      data: data,
    };

    // Check entry size (1 MB limit)
    const entrySize = this.estimateSize(entry);
    const MAX_ENTRY_SIZE = 1 * 1024 * 1024; // 1 MB in bytes

    if (entrySize === 0) {
      console.error(
        `[PerspectivePrismClient] Failed to estimate size for ${videoId}`,
      );
      throw new Error("Failed to estimate entry size");
    }

    if (entrySize > MAX_ENTRY_SIZE) {
      const sizeMB = (entrySize / (1024 * 1024)).toFixed(2);
      console.error(
        `[PerspectivePrismClient] Entry too large to cache for ${videoId}: ` +
          `${sizeMB} MB (max: 1 MB)`,
      );
      throw new Error("Entry too large to cache");
    }

    // Check quota and ensure space is available
    if (this.quotaManager) {
      const hasSpace = await this.quotaManager.ensureSpace(entrySize);
      if (!hasSpace) {
        const sizeMB = (entrySize / (1024 * 1024)).toFixed(2);
        console.error(
          `[PerspectivePrismClient] Cannot cache ${videoId}: ` +
            `Entry size (${sizeMB} MB) exceeds available quota after eviction`,
        );
        throw new Error("Entry too large to fit in quota");
      }
    }

    try {
      await chrome.storage.local.set({ [key]: entry });
      // Note: enforceCacheLimits is now handled by QuotaManager.ensureSpace
      // Only call if QuotaManager is not available (fallback)
      if (!this.quotaManager) {
        this.enforceCacheLimits();
      }
    } catch (error) {
      console.error(
        `[PerspectivePrismClient] Failed to save to cache for ${videoId}:`,
        error,
      );
      // Fallback to in-memory cache
      console.log(`[PerspectivePrismClient] Falling back to in-memory cache for ${videoId}`);
      this.inMemoryCache.set(key, entry);
    }
  }

  /**
   * Internal SHA-256 helper for client caching
   * @param {string} str
   * @returns {Promise<string>}
   */
  async sha256Hex(str) {
    try {
      const cryptoObj =
        typeof globalThis !== "undefined"
          ? globalThis.crypto
          : typeof crypto !== "undefined"
            ? crypto
            : null;
      const encoderObj =
        typeof globalThis !== "undefined" && globalThis.TextEncoder
          ? globalThis.TextEncoder
          : typeof TextEncoder !== "undefined"
            ? TextEncoder
            : null;
      if (cryptoObj && cryptoObj.subtle && cryptoObj.subtle.digest && encoderObj) {
        const encoder = new encoderObj();
        const data = encoder.encode(str);
        const hashBuffer = await cryptoObj.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        return hashHex.slice(0, 16);
      }
    } catch (_e) {
      // Fallback
    }
    // High-entropy 64-bit dual-pass hash fallback (DJB2 + SDBM) if crypto.subtle is unavailable
    let h1 = 5381;
    let h2 = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      h1 = Math.imul(h1, 33) ^ char;
      h2 = char + (h2 << 6) + (h2 << 16) - h2;
      h1 |= 0;
      h2 |= 0;
    }
    return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  }

  /**
   * Compute a content hash for data when not provided by backend
   * @param {Object|string} data
   * @returns {Promise<string>}
   */
  async computeContentHash(data) {
    if (!data) return "default";
    if (typeof data === "string") {
      return this.sha256Hex(data);
    }
    if (data.content_hash && typeof data.content_hash === "string") {
      return data.content_hash;
    }
    if (data.metadata?.content_hash && typeof data.metadata.content_hash === "string") {
      return data.metadata.content_hash;
    }
    try {
      const jsonString = JSON.stringify(data);
      return await this.sha256Hex(jsonString);
    } catch (_err) {
      return "default";
    }
  }

  /**
   * Estimate the size of a cache entry in bytes.
   * @param {Object} entry - The cache entry to estimate
   * @returns {number} - Estimated size in bytes
   */
  estimateSize(entry) {
    try {
      // Convert to JSON string to get a rough size estimate
      const jsonString = JSON.stringify(entry);
      // UTF-16 encoding: 2 bytes per character
      return jsonString.length * 2;
    } catch (e) {
      console.error(
        "[PerspectivePrismClient] Failed to estimate entry size:",
        e,
      );
      // Return a conservative estimate if stringification fails
      return 0;
    }
  }

  isCacheEntry(key, entry) {
    if (!key || typeof key !== "string" || !key.startsWith("cache_")) {
      return false;
    }
    const reserved = new Set(["cache_metrics", "cache_metadata", "cache_stats", "cache_settings"]);
    if (reserved.has(key)) {
      return false;
    }
    if (entry !== undefined && entry !== null) {
      if (typeof entry !== "object") return false;
      return Boolean(entry.data || entry.timestamp || entry.videoId);
    }
    return true;
  }

  /**
   * Enforce LRU cache limits.
   */
  async enforceCacheLimits() {
    try {
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all).filter((k) => this.isCacheEntry(k, all[k]));

      if (cacheKeys.length <= this.MAX_CACHE_ITEMS) return;

      // Sort by lastAccessed (ascending - oldest first)
      const entries = cacheKeys.map((key) => ({ key, ...all[key] }));
      entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

      // Remove oldest items
      const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_ITEMS);
      const keysToRemove = toRemove.map((e) => e.key);

      if (keysToRemove.length > 0) {
        console.log(
          `[PerspectivePrismClient] Evicting ${keysToRemove.length} items from cache`,
        );
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      console.error(
        "[PerspectivePrismClient] Failed to enforce cache limits:",
        error,
      );
    }
  }

  /**
   * Get configured TTL in milliseconds from storage settings
   * @returns {Promise<number>}
   */
  async getCacheTtlMs() {
    try {
      const syncStorage = await chrome.storage.sync.get("config");
      if (typeof syncStorage?.config?.cacheDuration === "number" && syncStorage.config.cacheDuration > 0) {
        return syncStorage.config.cacheDuration * 60 * 60 * 1000;
      }
      const localStorage = await chrome.storage.local.get("config");
      if (typeof localStorage?.config?.cacheDuration === "number" && localStorage.config.cacheDuration > 0) {
        return localStorage.config.cacheDuration * 60 * 60 * 1000;
      }
    } catch (_e) {
      // Fallback
    }
    return this.CACHE_TTL_MS;
  }

  /**
   * Check if a cache entry is expired.
   * @param {Object} entry - The cache entry to check
   * @param {number} [customTtlMs] - Optional custom TTL in milliseconds
   * @returns {boolean} - True if expired, false otherwise
   */
  isExpired(entry, customTtlMs = null) {
    if (!entry || !entry.timestamp) {
      return true;
    }
    const ttlMs = customTtlMs || this.CACHE_TTL_MS;
    const age = Date.now() - entry.timestamp;
    return age > ttlMs;
  }

  /**
   * Clean up all expired cache entries.
   * Can be called on startup for automatic cleanup.
   */
  async cleanupExpiredCache() {
    try {
      const ttlMs = await this.getCacheTtlMs();
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all).filter((k) => this.isCacheEntry(k, all[k]));
      const keysToRemove = [];

      for (const key of cacheKeys) {
        const entry = all[key];
        if (this.isExpired(entry, ttlMs)) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        console.log(
          `[PerspectivePrismClient] Cleaning up ${keysToRemove.length} expired cache items`,
        );
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      console.error(
        "[PerspectivePrismClient] Failed to cleanup expired cache:",
        error,
      );
    }
  }

  /**
   * Clear all cached data.
   * Removes all cache entries from storage.
   */
  async clear() {
    try {
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all).filter((k) => this.isCacheEntry(k, all[k]));

      if (cacheKeys.length > 0) {
        console.log(
          `[PerspectivePrismClient] Clearing ${cacheKeys.length} cache items`,
        );
        await chrome.storage.local.remove(cacheKeys);
      }
    } catch (error) {
      console.error("[PerspectivePrismClient] Failed to clear cache:", error);
      throw error;
    }
  }

  /**
   * Remove a single cache entry by video ID.
   * @param {string} videoId - The video ID to remove from cache
   */
  async remove(videoId) {
    const legacyKey = `cache_${videoId}`;
    const prefix = `cache_${videoId}_`;
    try {
      const all = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(all).filter(
        (k) => k === legacyKey || k.startsWith(prefix),
      );
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      } else {
        await chrome.storage.local.remove(legacyKey);
      }
      for (const k of Array.from(this.inMemoryCache.keys())) {
        if (k === legacyKey || k.startsWith(prefix)) {
          this.inMemoryCache.delete(k);
        }
      }
      console.log(
        `[PerspectivePrismClient] Removed cache entry for ${videoId}`,
      );
    } catch (error) {
      console.error(
        `[PerspectivePrismClient] Failed to remove cache entry for ${videoId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get cache statistics.
   * @returns {Promise<Object>} Statistics object with totalEntries, totalSize, lastCleanup
   */
  async getStats() {
    try {
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all).filter((k) => this.isCacheEntry(k, all[k]));

      let totalSize = 0;
      for (const key of cacheKeys) {
        const entry = all[key];
        totalSize += this.estimateSize(entry);
      }

      return {
        totalEntries: cacheKeys.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        lastCleanup: Date.now(), // Could persist this separately if needed
      };
    } catch (error) {
      console.error(
        "[PerspectivePrismClient] Failed to get cache stats:",
        error,
      );
      return {
        totalEntries: 0,
        totalSize: 0,
        totalSizeMB: "0.00",
        lastCleanup: Date.now(),
      };
    }
  }

  /**
   * Get cache statistics (wrapper for getStats).
   * @returns {Promise<Object>} Statistics object with totalEntries, totalSize, lastCleanup
   */
  async getCacheStats() {
    return this.getStats();
  }

  /**
   * Clear all cached data (wrapper for clear).
   * Removes all cache entries from storage.
   */
  async clearCache() {
    return this.clear();
  }

  /**
   * Migrates a cache entry to the current schema version.
   * @param {Object} entry - The cache entry to migrate.
   * @returns {Promise<Object|null>} - The migrated entry, or null if migration failed.
   */
  async migrateCacheEntry(entry) {
    let currentVersion = entry.schemaVersion || 0;

    // If it's already current, return it
    if (currentVersion === PerspectivePrismClient.CURRENT_SCHEMA_VERSION) {
      return entry;
    }

    // If it's newer than what we know, discard it (forward compatibility)
    if (currentVersion > PerspectivePrismClient.CURRENT_SCHEMA_VERSION) {
      console.warn(
        `[PerspectivePrismClient] Cache entry version ${currentVersion} is newer than supported ${PerspectivePrismClient.CURRENT_SCHEMA_VERSION}`,
      );
      return null;
    }

    // Apply migrations sequentially
    let migratedEntry = { ...entry }; // Shallow copy to avoid mutating original if we fail mid-way (though we return null anyway)

    while (currentVersion < PerspectivePrismClient.CURRENT_SCHEMA_VERSION) {
      const migrationFn =
        PerspectivePrismClient.SCHEMA_MIGRATIONS[currentVersion];
      if (!migrationFn) {
        console.error(
          `[PerspectivePrismClient] No migration function for version ${currentVersion}`,
        );
        return null;
      }

      console.log(
        `[PerspectivePrismClient] Migrating cache entry from v${currentVersion} to v${currentVersion + 1}`,
      );
      try {
        // Bind 'this' to the migration function if it needs instance context (e.g. validateAnalysisData)
        // Since we defined migrations as static/bound in constructor before, now they are static map.
        // But validateAnalysisData is an instance method.
        // We need to handle this carefully.
        // Option 1: Pass 'this' as context to migration function.
        // Option 2: Make migration functions static or standalone.
        // Given validateAnalysisData is instance method, let's bind it when calling or pass context.
        // Actually, the previous implementation bound it in constructor: `0: this.migrateV0ToV1.bind(this)`
        // Now we are moving to static.
        // Let's define the static map to use a static version of migrateV0ToV1 or pass the client instance.
        // Simpler: Call the function with `this` as the context: migrationFn.call(this, migratedEntry)
        const result = migrationFn.call(this, migratedEntry);

        if (!result) {
          console.warn(
            `[PerspectivePrismClient] Migration from v${currentVersion} failed (returned null)`,
          );
          return null;
        }
        migratedEntry = result;
        currentVersion++;

        // Ensure version was updated
        if (migratedEntry.schemaVersion !== currentVersion) {
          migratedEntry.schemaVersion = currentVersion;
        }
      } catch (e) {
        console.error(
          `[PerspectivePrismClient] Exception during migration from v${currentVersion}:`,
          e,
        );
        return null;
      }
    }

    return migratedEntry;
  }

  /**
   * Migration: V0 -> V1
   * Adds schemaVersion field and validates structure.
   */
  migrateV0ToV1(entry) {
    // Validate structure
    if (!entry || !entry.data) return null;

    try {
      // We can use the existing validation logic
      this.validateAnalysisData(entry.data);
    } catch (e) {
      console.warn(
        "[PerspectivePrismClient] V0->V1 Migration: Data validation failed:",
        e,
      );
      return null;
    }

    // Transform
    const newEntry = { ...entry };
    newEntry.schemaVersion = 1;
    // Remove legacy version field if present
    if (newEntry.version) {
      delete newEntry.version;
    }

    return newEntry;
  }

  logError(context, error) {
    // Sanitize error message to remove potential PII or tokens
    let message = error.message || "Unknown error";

    // If error is an object (like from fetch), try to stringify it
    if (typeof error === "object" && error !== null) {
      try {
        // If it's an Error object, it has message property handled above.
        // If it's a plain object, stringify it.
        if (!(error instanceof Error)) {
          message = JSON.stringify(error);
        }
      } catch (e) {
        message = "[Circular or Unserializable Object]";
      }
    }

    // Redact potential URLs
    message = message.replace(/https?:\/\/[^\s]+/g, "[URL REDACTED]");

    console.error(`[PerspectivePrismClient] ${context}: ${message}`, {
      name: error.name,
      stack: error.stack,
    });
  }

  // --- Persistence & Lifecycle ---

  async persistRequestState(state) {
    const key = `pending_request_${state.videoId}`;

    // Read-modify-write to preserve existing fields (like startTime)
    // This ensures that retries don't reset the original start time if it's not provided in the new state.
    // Although executeAnalysisRequest currently passes Date.now(), this pattern is safer for future changes.
    try {
      const existing = await chrome.storage.local.get(key);
      const existingState = existing[key] || {};

      // Merge existing state with new state, prioritizing new state values
      // but preserving startTime from existing if not in new (or if we want to enforce original)
      // For now, we just merge.
      const newState = { ...existingState, ...state };

      // If we want to strictly preserve original startTime even if state has a new one:
      if (existingState.startTime) {
        newState.startTime = existingState.startTime;
      }

      await chrome.storage.local.set({ [key]: newState });
    } catch (error) {
      console.error(
        `[PerspectivePrismClient] Failed to persist request state for ${state.videoId}:`,
        error,
      );
    }
  }

  async getPersistedRequestState(videoId) {
    const key = `pending_request_${videoId}`;
    const result = await chrome.storage.local.get(key);
    return result[key];
  }

  async cleanupPersistedRequest(videoId) {
    const key = `pending_request_${videoId}`;
    await chrome.storage.local.remove(key);

    // Clear alarms
    // We can't wildcard clear easily without listing all, but we can clear specific ones if we know the attempt.
    // Or just clear all alarms starting with prefix.
    const alarms = await chrome.alarms.getAll();
    for (const alarm of alarms) {
      if (alarm.name.startsWith(`retry::${videoId}::`)) {
        await chrome.alarms.clear(alarm.name);
      }
    }
  }

  async recoverPersistedRequests() {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) =>
      k.startsWith("pending_request_"),
    );

    for (const key of keys) {
      const state = all[key];
      const age = Date.now() - (state.startTime || 0); // Handle missing startTime

      if (age > this.MAX_REQUEST_AGE) {
        console.log(
          `[PerspectivePrismClient] Cleaning up stale request ${state.videoId}`,
        );
        await this.cleanupPersistedRequest(state.videoId);
      } else {
        console.log(
          `[PerspectivePrismClient] Recovering request ${state.videoId}`,
        );

        // Rate limiting: wait 500ms between recoveries to avoid overwhelming backend
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (state.status === "pending") {
          // Interrupted during execution, retry immediately
          await this.executeAnalysisRequest(
            state.videoId,
            state.videoUrl,
            state.attemptCount,
            state.options || {},
          );
        } else if (state.status === "retrying") {
          // Check if alarm exists
          const nextAttempt = state.attemptCount + 1; // Assuming stored attempt is the last failed one
          // Actually, in executeAnalysisRequest we store attemptCount: attempt + 1 BEFORE scheduling alarm.
          // So state.attemptCount IS the attempt we are waiting for.
          const alarmName = `retry::${state.videoId}::${state.attemptCount}`;
          const alarm = await chrome.alarms.get(alarmName);

          if (!alarm) {
            console.warn(
              `[PerspectivePrismClient] Missing alarm for ${state.videoId}, rescheduling immediately`,
            );
            // If alarm is missing, execute it now to be safe and simple.
            await this.executeAnalysisRequest(
              state.videoId,
              state.videoUrl,
              state.attemptCount,
              state.options || {},
            );
          }
        }
      }
    }

    console.log("[PerspectivePrismClient] Recovery complete");
    this.recoveryComplete = true;
    this.processRequestQueue();
  }

  async processRequestQueue() {
    if (this.requestQueue.length === 0) return;

    console.log(
      `[PerspectivePrismClient] Processing ${this.requestQueue.length} queued requests`,
    );

    // Process queue
    while (this.requestQueue.length > 0) {
      const { videoId, options, resolve, reject } = this.requestQueue.shift();
      try {
        const result = await this.performAnalysis(videoId, options || {});
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
  }

  setupAlarmListener() {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name.startsWith("retry::")) {
        const parts = alarm.name.split("::");
        // Format: retry::videoId::attempt
        if (parts.length !== 3) return;

        const videoId = parts[1];
        // We don't rely on the attempt from alarm name anymore, but it's there if needed.
        const alarmAttempt = parseInt(parts[2], 10);

        console.log(`[PerspectivePrismClient] Alarm fired for ${videoId}`);
        const state = await this.getPersistedRequestState(videoId);

        if (state) {
          // Use state.attemptCount to ensure we are in sync with persistence
          await this.executeAnalysisRequest(
            videoId,
            state.videoUrl,
            state.attemptCount,
            state.options || {},
          );
          // executeAnalysisRequest handles notification on completion
        } else {
          // Fallback for missing state
          console.error(
            `[PerspectivePrismClient] Alarm fired for ${videoId} but no persisted state found. Alarm attempt: ${alarmAttempt}`,
          );
          this.notifyCompletion(videoId, {
            error: "Analysis failed: State lost during recovery",
          });
        }
      }
    });
  }

  notifyCompletion(videoId, result) {
    // 1. Broadcast to tabs
    chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs
          .sendMessage(tab.id, {
            type: "ANALYSIS_RESULT",
            videoId,
            data: result.data,
            error: result.error,
            success: result.success,
          })
          .catch(() => {}); // Ignore errors for tabs that don't listen
      }
    });

    // 2. Resolve pending local promises
    const resolvers = this.pendingResolvers.get(videoId);
    if (resolvers) {
      resolvers.forEach(({ resolve, timeoutId }) => {
        clearTimeout(timeoutId);
        resolve(result);
      });
      this.pendingResolvers.delete(videoId);
    }
  }

  removeResolver(videoId, resolve) {
    const resolvers = this.pendingResolvers.get(videoId);
    if (resolvers) {
      const index = resolvers.findIndex((r) => r.resolve === resolve);
      if (index !== -1) {
        resolvers.splice(index, 1);
        if (resolvers.length === 0) {
          this.pendingResolvers.delete(videoId);
        }
      }
    }
  }

  validateAnalysisData(data) {
    if (!data) {
      throw new ValidationError("Response data is null or undefined");
    }

    // Validate video_id
    if (
      typeof data.video_id !== "string" ||
      !/^[a-zA-Z0-9_-]{11}$/.test(data.video_id)
    ) {
      throw new ValidationError(
        "Invalid or missing video_id: must be an 11-character string",
      );
    }

    // Validate metadata
    if (!data.metadata || typeof data.metadata !== "object") {
      throw new ValidationError("Missing metadata object");
    }
    if (typeof data.metadata.analyzed_at !== "string") {
      throw new ValidationError("Missing or invalid metadata.analyzed_at");
    }

    // Validate eligibility if present
    if (data.eligibility !== undefined && data.eligibility !== null) {
      if (typeof data.eligibility !== "object") {
        throw new ValidationError("eligibility must be an object");
      }
      const el = data.eligibility;
      if (typeof el.is_analysable !== "boolean") {
        throw new ValidationError("eligibility.is_analysable must be a boolean");
      }
      if (
        typeof el.confidence_score !== "number" ||
        el.confidence_score < 0 ||
        el.confidence_score > 1
      ) {
        throw new ValidationError(
          "eligibility.confidence_score must be a number between 0 and 1",
        );
      }
      if (typeof el.detected_category !== "string") {
        throw new ValidationError(
          "eligibility.detected_category must be a string",
        );
      }
      if (typeof el.disclaimer_title !== "string") {
        throw new ValidationError(
          "eligibility.disclaimer_title must be a string",
        );
      }
      if (typeof el.disclaimer_message !== "string") {
        throw new ValidationError(
          "eligibility.disclaimer_message must be a string",
        );
      }
      if (!Array.isArray(el.key_topics_found)) {
        throw new ValidationError(
          "eligibility.key_topics_found must be an array",
        );
      }
    }

    // Validate claims
    if (!Array.isArray(data.claims)) {
      throw new ValidationError("claims must be an array");
    }

    const CANONICAL_TRUTH_THEORIES = new Set([
      "Correspondence (Empirical)",
      "Coherence (Systemic Narrative)",
      "Pragmatic (Practical Utility)",
      "Perspectivism (Lived Experience)",
      "Consensus (Institutional Agreement)",
      "Deflationary (Rhetorical Endorsement)",
    ]);

    data.claims.forEach((claim, index) => {
      if (typeof claim.claim_text !== "string") {
        throw new ValidationError(`Claim at index ${index} missing claim_text`);
      }

      // Validate truth_profile
      if (!claim.truth_profile || typeof claim.truth_profile !== "object") {
        throw new ValidationError(
          `Claim at index ${index} missing truth_profile`,
        );
      }

      const tp = claim.truth_profile;
      if (typeof tp.overall_assessment !== "string") {
        throw new ValidationError(
          `Claim at index ${index} missing overall_assessment`,
        );
      }

      // Validate perspectives
      if (!tp.perspectives || typeof tp.perspectives !== "object") {
        throw new ValidationError(
          `Claim at index ${index} missing perspectives object`,
        );
      }

      // Validate bias_indicators
      if (!tp.bias_indicators || typeof tp.bias_indicators !== "object") {
        throw new ValidationError(
          `Claim at index ${index} missing bias_indicators`,
        );
      }

      const bi = tp.bias_indicators;
      if (!Array.isArray(bi.logical_fallacies)) {
        throw new ValidationError(
          `Claim at index ${index} invalid logical_fallacies array`,
        );
      }
      if (!Array.isArray(bi.emotional_manipulation)) {
        throw new ValidationError(
          `Claim at index ${index} invalid emotional_manipulation array`,
        );
      }
      if (
        bi.deception_score !== undefined &&
        bi.deception_score !== null &&
        typeof bi.deception_score !== "number"
      ) {
        throw new ValidationError(
          `Claim at index ${index} invalid deception_score`,
        );
      }

      // Validate alethiology if present
      if (tp.alethiology !== undefined && tp.alethiology !== null) {
        if (typeof tp.alethiology !== "object") {
          throw new ValidationError(
            `Claim at index ${index} alethiology must be an object`,
          );
        }
        const ale = tp.alethiology;
        if (
          typeof ale.primary_theory !== "string" ||
          !CANONICAL_TRUTH_THEORIES.has(ale.primary_theory)
        ) {
          throw new ValidationError(
            `Claim at index ${index} invalid primary_theory in alethiology`,
          );
        }
        if (ale.secondary_theory !== undefined && ale.secondary_theory !== null) {
          if (
            typeof ale.secondary_theory !== "string" ||
            !CANONICAL_TRUTH_THEORIES.has(ale.secondary_theory)
          ) {
            throw new ValidationError(
              `Claim at index ${index} invalid secondary_theory in alethiology`,
            );
          }
        }
        if (typeof ale.epistemic_summary !== "string") {
          throw new ValidationError(
            `Claim at index ${index} missing epistemic_summary in alethiology`,
          );
        }
        if (!Array.isArray(ale.quote_evidences)) {
          throw new ValidationError(
            `Claim at index ${index} quote_evidences must be an array`,
          );
        }
      }
    });

    return true;
  }
}

// Static Constants
PerspectivePrismClient.CURRENT_SCHEMA_VERSION = 1;
PerspectivePrismClient.SCHEMA_MIGRATIONS = {
  0: function (entry) {
    // Use 'this' to access instance methods like validateAnalysisData
    return this.migrateV0ToV1(entry);
  },
};

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

class HttpError extends Error {
  constructor(status, statusText) {
    super(`HTTP error ${status}: ${statusText}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
  }
}

class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

// ES Module Exports (for unit testing and modern imports)
export { PerspectivePrismClient, ValidationError, HttpError, TimeoutError };

// Default export
export default PerspectivePrismClient;
