/**
 * Popup UI Script
 *
 * Handles popup functionality including:
 * - Loading and displaying extension status
 * - Displaying cache statistics
 * - Handling "Open Settings" and "Clear Cache" button clicks
 * - Updating UI based on current state
 * - Managing different popup states (Not on YouTube, Idle, In Progress, Complete, Error, Not Configured)
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

// Validate required elements exist
const requiredElements = {
  statusElement,
  statusIcon,
  statusMessage,
  statusDetails,
  cacheInfo,
  openSettingsBtn,
  clearCacheBtn,
  progressContainer,
  progressFill,
  progressText,
};

for (const [name, element] of Object.entries(requiredElements)) {
  if (!element) {
    console.error(`Required element missing: ${name}`);
  }
}

// State tracking
let currentVideoId = null;
let statusCheckInterval = null;

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
 * Implements all required popup states:
 * - Not on YouTube
 * - On YouTube - Idle
 * - Analysis in Progress
 * - Analysis Complete (Fresh vs Cached)
 * - Error
 * - Not Configured
 */
async function checkCurrentStatus() {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab) {
      showNotOnYouTubeState();
      return;
    }

    const url = tab.url || "";

    // Check if on YouTube video page
    const isYouTube =
      url.includes("youtube.com/watch") ||
      url.includes("youtu.be/") ||
      url.includes("m.youtube.com/watch") ||
      url.includes("youtube.com/shorts");

    if (!isYouTube) {
      showNotOnYouTubeState();
      return;
    }

    // Extract video ID
    const videoId = extractVideoIdFromUrl(url);

    if (!videoId) {
      showNotOnYouTubeState();
      return;
    }

    currentVideoId = videoId;

    // Check if backend is configured
    const config = await chrome.storage.sync.get("config");

    if (!config.config || !config.config.backendUrl) {
      showNotConfiguredState();
      return;
    }

    // Check for analysis state from background
    const response = await chrome.runtime.sendMessage({
      type: "GET_ANALYSIS_STATE",
      videoId: videoId,
    });

    if (response && response.state) {
      handleAnalysisState(response.state, videoId);
    } else {
      // Default to idle state if no analysis state found
      showIdleState(videoId);
    }
  } catch (error) {
    console.error("Failed to check status:", error);
    showErrorState("Error loading status", error.message);
  }
}

/**
 * Handle different analysis states
 * @param {Object} state - Analysis state from background
 * @param {string} videoId - Current video ID
 */
function handleAnalysisState(state, videoId) {
  switch (state.status) {
    case "in_progress":
      showInProgressState(state.progress || 0);
      break;
    case "complete":
      showCompleteState(state.claimCount, state.isCached, state.analyzedAt);
      break;
    case "error":
      showErrorState(state.errorMessage, state.errorDetails);
      break;
    case "idle":
    default:
      showIdleState(videoId);
      break;
  }
}

/**
 * State: Not on YouTube
 * Shown when user is not on a YouTube video page
 */
function showNotOnYouTubeState() {
  updateStatus(
    "info",
    "ℹ️",
    "Navigate to a YouTube video",
    "to analyze",
  );
  hideProgress();
  clearCacheBtn.disabled = false;
}

/**
 * State: On YouTube - Idle
 * Shown when on a YouTube video page but no analysis is running
 * @param {string} videoId - Current video ID
 */
function showIdleState(videoId) {
  updateStatus(
    "success",
    "✓",
    "Ready to analyze",
    `Video: ${videoId}`,
  );
  hideProgress();
  clearCacheBtn.disabled = false;
}

/**
 * State: Analysis in Progress
 * Shown when analysis is currently running
 * @param {number} progress - Progress percentage (0-100)
 */
function showInProgressState(progress) {
  updateStatus(
    "info",
    "⏳",
    "Analyzing video...",
    "",
  );
  showProgress(progress, `${progress}%`);
  clearCacheBtn.disabled = true;
}

/**
 * State: Analysis Complete
 * Shown when analysis has completed successfully
 * @param {number} claimCount - Number of claims found
 * @param {boolean} isCached - Whether results are from cache
 * @param {number} analyzedAt - Timestamp of analysis
 */
function showCompleteState(claimCount, isCached, analyzedAt) {
  const count = claimCount ?? 0;
  const claimText = `Found ${count} claim${count !== 1 ? "s" : ""}`;
  
  if (isCached) {
    const timeAgo = getTimeAgo(analyzedAt);
    updateStatus(
      "success",
      "✓",
      "Showing cached results",
      `${claimText}\n(Analyzed ${timeAgo})`,
    );
  } else {
    updateStatus(
      "success",
      "✓",
      "Analysis complete",
      `${claimText}\n(Just analyzed)`,
    );
  }
  
  hideProgress();
  clearCacheBtn.disabled = false;
}

/**
 * State: Error
 * Shown when an error occurs during analysis
 * @param {string} message - Error message
 * @param {string} details - Error details
 */
function showErrorState(message, details = "") {
  updateStatus(
    "error",
    "⚠️",
    message || "Analysis failed",
    details || "Check settings and try again.",
  );
  hideProgress();
  clearCacheBtn.disabled = false;
}

/**
 * State: Not Configured
 * Shown when backend URL is not configured
 */
function showNotConfiguredState() {
  updateStatus(
    "warning",
    "⚙️",
    "Setup required",
    "Configure backend URL to start analyzing videos.",
  );
  hideProgress();
  clearCacheBtn.disabled = false;
}

/**
 * Calculate time ago from timestamp
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} - Human-readable time ago string
 */
function getTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  } else {
    return "just now";
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
  await loadCacheStats();

  // Setup event listeners
  openSettingsBtn.addEventListener("click", handleOpenSettings);
  clearCacheBtn.addEventListener("click", handleClearCache);
  
  // Cleanup not really needed for interval since we removed it, but good practice if we add listeners
  window.addEventListener("unload", () => {
    // Any cleanup if needed
  });

  // Check status on load
  await checkCurrentStatus();

  // Listen for messages from background (for real-time updates)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ANALYSIS_STATE_CHANGED") {
      // Update status immediately when state changes
      if (currentVideoId && message.videoId === currentVideoId) {
        handleAnalysisState(message.state, currentVideoId);
      } else if (!currentVideoId) {
        // If we don't have a video ID yet (e.g. initial load race), re-check everything
        checkCurrentStatus();
      }
    } else if (message.type === "CACHE_UPDATED") {
      // Reload cache stats when cache is updated
      loadCacheStats();
    }
  });
}

// Run initialization when popup opens
document.addEventListener("DOMContentLoaded", init);
