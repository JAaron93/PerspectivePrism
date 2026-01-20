/**
 * PerspectivePrismClient
 * Handles API communication with the backend, including retry logic and state persistence.
 */
class PerspectivePrismClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.pendingRequests = new Map(); // In-memory deduplication
    this.abortControllers = new Map(); // Map<videoId, AbortController> for cancellation
    this.MAX_RETRIES = 2;
    this.RETRY_DELAYS = [2000, 4000]; // Exponential backoff: 2s, 4s
    this.TIMEOUT_MS = 120000; // 120 seconds
    this.MAX_REQUEST_AGE = 300000; // 5 minutes

    // Cache Configuration
    this.CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    this.MAX_CACHE_ITEMS = 50;

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
   * @returns {Promise<Object>} - The analysis result.
   */
  async analyzeVideo(videoId) {
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
          this.requestQueue.push({ videoId, resolve, reject });
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

    return this.performAnalysis(videoId);
  }

  /**
   * Internal method to perform analysis logic (extracted from analyzeVideo)
   * @param {string} videoId
   */
  async performAnalysis(videoId) {
    // 1. Check Cache
    const cachedResult = await this.checkCache(videoId);
    if (cachedResult) {
      logger.info(`[PerspectivePrismClient] Cache hit for ${videoId}`);
      return { success: true, data: cachedResult, cached: true };
    }

    // Deduplication (In-memory)
    if (this.pendingRequests.has(videoId)) {
      logger.info(
        `[PerspectivePrismClient] Returning existing promise for ${videoId}`,
      );
      return this.pendingRequests.get(videoId);
    }

    // Deduplication (Persistent)
    const persistedState = await this.getPersistedRequestState(videoId);
    if (persistedState && persistedState.status !== "completed") {
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

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Create a promise for this request
    const requestPromise = this.executeAnalysisRequest(videoId, videoUrl);
    this.pendingRequests.set(videoId, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.pendingRequests.delete(videoId);
    }
  }

  /**
   * Execute the analysis request with retry logic.
   * @param {string} videoId
   * @param {string} videoUrl
   * @param {number} attempt
   */
  async executeAnalysisRequest(videoId, videoUrl, attempt = 0) {
    // Persist state start
    await this.persistRequestState({
      videoId,
      videoUrl,
      startTime: Date.now(),
      attemptCount: attempt,
      status: "pending",
    });

    try {
      const result = await this.makeAnalysisRequest(videoUrl, videoId);

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
          startTime: Date.now(), // Keep original start time? Maybe better to track original.
          // For simplicity, let's update timestamp to now for the "last activity"
          // but we should probably keep the original start time if we want to timeout the whole thing.
          // Let's stick to the plan: store startTime.
          // We need to fetch the original start time if we want to preserve it,
          // or just pass it through. For now, let's just update the attempt count.
          attemptCount: attempt + 1,
          lastError: error.message,
          status: "retrying",
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
   * @returns {boolean} - True if request was cancelled, false if no request found
   */
  cancelAnalysis(videoId) {
    const controller = this.abortControllers.get(videoId);
    if (controller) {
      console.log(
        `[PerspectivePrismClient] Cancelling analysis for ${videoId}`,
      );
      controller.abort();
      this.abortControllers.delete(videoId);

      // Clean up pending request
      this.pendingRequests.delete(videoId);

      // Clean up persisted state
      this.cleanupPersistedRequest(videoId).catch((err) =>
        console.error(
          `[PerspectivePrismClient] Failed to cleanup after cancel:`,
          err,
        ),
      );

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

      return true;
    }
    return false;
  }

  /**
   * Make the actual HTTP request using the async job API.
   * @param {string} videoUrl
   * @param {string} videoId
   */
  async makeAnalysisRequest(videoUrl, videoId) {
    const controller = new AbortController();

    // Store abort controller for cancellation
    this.abortControllers.set(videoId, controller);

    const timeoutId = setTimeout(() => {
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
      const jobResponse = await fetch(`${this.baseUrl}/analyze/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: videoUrl }), // Backend expects 'url', not 'video_url'
        signal: controller.signal,
      });

      if (!jobResponse.ok) {
        throw new HttpError(jobResponse.status, jobResponse.statusText);
      }

      const jobData = await jobResponse.json();
      const jobId = jobData.job_id;

      // Validate job_id is present before polling
      if (!jobId || typeof jobId !== "string" || jobId.trim() === "") {
        console.error(
          `[PerspectivePrismClient] Backend returned invalid job_id (type: ${typeof jobId})`,
        );
        throw new ValidationError("Backend returned invalid job_id");
      }

      console.log(`[PerspectivePrismClient] Job submitted: ${jobId}`);

      // 2. Poll for Completion
      const result = await this.pollJobStatus(jobId, controller.signal);

      this.validateAnalysisData(result);
      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new TimeoutError("Analysis request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      progressTimers.forEach((t) => clearTimeout(t));
      // Clean up abort controller
      this.abortControllers.delete(videoId);
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
    // Don't retry validation errors
    if (error instanceof ValidationError) {
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
    // Primary cache key strategy: Simple key = `cache_{videoId}`
    // This ensures one analysis per video (latest overwrites previous)
    const key = `cache_${videoId}`;
    try {
      const result = await chrome.storage.local.get(key);
      let entry = result[key];

      if (!entry) return null;

      // Check expiration
      const age = Date.now() - entry.timestamp;
      if (age > this.CACHE_TTL_MS) {
        console.log(`[PerspectivePrismClient] Cache expired for ${videoId}`);
        await chrome.storage.local.remove(key);
        // Track cache miss due to expiration
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
      return;
    }

    const key = `cache_${videoId}`;
    const entry = {
      schemaVersion: PerspectivePrismClient.CURRENT_SCHEMA_VERSION,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
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
      throw error;
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

  /**
   * Enforce LRU cache limits.
   */
  async enforceCacheLimits() {
    try {
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all).filter((k) => k.startsWith("cache_"));

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
   * Check if a cache entry is expired.
   * @param {Object} entry - The cache entry to check
   * @returns {boolean} - True if expired, false otherwise
   */
  isExpired(entry) {
    if (!entry || !entry.timestamp) {
      return true;
    }
    const age = Date.now() - entry.timestamp;
    return age > this.CACHE_TTL_MS;
  }

  /**
   * Clean up all expired cache entries.
   * Can be called on startup for automatic cleanup.
   */
  async cleanupExpiredCache() {
    try {
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all).filter((k) => k.startsWith("cache_"));
      const keysToRemove = [];

      for (const key of cacheKeys) {
        const entry = all[key];
        if (this.isExpired(entry)) {
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
      const cacheKeys = Object.keys(all).filter((k) => k.startsWith("cache_"));

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
    const key = `cache_${videoId}`;
    try {
      await chrome.storage.local.remove(key);
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
      const cacheKeys = Object.keys(all).filter((k) => k.startsWith("cache_"));

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
   * @returns {Object|null} - The migrated entry, or null if migration failed.
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
            // If alarm is missing, we should probably just execute it now or schedule it.
            // Let's execute it now to be safe and simple.
            await this.executeAnalysisRequest(
              state.videoId,
              state.videoUrl,
              state.attemptCount,
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
      const { videoId, resolve, reject } = this.requestQueue.shift();
      try {
        const result = await this.performAnalysis(videoId);
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
          );
          // executeAnalysisRequest handles notification on completion
        } else {
          // Fallback for missing state
          console.error(
            `[PerspectivePrismClient] Alarm fired for ${videoId} but no persisted state found. Alarm attempt: ${alarmAttempt}`,
          );
          this.broadcastResult(videoId, {
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

    // Validate claims
    if (!Array.isArray(data.claims)) {
      throw new ValidationError("claims must be an array");
    }

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
      if (typeof bi.deception_score !== "number") {
        throw new ValidationError(
          `Claim at index ${index} invalid deception_score`,
        );
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
import { logger } from "./logging-utils.js";
export default PerspectivePrismClient;
