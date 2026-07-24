/**
 * CacheManager
 * Authoritative manager for chrome.storage.local analysis caching.
 * Key format: cache_${videoId}_${contentHash}
 * TTL: 7 days (604,800,000 ms)
 * Storage Ceiling: 10 MB (10,485,760 bytes)
 */

import { logger } from "./logging-utils.js";

export class CacheManager {
  static CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  static MAX_STORAGE_BYTES = 10 * 1024 * 1024; // 10 MB
  static CURRENT_SCHEMA_VERSION = 1;
  static RESERVED_KEYS = new Set([
    "cache_metrics",
    "cache_metadata",
    "cache_stats",
    "cache_settings",
  ]);

  constructor() {
    this.inMemoryCache = new Map();
  }

  /**
   * Check if a storage key (and optional entry object) is a video analysis cache entry
   * @param {string} key
   * @param {Object} [entry]
   * @returns {boolean}
   */
  isCacheEntry(key, entry) {
    if (!key || typeof key !== "string" || !key.startsWith("cache_")) {
      return false;
    }
    if (CacheManager.RESERVED_KEYS.has(key)) {
      return false;
    }
    if (entry !== undefined && entry !== null) {
      if (typeof entry !== "object") return false;
      return Boolean(entry.data || entry.timestamp || entry.videoId);
    }
    return true;
  }

  /**
   * Compute SHA-256 content hash for a string or object.
   * Returns a 16-character hex slice of the digest.
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
    } catch (err) {
      logger.warn("[CacheManager] Error stringifying data for hash:", err);
      return "default";
    }
  }

  /**
   * Internal SHA-256 helper
   * @param {string} str
   * @returns {Promise<string>}
   */
  async sha256Hex(str) {
    try {
      if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
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
   * Estimate entry size in bytes
   * @param {Object} entry
   * @returns {number}
   */
  estimateSize(entry) {
    try {
      const jsonString = JSON.stringify(entry);
      return jsonString.length * 2;
    } catch (_e) {
      return 0;
    }
  }

  /**
   * Get configured TTL in milliseconds from storage settings
   * @returns {Promise<number>}
   */
  async getTtlMs() {
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
      // Ignore storage read errors
    }
    return CacheManager.CACHE_TTL_MS;
  }

  /**
   * Check if entry is expired
   * @param {Object} entry
   * @param {number} [customTtlMs]
   * @returns {boolean}
   */
  isExpired(entry, customTtlMs = null) {
    if (!entry || !entry.timestamp) return true;
    const ttlMs = customTtlMs || CacheManager.CACHE_TTL_MS;
    return Date.now() - entry.timestamp > ttlMs;
  }

  /**
   * Build key schema: cache_${videoId}_${contentHash}
   * @param {string} videoId
   * @param {string} contentHash
   * @returns {string}
   */
  getCacheKey(videoId, contentHash) {
    return `cache_${videoId}_${contentHash || "default"}`;
  }

  /**
   * Check cache for a given videoId (and optional contentHash)
   * @param {string} videoId
   * @param {string} [contentHash]
   * @returns {Promise<Object|null>}
   */
  async checkCache(videoId, contentHash = null) {
    if (!videoId) return null;

    let ttlMs = CacheManager.CACHE_TTL_MS;
    try {
      ttlMs = await this.getTtlMs();

      if (contentHash) {
        const targetKey = this.getCacheKey(videoId, contentHash);
        const result = await chrome.storage.local.get(targetKey);
        const entry = result[targetKey];
        if (entry) {
          if (this.isExpired(entry, ttlMs)) {
            await chrome.storage.local.remove(targetKey);
            return null;
          }
          entry.lastAccessed = Date.now();
          chrome.storage.local.set({ [targetKey]: entry }).catch(() => {});
          return entry.data;
        }
      }

      // If contentHash is omitted or exact hashed key was not found:
      // Collect all matching keys: cache_${videoId} or cache_${videoId}_*
      const all = await chrome.storage.local.get(null);
      const prefix = `cache_${videoId}_`;
      const exactLegacyKey = `cache_${videoId}`;

      const matchingKeys = Object.keys(all).filter(
        (k) => k === exactLegacyKey || k.startsWith(prefix),
      );

      const validEntries = [];
      const expiredKeys = [];

      for (const key of matchingKeys) {
        const entry = all[key];
        if (this.isExpired(entry, ttlMs)) {
          expiredKeys.push(key);
        } else {
          validEntries.push({ key, entry });
        }
      }

      if (expiredKeys.length > 0) {
        chrome.storage.local.remove(expiredKeys).catch(() => {});
      }

      if (validEntries.length > 0) {
        // Sort by timestamp descending (newest entry first)
        validEntries.sort((a, b) => (b.entry.timestamp || 0) - (a.entry.timestamp || 0));
        const newest = validEntries[0];

        newest.entry.lastAccessed = Date.now();
        chrome.storage.local.set({ [newest.key]: newest.entry }).catch(() => {});
        return newest.entry.data;
      }

      // Check in-memory fallback
      const validMem = [];
      for (const [key, memEntry] of this.inMemoryCache.entries()) {
        if (key === exactLegacyKey || key.startsWith(prefix)) {
          if (!this.isExpired(memEntry, ttlMs)) {
            validMem.push(memEntry);
          } else {
            this.inMemoryCache.delete(key);
          }
        }
      }

      if (validMem.length > 0) {
        validMem.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return validMem[0].data;
      }

      return null;
    } catch (error) {
      logger.error(`[CacheManager] Cache check failed for ${videoId}:`, error);
      const prefix = `cache_${videoId}_`;
      const exactLegacyKey = `cache_${videoId}`;
      const targetKey = contentHash ? this.getCacheKey(videoId, contentHash) : null;

      if (targetKey && this.inMemoryCache.has(targetKey)) {
        const memEntry = this.inMemoryCache.get(targetKey);
        if (!this.isExpired(memEntry, ttlMs)) return memEntry.data;
      }

      const validMem = [];
      for (const [key, memEntry] of this.inMemoryCache.entries()) {
        if (key === exactLegacyKey || key.startsWith(prefix)) {
          if (!this.isExpired(memEntry, ttlMs)) {
            validMem.push(memEntry);
          } else {
            this.inMemoryCache.delete(key);
          }
        }
      }

      if (validMem.length > 0) {
        validMem.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return validMem[0].data;
      }

      return null;
    }
  }

  /**
   * Save result to cache with content hash
   * @param {string} videoId
   * @param {Object} data
   * @param {string} [contentHash]
   * @returns {Promise<void>}
   */
  async saveToCache(videoId, data, contentHash = null) {
    if (!videoId || !data) throw new Error("Invalid videoId or data for saveToCache");

    const hash = contentHash || (await this.computeContentHash(data));
    const key = this.getCacheKey(videoId, hash);

    const entry = {
      schemaVersion: CacheManager.CURRENT_SCHEMA_VERSION,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      contentHash: hash,
      data: data,
    };

    const entrySize = this.estimateSize(entry);
    const MAX_ENTRY_SIZE = 1 * 1024 * 1024; // 1 MB per entry
    if (entrySize > MAX_ENTRY_SIZE) {
      throw new Error("Entry too large to cache");
    }

    try {
      // Evict expired and LRU if total storage exceeds limit
      await this.evictExpiredAndLRU(entrySize);

      await chrome.storage.local.set({ [key]: entry });
    } catch (error) {
      logger.warn(
        `[CacheManager] Storage write failed, using in-memory fallback for ${videoId}:`,
        error,
      );
      this.inMemoryCache.set(key, entry);
    }
  }

  /**
   * Enforce 7-day TTL and 10MB LRU storage auto-eviction
   * @param {number} [requiredSpaceBytes=0]
   * @returns {Promise<void>}
   */
  async evictExpiredAndLRU(requiredSpaceBytes = 0) {
    try {
      const ttlMs = await this.getTtlMs();
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all).filter((k) => this.isCacheEntry(k, all[k]));
      const keysToRemove = [];
      const validEntries = [];
      let totalSize = 0;

      for (const key of cacheKeys) {
        const entry = all[key];
        if (!entry || this.isExpired(entry, ttlMs)) {
          keysToRemove.push(key);
        } else {
          const size = this.estimateSize(entry);
          totalSize += size;
          validEntries.push({ key, lastAccessed: entry.lastAccessed || 0, size });
        }
      }

      // Remove expired entries first
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }

      // Sort remaining entries by lastAccessed (ascending: oldest first)
      validEntries.sort((a, b) => a.lastAccessed - b.lastAccessed);

      // Evict oldest entries if total storage + requiredSpace exceeds 10 MB
      const targetMax = CacheManager.MAX_STORAGE_BYTES;
      let currentSize = totalSize;
      const lruKeysToRemove = [];

      for (const item of validEntries) {
        if (currentSize + requiredSpaceBytes <= targetMax) break;
        lruKeysToRemove.push(item.key);
        currentSize -= item.size;
      }

      if (lruKeysToRemove.length > 0) {
        logger.info(`[CacheManager] Evicting ${lruKeysToRemove.length} LRU items to free storage`);
        await chrome.storage.local.remove(lruKeysToRemove);
      }
    } catch (error) {
      logger.error("[CacheManager] Error during storage eviction:", error);
    }
  }

  /**
   * Clear all cache entries
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all).filter((k) => this.isCacheEntry(k, all[k]));
      if (cacheKeys.length > 0) {
        await chrome.storage.local.remove(cacheKeys);
      }
      this.inMemoryCache.clear();
    } catch (error) {
      logger.error("[CacheManager] Failed to clear cache:", error);
      throw error;
    }
  }

  /**
   * Remove cache entry for specific videoId
   * @param {string} videoId
   * @returns {Promise<void>}
   */
  async remove(videoId) {
    try {
      const all = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(all).filter(
        (k) => k.startsWith(`cache_${videoId}_`) || k === `cache_${videoId}`,
      );
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
      for (const k of Array.from(this.inMemoryCache.keys())) {
        if (k.startsWith(`cache_${videoId}_`) || k === `cache_${videoId}`) {
          this.inMemoryCache.delete(k);
        }
      }
    } catch (error) {
      logger.error(`[CacheManager] Failed to remove cache for ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Get cache stats
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all).filter((k) => this.isCacheEntry(k, all[k]));
      let totalSize = 0;
      for (const key of cacheKeys) {
        totalSize += this.estimateSize(all[key]);
      }
      return {
        totalEntries: cacheKeys.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        lastCleanup: Date.now(),
      };
    } catch (_error) {
      return { totalEntries: 0, totalSize: 0, totalSizeMB: "0.00", lastCleanup: Date.now() };
    }
  }
}

export default CacheManager;
