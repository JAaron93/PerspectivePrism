/**
 * QuotaManager
 * Manages Chrome storage quota and implements intelligent eviction strategies.
 */
class QuotaManager {
    constructor(client) {
        if (!client || typeof client.getStats !== 'function' || typeof client.estimateSize !== 'function') {
            throw new Error('QuotaManager requires a client with getStats() and estimateSize() methods');
        }
        this.client = client;
        // Chrome local storage quota is typically 5-10 MB
        this.QUOTA_BYTES = chrome.storage.local.QUOTA_BYTES || 10 * 1024 * 1024; // 10 MB default
        this.WARNING_THRESHOLD = 0.80; // 80%
        this.CRITICAL_THRESHOLD = 0.95; // 95%
    }

    /**
     * Check current storage quota status.
     * @returns {Promise<Object>} Quota status with used, quota, usagePercentage, level, and available properties
     */
    async checkQuota() {
     * @returns { Promise < Object >} Quota status with usage percentage and threshold level
            */
    async checkQuota() {
            try {
                const stats = await this.client.getStats();
                if (typeof stats?.totalSize !== 'number') {
                    throw new Error('Invalid stats object: missing or invalid totalSize');
                }
                const usagePercentage = stats.totalSize / this.QUOTA_BYTES;

                let level = 'normal';
                if (usagePercentage >= this.CRITICAL_THRESHOLD) {
                    level = 'critical';
                } else if (usagePercentage >= this.WARNING_THRESHOLD) {
                    level = 'warning';
                }

                return {
                    used: stats.totalSize,
                    quota: this.QUOTA_BYTES,
                    usagePercentage: (usagePercentage * 100).toFixed(2),
                    level: level,
                    available: this.QUOTA_BYTES - stats.totalSize
                };
            } catch (error) {
                console.error('[QuotaManager] Failed to check quota:', error);
                return {
                    used: 0,
                    quota: this.QUOTA_BYTES,
                    usagePercentage: '0.00',
                    level: 'normal',
                    available: this.QUOTA_BYTES
                };
            }
        }

    /**
     * Ensure sufficient space is available for a new entry.
     * Evicts old entries using LRU strategy if needed.
     * @param {number} requiredSize - Size in bytes needed for the new entry
     * @returns {Promise<boolean>} True if space is available, false if entry is oversized
     */
    async ensureSpace(requiredSize) {
            try {
                const quotaStatus = await this.checkQuota();

                // If enough space available, no eviction needed
                if (quotaStatus.available >= requiredSize) {
                    return true;
                }

                console.log(`[QuotaManager] Insufficient space. Need ${requiredSize} bytes, have ${quotaStatus.available} bytes`);

                // Try to evict entries to make space
                const all = await chrome.storage.local.get(null);
                const cacheKeys = Object.keys(all).filter(k => k.startsWith('cache_'));

                // Sort by lastAccessed (oldest first)
                const entries = cacheKeys.map(key => ({
                    key,
                    ...all[key],
                    size: this.client.estimateSize(all[key])
                }));
                entries.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

                // Evict oldest entries until we have enough space
                let freedSpace = 0;
                const keysToRemove = [];

                for (const entry of entries) {
                    keysToRemove.push(entry.key);
                    freedSpace += entry.size;

                    console.log(`[QuotaManager] Evicting ${entry.key} (${(entry.size / 1024).toFixed(2)} KB)`);

                    if (quotaStatus.available + freedSpace >= requiredSize) {
                        break;
                    }
                }

                // Remove evicted entries
                if (keysToRemove.length > 0) {
                    await chrome.storage.local.remove(keysToRemove);
                    console.log(`[QuotaManager] Evicted ${keysToRemove.length} entries, freed ${(freedSpace / 1024).toFixed(2)} KB`);

                    // Track eviction event in metrics
                    if (this.client.metricsTracker) {
                        const videoIds = keysToRemove.map(k => k.replace('cache_', ''));
                        await this.client.metricsTracker.recordEviction(videoIds, freedSpace, 'quota_pressure');
                    }
                }

                // Check if we have enough space now
                const newQuotaStatus = await this.checkQuota();
                if (newQuotaStatus.available >= requiredSize) {
                    return true;
                }

                // If still not enough space, the entry is too large
                console.error(`[QuotaManager] Entry is oversized (${(requiredSize / 1024).toFixed(2)} KB). Cannot fit in quota.`);
                return false;

            } catch (error) {
                console.error('[QuotaManager] Failed to ensure space:', error);
                return false;
            }
        }
    }
