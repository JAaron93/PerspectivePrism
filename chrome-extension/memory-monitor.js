/**
 * Memory Monitor for Perspective Prism Extension
 * 
 * Tracks memory usage across content scripts and background service worker
 * to ensure the extension stays under 10MB during normal operation.
 * 
 * Key Memory Concerns:
 * 1. Content Script: DOM elements, Shadow DOM, event listeners, panel state
 * 2. Background Worker: Cache storage, pending requests, analysis data
 * 3. Shared: Large analysis results, multiple video analyses
 */

class MemoryMonitor {
  constructor() {
    this.measurements = [];
    this.MAX_MEASUREMENTS = 100; // Keep last 100 measurements
    this.WARNING_THRESHOLD_MB = 8; // Warn at 8MB
    this.CRITICAL_THRESHOLD_MB = 10; // Critical at 10MB
    this.isMonitoring = false;
    this.monitoringInterval = null;
  }

  /**
   * Start continuous memory monitoring
   * @param {number} intervalMs - Monitoring interval in milliseconds (default: 30000 = 30s)
   */
  startMonitoring(intervalMs = 30000) {
    if (this.isMonitoring) {
      console.warn('[MemoryMonitor] Already monitoring');
      return;
    }

    this.isMonitoring = true;
    console.log(`[MemoryMonitor] Starting memory monitoring (interval: ${intervalMs}ms)`);

    // Initial measurement
    this.measure();

    // Periodic measurements
    this.monitoringInterval = setInterval(() => {
      this.measure();
    }, intervalMs);
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('[MemoryMonitor] Stopped memory monitoring');
  }

  /**
   * Take a memory measurement
   * @returns {Promise<Object>} Memory measurement data
   */
  async measure() {
    try {
      // Use performance.memory API (Chrome-specific)
      if (!performance.memory) {
        console.warn('[MemoryMonitor] performance.memory API not available');
        return null;
      }

      const memory = performance.memory;
      const measurement = {
        timestamp: Date.now(),
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        usedMB: (memory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
        totalMB: (memory.totalJSHeapSize / (1024 * 1024)).toFixed(2),
        limitMB: (memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(2),
        percentUsed: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2)
      };

      // Add context-specific data
      if (typeof document !== 'undefined') {
        // Content script context
        measurement.context = 'content_script';
        measurement.domNodes = document.querySelectorAll('*').length;
        measurement.shadowRoots = document.querySelectorAll('[id^="pp-"]').length;
      } else {
        // Background service worker context
        measurement.context = 'background';
      }

      // Store measurement
      this.measurements.push(measurement);
      if (this.measurements.length > this.MAX_MEASUREMENTS) {
        this.measurements.shift(); // Remove oldest
      }

      // Check thresholds
      const usedMB = parseFloat(measurement.usedMB);
      if (usedMB >= this.CRITICAL_THRESHOLD_MB) {
        console.error(`[MemoryMonitor] CRITICAL: Memory usage at ${usedMB}MB (limit: ${this.CRITICAL_THRESHOLD_MB}MB)`);
        this.handleCriticalMemory(measurement);
      } else if (usedMB >= this.WARNING_THRESHOLD_MB) {
        console.warn(`[MemoryMonitor] WARNING: Memory usage at ${usedMB}MB (threshold: ${this.WARNING_THRESHOLD_MB}MB)`);
        this.handleWarningMemory(measurement);
      }

      // Log measurement (only in debug mode)
      if (this.isDebugMode()) {
        console.log(`[MemoryMonitor] Memory: ${measurement.usedMB}MB / ${measurement.limitMB}MB (${measurement.percentUsed}%)`);
      }

      return measurement;
    } catch (error) {
      console.error('[MemoryMonitor] Failed to measure memory:', error);
      return null;
    }
  }

  /**
   * Handle warning-level memory usage
   * @param {Object} measurement - Current memory measurement
   */
  handleWarningMemory(measurement) {
    // Log warning with context
    console.warn('[MemoryMonitor] Memory usage approaching limit. Consider cleanup.');
    
    // Suggest cleanup actions based on context
    if (measurement.context === 'content_script') {
      console.warn('[MemoryMonitor] Content script cleanup suggestions:');
      console.warn('  - Close analysis panel if open');
      console.warn('  - Clear old event listeners');
      console.warn('  - Remove unused DOM elements');
    } else {
      console.warn('[MemoryMonitor] Background worker cleanup suggestions:');
      console.warn('  - Clear expired cache entries');
      console.warn('  - Remove completed request states');
      console.warn('  - Limit pending requests');
    }
  }

  /**
   * Handle critical memory usage
   * @param {Object} measurement - Current memory measurement
   */
  handleCriticalMemory(measurement) {
    console.error('[MemoryMonitor] CRITICAL MEMORY USAGE - Initiating emergency cleanup');
    
    // Trigger emergency cleanup based on context
    if (measurement.context === 'content_script') {
      this.emergencyCleanupContentScript();
    } else {
      this.emergencyCleanupBackground();
    }
  }

  /**
   * Emergency cleanup for content script
   */
  emergencyCleanupContentScript() {
    try {
      // Remove analysis panel if present
      const panel = document.getElementById('pp-analysis-panel');
      if (panel) {
        panel.remove();
        console.log('[MemoryMonitor] Removed analysis panel');
      }

      // Clear any large data structures
      if (typeof window.ppAnalysisData !== 'undefined') {
        delete window.ppAnalysisData;
        console.log('[MemoryMonitor] Cleared analysis data');
      }

      // Force garbage collection (if available)
      if (window.gc) {
        window.gc();
        console.log('[MemoryMonitor] Forced garbage collection');
      }
    } catch (error) {
      console.error('[MemoryMonitor] Emergency cleanup failed:', error);
    }
  }

  /**
   * Emergency cleanup for background service worker
   */
  emergencyCleanupBackground() {
    try {
      // This would be called from background.js context
      // Clear old cache entries
      chrome.storage.local.get(null, (items) => {
        const cacheKeys = Object.keys(items).filter(k => k.startsWith('cache_'));
        
        // Remove oldest 50% of cache entries
        if (cacheKeys.length > 0) {
          const toRemove = cacheKeys.slice(0, Math.ceil(cacheKeys.length / 2));
          chrome.storage.local.remove(toRemove, () => {
            console.log(`[MemoryMonitor] Removed ${toRemove.length} cache entries`);
          });
        }
      });

      // Force garbage collection (if available)
      if (typeof gc !== 'undefined') {
        gc();
        console.log('[MemoryMonitor] Forced garbage collection');
      }
    } catch (error) {
      console.error('[MemoryMonitor] Emergency cleanup failed:', error);
    }
  }

  /**
   * Get memory statistics
   * @returns {Object} Memory statistics
   */
  getStats() {
    if (this.measurements.length === 0) {
      return {
        count: 0,
        avgUsedMB: 0,
        maxUsedMB: 0,
        minUsedMB: 0,
        currentUsedMB: 0
      };
    }

    const usedMBValues = this.measurements.map(m => parseFloat(m.usedMB));
    const current = this.measurements[this.measurements.length - 1];

    return {
      count: this.measurements.length,
      avgUsedMB: (usedMBValues.reduce((a, b) => a + b, 0) / usedMBValues.length).toFixed(2),
      maxUsedMB: Math.max(...usedMBValues).toFixed(2),
      minUsedMB: Math.min(...usedMBValues).toFixed(2),
      currentUsedMB: current.usedMB,
      currentPercentUsed: current.percentUsed,
      warningThresholdMB: this.WARNING_THRESHOLD_MB,
      criticalThresholdMB: this.CRITICAL_THRESHOLD_MB
    };
  }

  /**
   * Print memory statistics to console
   */
  printStats() {
    const stats = this.getStats();
    console.table(stats);
    
    // Print recent measurements
    if (this.measurements.length > 0) {
      console.log('[MemoryMonitor] Recent measurements:');
      const recent = this.measurements.slice(-10); // Last 10
      console.table(recent.map(m => ({
        timestamp: new Date(m.timestamp).toLocaleTimeString(),
        usedMB: m.usedMB,
        percentUsed: m.percentUsed + '%',
        context: m.context
      })));
    }
  }

  /**
   * Export measurements for analysis
   * @returns {Array} Array of measurements
   */
  exportMeasurements() {
    return [...this.measurements];
  }

  /**
   * Check if debug mode is enabled
   * @returns {boolean} True if debug mode is enabled
   */
  isDebugMode() {
    // Check for debug flag in localStorage or chrome.storage
    try {
      return localStorage.getItem('pp_debug_memory') === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Enable debug mode
   */
  enableDebugMode() {
    try {
      localStorage.setItem('pp_debug_memory', 'true');
      console.log('[MemoryMonitor] Debug mode enabled');
    } catch (error) {
      console.error('[MemoryMonitor] Failed to enable debug mode:', error);
    }
  }

  /**
   * Disable debug mode
   */
  disableDebugMode() {
    try {
      localStorage.removeItem('pp_debug_memory');
      console.log('[MemoryMonitor] Debug mode disabled');
    } catch (error) {
      console.error('[MemoryMonitor] Failed to disable debug mode:', error);
    }
  }
}

// Create global instance for easy access
const memoryMonitor = new MemoryMonitor();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  window.ppMemoryMonitor = memoryMonitor;
  
  // Add console helpers
  window.ppMemoryStats = () => memoryMonitor.printStats();
  window.ppMemoryMeasure = () => memoryMonitor.measure();
  window.ppMemoryDebug = (enable = true) => {
    if (enable) {
      memoryMonitor.enableDebugMode();
    } else {
      memoryMonitor.disableDebugMode();
    }
  };
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MemoryMonitor, memoryMonitor };
}

// ES Module export
export { MemoryMonitor, memoryMonitor };
export default memoryMonitor;
