/**
 * MetricsTracker
 * Tracks cache performance metrics including hit/miss rates, evictions, and storage usage.
 */
class MetricsTracker {
    constructor() {
        this.METRICS_KEY = 'cache_metrics';
        this.MAX_METRICS_HISTORY = 100; // Keep last 100 metric entries
    }

    /**
     * Initialize or get existing metrics.
     * @returns {Promise<Object>} Metrics object
     */
    async getMetrics() {
        try {
            const result = await chrome.storage.local.get(this.METRICS_KEY);
            return result[this.METRICS_KEY] || this._getDefaultMetrics();
        } catch (error) {
            console.error('[MetricsTracker] Failed to get metrics:', error);
            return this._getDefaultMetrics();
        }
    }

    /**
     * Get default metrics structure.
     * @private
     */
    _getDefaultMetrics() {
        return {
            cacheHits: 0,
            cacheMisses: 0,
            evictions: [],
            quotaSnapshots: [],
            lastReset: Date.now()
        };
    }

    /**
     * Record a cache hit.
     */
    async recordCacheHit(videoId) {
        try {
            const metrics = await this.getMetrics();
            metrics.cacheHits++;
            await this._saveMetrics(metrics);
            console.log(`[MetricsTracker] Cache hit for ${videoId}. Total hits: ${metrics.cacheHits}`);
        } catch (error) {
            console.error('[MetricsTracker] Failed to record cache hit:', error);
        }
    }

    /**
     * Record a cache miss.
     */
    async recordCacheMiss(videoId) {
        try {
            const metrics = await this.getMetrics();
            metrics.cacheMisses++;
            await this._saveMetrics(metrics);
            console.log(`[MetricsTracker] Cache miss for ${videoId}. Total misses: ${metrics.cacheMisses}`);
        } catch (error) {
            console.error('[MetricsTracker] Failed to record cache miss:', error);
        }
    }

    /**
     * Record an eviction event.
     * @param {Array<string>} videoIds - Video IDs that were evicted
     * @param {number} freedSpace - Space freed in bytes
     * @param {string} reason - Reason for eviction (e.g., 'quota_pressure', 'expiration', 'lru')
     */
    async recordEviction(videoIds, freedSpace, reason = 'lru') {
        try {
            const metrics = await this.getMetrics();

            const evictionEvent = {
                timestamp: Date.now(),
                videoIds: videoIds,
                freedSpace: freedSpace,
                freedSpaceKB: (freedSpace / 1024).toFixed(2),
                reason: reason,
                count: videoIds.length
            };

            metrics.evictions.push(evictionEvent);

            // Keep only last MAX_METRICS_HISTORY evictions
            if (metrics.evictions.length > this.MAX_METRICS_HISTORY) {
                metrics.evictions = metrics.evictions.slice(-this.MAX_METRICS_HISTORY);
            }

            await this._saveMetrics(metrics);

            console.log(
                `[MetricsTracker] Eviction: ${videoIds.length} entries, ` +
                `freed ${evictionEvent.freedSpaceKB} KB, reason: ${reason}`
            );
        } catch (error) {
            console.error('[MetricsTracker] Failed to record eviction:', error);
        }
    }

    /**
     * Record a quota snapshot for tracking storage usage over time.
     * @param {Object} quotaStatus - Quota status from QuotaManager.checkQuota()
     */
    async recordQuotaSnapshot(quotaStatus) {
        try {
            const metrics = await this.getMetrics();

            const snapshot = {
                timestamp: Date.now(),
                used: quotaStatus.used,
                usedMB: (quotaStatus.used / (1024 * 1024)).toFixed(2),
                quota: quotaStatus.quota,
                usagePercentage: quotaStatus.usagePercentage,
                level: quotaStatus.level
            };

            metrics.quotaSnapshots.push(snapshot);

            // Keep only last MAX_METRICS_HISTORY snapshots
            if (metrics.quotaSnapshots.length > this.MAX_METRICS_HISTORY) {
                metrics.quotaSnapshots = metrics.quotaSnapshots.slice(-this.MAX_METRICS_HISTORY);
            }

            await this._saveMetrics(metrics);
        } catch (error) {
            console.error('[MetricsTracker] Failed to record quota snapshot:', error);
        }
    }

    /**
     * Get cache hit/miss rate statistics.
     * @returns {Promise<Object>} Hit/miss rate statistics
     */
    async getHitMissRate() {
        try {
            const metrics = await this.getMetrics();
            const total = metrics.cacheHits + metrics.cacheMisses;

            if (total === 0) {
                return {
                    hits: 0,
                    misses: 0,
                    total: 0,
                    hitRate: '0.00',
                    missRate: '0.00'
                };
            }

            return {
                hits: metrics.cacheHits,
                misses: metrics.cacheMisses,
                total: total,
                hitRate: ((metrics.cacheHits / total) * 100).toFixed(2),
                missRate: ((metrics.cacheMisses / total) * 100).toFixed(2)
            };
        } catch (error) {
            console.error('[MetricsTracker] Failed to get hit/miss rate:', error);
            return { hits: 0, misses: 0, total: 0, hitRate: '0.00', missRate: '0.00' };
        }
    }

    /**
     * Get recent eviction events.
     * @param {number} count - Number of recent events to return (default: 10)
     * @returns {Promise<Array>} Recent eviction events
     */
    async getRecentEvictions(count = 10) {
        try {
            const metrics = await this.getMetrics();
            return metrics.evictions.slice(-count).reverse();
        } catch (error) {
            console.error('[MetricsTracker] Failed to get recent evictions:', error);
            return [];
        }
    }

    /**
     * Get storage usage history.
     * @param {number} count - Number of recent snapshots to return (default: 20)
     * @returns {Promise<Array>} Recent quota snapshots
     */
    async getStorageHistory(count = 20) {
        try {
            const metrics = await this.getMetrics();
            return metrics.quotaSnapshots.slice(-count);
        } catch (error) {
            console.error('[MetricsTracker] Failed to get storage history:', error);
            return [];
        }
    }

    /**
     * Reset all metrics.
     */
    async reset() {
        try {
            const defaultMetrics = this._getDefaultMetrics();
            await this._saveMetrics(defaultMetrics);
            console.log('[MetricsTracker] Metrics reset');
        } catch (error) {
            console.error('[MetricsTracker] Failed to reset metrics:', error);
        }
    }

    /**
     * Save metrics to storage.
     * @private
     */
    async _saveMetrics(metrics) {
        try {
            await chrome.storage.local.set({ [this.METRICS_KEY]: metrics });
        } catch (error) {
            console.error('[MetricsTracker] Failed to save metrics:', error);
            throw error;
        }
    }
}
