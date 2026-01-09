// Background service worker
import { ConfigManager } from "./config.js";
import PerspectivePrismClient from "./client.js";

console.log("Perspective Prism background service worker loaded");

let client;
const configManager = new ConfigManager();

/**
 * StateManager handles persistence of analysis state using chrome.storage.session.
 * This ensures state survives Service Worker termination but is cleared on browser restart.
 * (chrome.storage.session requires Chrome 102+)
 */
class StateManager {
  static async set(videoId, state) {
    try {
      // Use a prefix to namespace our keys
      const key = `state_${videoId}`;
      await chrome.storage.session.set({ [key]: state });
      return true;
    } catch (error) {
      console.error(`Failed to save state for ${videoId}:`, error);
      return false;
    }
  }

  static async get(videoId) {
    try {
      const key = `state_${videoId}`;
      const result = await chrome.storage.session.get(key);
      return result[key];
    } catch (error) {
      console.error(`Failed to get state for ${videoId}:`, error);
      return null;
    }
  }

  static async delete(videoId) {
    try {
      const key = `state_${videoId}`;
      await chrome.storage.session.remove(key);
      return true;
    } catch (error) {
      console.error(`Failed to delete state for ${videoId}:`, error);
      return false;
    }
  }

  static async clearAll() {
    try {
      await chrome.storage.session.clear();
      return true;
    } catch (error) {
      console.error("Failed to clear session storage:", error);
      return false;
    }
  }
}

function validateVideoId(message) {
  if (!message || !message.videoId || typeof message.videoId !== "string") {
    return { valid: false, error: "Invalid or missing videoId" };
  }
  const videoId = message.videoId.trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return { valid: false, error: "Invalid videoId format" };
  }
  return { valid: true, videoId };
}

// Initialize client with config
configManager
  .load()
  .then((config) => {
    console.log("Configuration loaded:", config);
    client = new PerspectivePrismClient(config.backendUrl);

    // Clean up expired cache on startup
    client.cleanupExpiredCache();
  })
  .catch((error) => {
    console.error("Failed to load configuration:", error);
  });

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // First-time installation - show welcome page
    console.log(
      "[Perspective Prism] Extension installed, opening welcome page",
    );
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  } else if (details.reason === "update") {
    // Extension updated
    console.log(
      "[Perspective Prism] Extension updated to version",
      chrome.runtime.getManifest().version,
    );
    // Check for privacy policy version changes
    checkPrivacyPolicyVersion();
  }
});

// Check privacy policy version on startup
chrome.runtime.onStartup.addListener(() => {
  console.log("[Perspective Prism] Extension started");
  checkPrivacyPolicyVersion();
});

/**
 * Check if privacy policy version has changed and notify user if needed.
 * This runs on extension startup and update.
 */
async function checkPrivacyPolicyVersion() {
  const CURRENT_POLICY_VERSION = "1.0.0";

  try {
    const result = await new Promise((resolve) => {
      chrome.storage.sync.get(["consent"], (result) => {
        resolve(result);
      });
    });

    const consent = result.consent;

    // If no consent exists, user hasn't used the extension yet - no action needed
    if (!consent || !consent.given) {
      return;
    }

    // Check if policy version has changed
    const storedVersion = consent.policyVersion || "0.0.0";
    if (storedVersion !== CURRENT_POLICY_VERSION) {
      console.log(
        `[Perspective Prism] Privacy policy version changed: ${storedVersion} -> ${CURRENT_POLICY_VERSION}`,
      );

      // Store the version mismatch flag so content scripts can show the dialog
      await chrome.storage.local.set({
        policy_version_mismatch: {
          detected: true,
          storedVersion: storedVersion,
          currentVersion: CURRENT_POLICY_VERSION,
          timestamp: Date.now(),
        },
      });

      console.log(
        "[Perspective Prism] Policy version mismatch flag set. User will be prompted on next analysis attempt.",
      );
    } else {
      // Clear any existing mismatch flag
      await chrome.storage.local.remove(["policy_version_mismatch"]);
    }
  } catch (error) {
    console.error(
      "[Perspective Prism] Failed to check privacy policy version:",
      error,
    );
  }
}

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Common handler wrapper for async response
  const handleAsync = (handlerPromise) => {
    handlerPromise
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open
  };

  switch (message.type) {
    case "ANALYZE_VIDEO":
      return handleAsync(handleAnalysisRequest(message));
    case "CANCEL_ANALYSIS":
      return handleAsync(handleCancelAnalysis(message));
    case "CHECK_CACHE":
      return handleAsync(handleCacheCheck(message));
    case "GET_CACHE_STATS":
      return handleAsync(handleGetCacheStats());
    case "CLEAR_CACHE":
      return handleAsync(handleClearCache());
    case "GET_ANALYSIS_STATE":
      return handleAsync(handleGetAnalysisState(message));
    case "REVOKE_CONSENT":
      return handleAsync(handleRevokeConsent());
    case "CHECK_POLICY_VERSION":
      return handleAsync(handleCheckPolicyVersion());
    
    // Sync handlers
    case "OPEN_PRIVACY_POLICY":
      chrome.tabs.create({ url: chrome.runtime.getURL("privacy.html") });
      return false;
    case "OPEN_OPTIONS_PAGE":
      chrome.runtime.openOptionsPage();
      return false;
    case "OPEN_WELCOME_PAGE":
      chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
      return false;
      
    default:
      return false;
  }
});

async function handleCacheCheck(message) {
  if (!client) {
    const config = await configManager.load();
    client = new PerspectivePrismClient(config.backendUrl);
  }

  const validation = validateVideoId(message);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const videoId = validation.videoId;

  try {
    const data = await client.checkCache(videoId);
    return { success: true, data: data };
  } catch (error) {
    console.error("Cache check failed:", error);
    throw error;
  }
}

async function handleAnalysisRequest(message) {
  if (!client) {
    const config = await configManager.load();
    client = new PerspectivePrismClient(config.backendUrl);
  }

  const validation = validateVideoId(message);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const videoId = validation.videoId;

  // Set state to in_progress
  await setAnalysisState(videoId, {
    status: "in_progress",
    progress: 0,
  });

  try {
    // Start analysis
    const result = await client.analyzeVideo(videoId);

    if (result.success) {
      // Set state to complete
      await setAnalysisState(videoId, {
        status: "complete",
        claimCount: result.data?.claims?.length || 0,
        isCached: result.fromCache || false,
        analyzedAt: Date.now(),
      });
    } else {
      // Set state to error
      await setAnalysisState(videoId, {
        status: "error",
        errorMessage: result.error || "Analysis failed",
        errorDetails: "",
      });
    }

    return result;
  } catch (error) {
    console.error("Analysis request failed:", error);

    // Set state to error
    await setAnalysisState(videoId, {
      status: "error",
      errorMessage: "Analysis failed",
      errorDetails: error.message,
    });

    throw error;
  }
}

async function handleCancelAnalysis(message) {
  if (!client) {
    throw new Error('Client not initialized');
  }

  const validation = validateVideoId(message);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const videoId = validation.videoId;
  
  try {
    const cancelled = client.cancelAnalysis(videoId);
    
    if (cancelled) {
      // Update state to cancelled
      await setAnalysisState(videoId, {
        status: 'cancelled',
        cancelledAt: Date.now()
      });
      
      return { success: true, cancelled: true };
    } else {
      throw new Error('No active analysis found for this video');
    }
  } catch (error) {
    console.error('[Perspective Prism] Cancel analysis failed:', error);
    throw error;
  }
}

/**
 * Set analysis state for a video and notify listeners
 * @param {string} videoId - Video ID
 * @param {Object} state - Analysis state object
 */
async function setAnalysisState(videoId, state) {
  // Save to session storage
  await StateManager.set(videoId, state);

  // Notify popup and content scripts of state change
  try {
    await chrome.runtime.sendMessage({
      type: "ANALYSIS_STATE_CHANGED",
      videoId: videoId,
      state: state,
    });
  } catch (error) {
    // Ignore errors if no listeners (e.g. popup closed)
  }
}

async function handleGetAnalysisState(message) {
  const validation = validateVideoId(message);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const videoId = validation.videoId;
  
  // 1. Try to get active state from session storage
  const state = await StateManager.get(videoId);

  if (state) {
    return { success: true, state: state };
  } 
  
  // 2. Check if we have cached data (completed analysis)
  if (!client) {
    const config = await configManager.load();
    client = new PerspectivePrismClient(config.backendUrl);
  }

  try {
    const cachedData = await client.checkCache(videoId);
    if (cachedData) {
      // We have cached data, reconstruct complete state
      const cacheState = {
        status: "complete",
        claimCount: cachedData.claims?.length || 0,
        isCached: true,
        analyzedAt: cachedData.metadata?.analyzed_at
          ? new Date(cachedData.metadata.analyzed_at).getTime()
          : Date.now(),
      };
      // Save reconstructed state to session so subsequent calls are faster
      await StateManager.set(videoId, cacheState);
      return { success: true, state: cacheState };
    } else {
      // No cached data, show idle state
      return {
        success: true,
        state: { status: "idle" },
      };
    }
  } catch (error) {
    console.error("Failed to check cache for state:", error);
    // Default to idle on error
    return {
      success: true,
      state: { status: "idle" },
    };
  }
}

async function handleGetCacheStats() {
  if (!client) {
    const config = await configManager.load();
    client = new PerspectivePrismClient(config.backendUrl);
  }

  try {
    const stats = await client.getCacheStats();
    return { success: true, stats: stats };
  } catch (error) {
    console.error("Failed to get cache stats:", error);
    throw error;
  }
}

async function handleClearCache() {
  if (!client) {
    const config = await configManager.load();
    client = new PerspectivePrismClient(config.backendUrl);
  }

  try {
    await client.clearCache();

    // Clear all analysis states from session storage
    await StateManager.clearAll();

    // Notify popup of cache update
    try {
      await chrome.runtime.sendMessage({
        type: "CACHE_UPDATED",
      });
    } catch (e) {
      // ignore
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to clear cache:", error);
    throw error;
  }
}

async function handleRevokeConsent() {
  console.log("[Perspective Prism] Revoking consent...");

  try {
    // 1. Clear all cached analysis results
    if (!client) {
      const config = await configManager.load();
      client = new PerspectivePrismClient(config.backendUrl);
    }
    await client.clearCache();

    // 2. Clear all analysis states
    await StateManager.clearAll();

    // 3. Clear all alarms
    await chrome.alarms.clearAll();

    // 4. Set consentGiven to false in storage
    await chrome.storage.sync.set({
      consent: {
        given: false,
        timestamp: Date.now(),
        revoked: true,
        policyVersion: "1.0.0", // Keep version for reference
      },
    });

    // 5. Notify all tabs (content scripts) to update UI
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      chrome.tabs
        .sendMessage(tab.id, {
          type: "CONSENT_REVOKED",
        })
        .catch(() => {
          // Ignore errors for tabs where content script isn't loaded
        });
    }

    console.log("[Perspective Prism] Consent revoked successfully");
    return { success: true };
  } catch (error) {
    console.error("[Perspective Prism] Failed to revoke consent:", error);
    throw error;
  }
}

async function handleCheckPolicyVersion() {
  try {
    const result = await chrome.storage.local.get(["policy_version_mismatch"]);
    const mismatch = result.policy_version_mismatch;

    if (mismatch && mismatch.detected) {
      return {
        success: true,
        hasMismatch: true,
        storedVersion: mismatch.storedVersion,
        currentVersion: mismatch.currentVersion,
      };
    } else {
      return {
        success: true,
        hasMismatch: false,
      };
    }
  } catch (error) {
    console.error(
      "[Perspective Prism] Failed to check policy version:",
      error,
    );
    throw error;
  }
}
