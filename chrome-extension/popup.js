/**
 * Popup UI Script
 *
 * Handles popup functionality including:
 * - Loading and displaying extension status
 * - Displaying cache statistics
 * - Handling "Open Settings" and "Clear Cache" button clicks
 * - Updating UI based on current state
 */

// DOM elements
const statusElement = document.getElementById("status");
const statusIcon = document.getElementById("status-icon");
const statusMessage = document.getElementById("status-message");
const statusDetails = document.getElementById("status-details");
const cacheInfo = document.getElementById("cache-info");
const openSettingsBtn = document.getElementById("open-settings");
const clearCacheBtn = document.getElementById("clear-cache");
const progressContainer = document.getElementById("progress-container");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");

/**
 * Update status display
 * @param {string} type - Status type: 'info', 'success', 'warning', 'error'
 * @param {string} icon - Emoji icon to display
 * @param {string} message - Main status message
 * @param {string} details - Optional details text
 */
function updateStatus(type, icon, message, details = "") {
  statusElement.className = type;
  statusIcon.textContent = icon;
  statusMessage.textContent = message;
  statusDetails.textContent = details;
}

/**
 * Update cache statistics display
 * @param {Object} stats - Cache statistics object
 */
function updateCacheStats(stats) {
  if (!stats) {
    cacheInfo.textContent = "0 videos (0.00 MB)";
    return;
  }

  const { totalEntries, totalSizeMB } = stats;
  cacheInfo.textContent = `${totalEntries} video${totalEntries !== 1 ? "s" : ""} (${totalSizeMB} MB)`;
}

/**
 * Show progress bar
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} text - Progress text
 */
function showProgress(progress, text) {
  progressContainer.style.display = "block";
  progressFill.style.width = `${progress}%`;
  progressFill.parentElement.setAttribute("aria-valuenow", progress);
  progressText.textContent = text;
}

/**
 * Hide progress bar
 */
function hideProgress() {
  progressContainer.style.display = "none";
}

/**
 * Load cache statistics from background
 */
async function loadCacheStats() {
  try {
    // Send message to background to get cache stats
    const response = await chrome.runtime.sendMessage({
      type: "GET_CACHE_STATS",
    });

    if (response && response.success) {
      updateCacheStats(response.stats);
    } else {
      // Fallback: try to calculate stats from storage directly
      const result = await chrome.storage.local.get("cache_metadata");
      const metadata = result.cache_metadata || {
        totalEntries: 0,
        totalSize: 0,
      };

      updateCacheStats({
        totalEntries: metadata.totalEntries || 0,
        totalSizeMB: ((metadata.totalSize || 0) / (1024 * 1024)).toFixed(2),
      });
    }
  } catch (error) {
    console.error("Failed to load cache stats:", error);
    cacheInfo.textContent = "Unable to load";
  }
}

/**
 * Check current tab and determine status
 */
async function checkCurrentStatus() {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab) {
      updateStatus("info", "ℹ️", "No active tab found");
      return;
    }

    const url = tab.url || "";

    // Check if on YouTube video page
    const isYouTube =
      url.includes("youtube.com/watch") ||
      url.includes("youtu.be/") ||
      url.includes("m.youtube.com/watch");

    if (!isYouTube) {
      updateStatus("info", "ℹ️", "Navigate to a YouTube video", "to analyze");
      return;
    }

    // Extract video ID
    const videoId = extractVideoIdFromUrl(url);

    if (!videoId) {
      updateStatus("info", "ℹ️", "Navigate to a YouTube video", "to analyze");
      return;
    }

    // Check if backend is configured
    const config = await chrome.storage.sync.get("config");

    if (!config.config || !config.config.backendUrl) {
      updateStatus(
        "warning",
        "⚙️",
        "Setup required",
        "Configure backend URL to start analyzing videos.",
      );
      return;
    }

    // Video page detected - show ready state
    updateStatus("success", "✓", "Ready to analyze", `Video: ${videoId}`);
  } catch (error) {
    console.error("Failed to check status:", error);
    updateStatus("error", "⚠️", "Error loading status", error.message);
  }
}

/**
 * Extract video ID from YouTube URL
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null
 */
function extractVideoIdFromUrl(url) {
  try {
    const urlObj = new URL(url);

    // Standard watch URL
    const vParam = urlObj.searchParams.get("v");
    if (vParam) {
      return vParam;
    }

    // Short URL (youtu.be)
    if (urlObj.hostname.includes("youtu.be")) {
      const pathParts = urlObj.pathname.split("/");
      return pathParts[1] || null;
    }

    // Shorts format
    const shortsMatch = urlObj.pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
    if (shortsMatch) {
      return shortsMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Handle "Open Settings" button click
 */
function handleOpenSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Handle "Clear Cache" button click
 */
async function handleClearCache() {
  try {
    // Disable button and show loading state
    clearCacheBtn.disabled = true;
    clearCacheBtn.innerHTML = '<span class="loading"></span>Clearing...';

    // Send message to background to clear cache
    const response = await chrome.runtime.sendMessage({
      type: "CLEAR_CACHE",
    });

    if (response && response.success) {
      // Update cache stats
      updateCacheStats({ totalEntries: 0, totalSizeMB: "0.00" });

      // Show success feedback
      updateStatus(
        "success",
        "✓",
        "Cache cleared",
        "All cached analysis results have been removed.",
      );

      // Re-enable button after delay
      setTimeout(() => {
        clearCacheBtn.disabled = false;
        clearCacheBtn.textContent = "Clear Cache";
      }, 1000);
    } else {
      throw new Error(response?.error || "Failed to clear cache");
    }
  } catch (error) {
    console.error("Failed to clear cache:", error);

    // Show error state
    updateStatus("error", "⚠️", "Failed to clear cache", error.message);

    // Re-enable button
    clearCacheBtn.disabled = false;
    clearCacheBtn.textContent = "Clear Cache";
  }
}

/**
 * Initialize popup
 */
async function init() {
  // Load initial data
  await Promise.all([loadCacheStats(), checkCurrentStatus()]);

  // Setup event listeners
  openSettingsBtn.addEventListener("click", handleOpenSettings);
  clearCacheBtn.addEventListener("click", handleClearCache);
}

// Run initialization when popup opens
document.addEventListener("DOMContentLoaded", init);
