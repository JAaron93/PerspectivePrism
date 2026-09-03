// Background service worker
import { ConfigManager } from "./config.js";
import { logger } from "./logging-utils.js";
import PerspectivePrismClient from "./client.js";
import CacheManager from "./cache-manager.js";

logger.info("Perspective Prism background service worker loaded");

let client;
const configManager = new ConfigManager();
const cacheManager = new CacheManager();

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
      logger.error(`Failed to save state for ${videoId}:`, error);
      return false;
    }
  }

  static async get(videoId) {
    try {
      const key = `state_${videoId}`;
      const result = await chrome.storage.session.get(key);
      return result[key];
    } catch (error) {
      logger.error(`Failed to get state for ${videoId}:`, error);
      return null;
    }
  }

  static async delete(videoId) {
    try {
      const key = `state_${videoId}`;
      await chrome.storage.session.remove(key);
      return true;
    } catch (error) {
      logger.error(`Failed to delete state for ${videoId}:`, error);
      return false;
    }
  }

  static async clearAll() {
    try {
      // Get all keys and filter for state_ prefix
      const allData = await chrome.storage.session.get(null);
      const stateKeys = Object.keys(allData).filter(key => key.startsWith('state_'));
      if (stateKeys.length > 0) {
        await chrome.storage.session.remove(stateKeys);
      }
      return true;
    } catch (error) {
      logger.error("Failed to clear session storage:", error);
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

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const config = await configManager.load();
      client = new PerspectivePrismClient(config.backendUrl);
      try {
        await cacheManager.evictExpiredAndLRU();
        await client.cleanupExpiredCache();
      } catch (err) {
        logger.error("Failed to cleanup expired cache on startup:", err);
      }
      return client;
    })().catch((err) => {
      // Clear the cached promise so the next caller retries rather than
      // receiving a permanently-rejected promise from a transient failure.
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

// Trigger client initialization on startup
getClient().catch((error) => {
  logger.error("Failed to initialize client on startup:", error);
});

// Handle extension installation
if (chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    // Configure side panel behavior to open on action click
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
        logger.error("Failed to set panel behavior:", err);
      });
    }

    if (details.reason === "install") {
      // First-time installation - show welcome page
      logger.info(
        "[Perspective Prism] Extension installed, opening welcome page",
      );
      chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
    } else if (details.reason === "update") {
      // Extension updated
      logger.info(
        "[Perspective Prism] Extension updated to version",
        chrome.runtime.getManifest().version,
      );
      // Check for privacy policy version changes
      checkPrivacyPolicyVersion();
    }
  });
}

// Check privacy policy version on startup
if (chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    logger.info("[Perspective Prism] Extension started");
    checkPrivacyPolicyVersion();
  });
}

/**
 * Check if privacy policy version has changed and notify user if needed.
 * This runs on extension startup and update.
 */
async function checkPrivacyPolicyVersion() {
  const CURRENT_POLICY_VERSION = "1.0.0";

  try {
    let result = await new Promise((resolve) => {
      chrome.storage.local.get(["consent"], (res) => resolve(res || {}));
    });

    let consent = result.consent;

    // One-time migration: check legacy chrome.storage.sync if local consent absent
    if (!consent && chrome.storage && chrome.storage.sync) {
      try {
        const syncResult = await new Promise((resolve) => {
          chrome.storage.sync.get(["consent"], (res) => resolve(res || {}));
        });
        if (syncResult.consent && typeof syncResult.consent.given === "boolean") {
          await chrome.storage.local.set({ consent: syncResult.consent });
          consent = syncResult.consent;
          try {
            await chrome.storage.sync.remove("consent");
            logger.info("[Perspective Prism] Successfully removed legacy sync consent key");
          } catch (syncRemoveErr) {
            logger.warn("Failed to remove legacy sync consent key:", syncRemoveErr);
          }
        }
      } catch (migrationError) {
        logger.warn("Failed to migrate consent from sync storage:", migrationError);
      }
    }

    // If no consent exists, user hasn't used the extension yet - no action needed
    if (!consent || !consent.given) {
      return;
    }

    // Check if policy version has changed
    const storedVersion = consent.policyVersion || "0.0.0";
    if (storedVersion !== CURRENT_POLICY_VERSION) {
      logger.info(
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

      logger.info(
        "[Perspective Prism] Policy version mismatch flag set. User will be prompted on next analysis attempt.",
      );
    } else {
      // Clear any existing mismatch flag
      await chrome.storage.local.remove(["policy_version_mismatch"]);
    }
  } catch (error) {
    logger.error(
      "[Perspective Prism] Failed to check privacy policy version:",
      error,
    );
  }
}

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender origin
  if (!sender.id || sender.id !== chrome.runtime.id) {
    logger.warn("Rejected message from unauthorized sender origin:", sender);
    sendResponse({
      success: false,
      error: "Unauthorized sender origin",
      code: "UNAUTHORIZED",
    });
    return false;
  }

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
    case "OPEN_SIDE_PANEL":
      return handleAsync(handleOpenSidePanel(sender));
    case "SAVE_TO_CACHE":
      return handleAsync(handleSaveToCache(message));
    
    case "VIDEO_NAVIGATED":
    case "YOUTUBE_NAVIGATED":
      chrome.runtime.sendMessage(message).catch(() => {});
      return false;

    case "SYNC_PLAYBACK":
    case "HIGHLIGHT_CLAIMS":
      if (sender.tab && sender.tab.id) {
        chrome.runtime.sendMessage({
          ...message,
          tabId: sender.tab.id
        }).catch(() => {});
      }
      return false;

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
  const activeClient = await getClient();

  const validation = validateVideoId(message);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const videoId = validation.videoId;

  try {
    const data = await activeClient.checkCache(videoId);
    return { success: true, data: data };
  } catch (error) {
    logger.error("Cache check failed:", error);
    throw error;
  }
}

async function handleAnalysisRequest(message) {
  const activeClient = await getClient();

  const validation = validateVideoId(message);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const videoId = validation.videoId;
  const options = {
    forceOverride: Boolean(message.forceOverride || message.force_override),
    metadata: message.metadata || undefined,
  };

  const requestId =
    message.requestId ||
    `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Set state to in_progress
  // CRITICAL: Ensure state is saved before starting analysis to prevent UI desync
  const stateSaved = await setAnalysisState(videoId, {
    status: "in_progress",
    progress: 0,
    requestId: requestId,
  });

  if (!stateSaved) {
    logger.error(`[Perspective Prism] Critical: Failed to save initial state for ${videoId}. Aborting analysis.`);
    throw new Error("Failed to initialize analysis state. Please try again.");
  }

  try {
    // Start analysis
    const result = await activeClient.analyzeVideo(videoId, options);

    if (result.success) {
      // Set state to complete if this request still owns the state
      const currentState = await StateManager.get(videoId);
      if (!currentState || currentState.requestId === requestId) {
        const completeStateSaved = await setAnalysisState(videoId, {
          status: "complete",
          claimCount: result.data?.claims?.length || 0,
          isCached: result.fromCache || false,
          analyzedAt: Date.now(),
          eligibility: result.data?.eligibility || null,
          requestId: requestId,
        });
        
        if (!completeStateSaved) {
           logger.warn(`[Perspective Prism] Failed to save completion state for ${videoId}. UI may not update.`);
           // We don't throw here because we already have the result, but it's bad.
        }
      } else {
        logger.info(`[Perspective Prism] Superseded completion ignored for ${videoId} (active=${currentState.requestId}, old=${requestId})`);
      }
    } else if (result.isCancelled || result.cancelled) {
      // If result was cancelled, preserve or record cancelled status without overwriting with error
      const currentState = await StateManager.get(videoId);
      if (!currentState || currentState.requestId === requestId) {
        await setAnalysisState(videoId, {
          status: "cancelled",
          cancelledAt: Date.now(),
          requestId: requestId,
        });
      }
    } else {
      // Set state to error if this request still owns the state
      const currentState = await StateManager.get(videoId);
      if (!currentState || currentState.requestId === requestId) {
        await setAnalysisState(videoId, {
          status: "error",
          errorMessage: result.error || "Analysis failed",
          errorDetails: "",
          requestId: requestId,
        });
      } else {
        logger.info(`[Perspective Prism] Superseded error ignored for ${videoId} (active=${currentState.requestId}, old=${requestId})`);
      }
    }

    return result;
  } catch (error) {
    if (error.name === "AbortError" || error.isCancelled || error.message?.includes("cancelled") || error.message?.includes("aborted")) {
      const currentState = await StateManager.get(videoId);
      if (!currentState || currentState.requestId === requestId) {
        await setAnalysisState(videoId, {
          status: "cancelled",
          cancelledAt: Date.now(),
          requestId: requestId,
        });
      }
      return { success: false, error: "Analysis cancelled", isCancelled: true };
    }
    logger.error("Analysis request failed:", error);

    // Set state to error only if this request still owns the state
    const currentState = await StateManager.get(videoId);
    if (!currentState || currentState.requestId === requestId) {
      await setAnalysisState(videoId, {
        status: "error",
        errorMessage: "Analysis failed",
        errorDetails: error.message,
        requestId: requestId,
      });
    } else {
      logger.info(`[Perspective Prism] Superseded exception error ignored for ${videoId} (active=${currentState.requestId}, old=${requestId})`);
    }

    throw error;
  }
}

async function handleCancelAnalysis(message) {
  const activeClient = await getClient();

  const validation = validateVideoId(message);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const videoId = validation.videoId;
  const requestId = message.requestId || null;
  
  try {
    const cancelled = await activeClient.cancelAnalysis(videoId);
    
    if (cancelled) {
      const currentState = await StateManager.get(videoId);
      if (!requestId || !currentState || currentState.requestId === requestId) {
        // Update state to cancelled
        const saved = await setAnalysisState(videoId, {
          status: 'cancelled',
          cancelledAt: Date.now(),
          requestId: requestId || currentState?.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        });

        if (!saved) {
           logger.warn(`[Perspective Prism] Failed to save cancelled state for ${videoId}`);
        }
      }
      
      return { success: true, cancelled: true };
    } else {
      throw new Error('No active analysis found for this video');
    }
  } catch (error) {
    logger.error('[Perspective Prism] Cancel analysis failed:', error);
    throw error;
  }
}

/**
 * Set analysis state for a video and notify listeners
 * @param {string} videoId - Video ID
 * @param {Object} state - Analysis state object
 * @returns {Promise<boolean>} - True if state saved successfully
 */
async function setAnalysisState(videoId, state) {
  // Save to session storage
  const saved = await StateManager.set(videoId, state);

  if (!saved) {
    logger.error(`[Perspective Prism] StateManager.set failed for ${videoId}`, state);
    return false;
  }

  // Notify popup and content scripts of state change
  try {
    await chrome.runtime.sendMessage({
      type: "ANALYSIS_STATE_CHANGED",
      videoId: videoId,
      state: state,
    });
  } catch (error) {
    // Ignore errors if no listeners (e.g. popup closed)
    // This is expected and not a persistence failure
  }
  
  return true;
}

async function handleGetAnalysisState(message) {
  const activeClient = await getClient();

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
  try {
    const cachedData = await activeClient.checkCache(videoId);
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
      const saved = await setAnalysisState(videoId, cacheState);
      if (!saved) {
        logger.debug(`[Perspective Prism] Could not persist reconstructed cache state for ${videoId}`);
      }
      return { success: true, state: cacheState };
    } else {
      // No cached data, show idle state
      return {
        success: true,
        state: { status: "idle" },
      };
    }
  } catch (error) {
    logger.error("Failed to check cache for state:", error);
    // Propagate error to caller
    return {
      success: false,
      error: error.message || "Failed to check cache"
    };
  }
}

async function handleGetCacheStats() {
  const activeClient = await getClient();

  try {
    const stats = await activeClient.getCacheStats();
    return { success: true, stats: stats };
  } catch (error) {
    logger.error("Failed to get cache stats:", error);
    throw error;
  }
}

async function handleClearCache() {
  const activeClient = await getClient();

  try {
    await activeClient.clearCache();

    // Clear all analysis states from session storage
    const stateCleared = await StateManager.clearAll();
    
    if (!stateCleared) {
       logger.warn("[Perspective Prism] Failed to clear session state after cache clear");
       // Consider if we should throw? 
       // Probably fine to return success but log error, as main cache is cleared.
    }

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
    logger.error("Failed to clear cache:", error);
    throw error;
  }
}

async function handleRevokeConsent() {
  logger.info("[Perspective Prism] Revoking consent...");

  try {
    // 1. Clear all cached analysis results
    const activeClient = await getClient();
    await activeClient.clearCache();

    // 2. Clear all analysis states
    const stateCleared = await StateManager.clearAll();
    if (!stateCleared) {
        logger.warn("[Perspective Prism] Failed to clear session state during consent revocation");
        // We log it but proceed to ensure consent flag is revoked regardless
    }

    // 3. Clear all alarms
    await chrome.alarms.clearAll();

    // 4. Set consentGiven to false in storage
    await chrome.storage.local.set({
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

    logger.info("[Perspective Prism] Consent revoked successfully");
    return { success: true };
  } catch (error) {
    logger.error("[Perspective Prism] Failed to revoke consent:", error);
    throw error;
  }
}

async function handleCheckPolicyVersion() {
  await getClient();
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
    logger.error(
      "[Perspective Prism] Failed to check policy version:",
      error,
    );
    throw error;
  }
}

/**
 * Handle opening side panel from injected button gesture
 * @param {Object} sender - Message sender context
 * @returns {Promise<Object>}
 */
async function handleOpenSidePanel(sender) {
  if (!chrome.sidePanel || !chrome.sidePanel.open) {
    throw new Error("Side Panel API is not supported in this browser version.");
  }
  if (!sender || !sender.tab) {
    throw new Error("Missing tab identifier.");
  }
  const windowId = sender.tab.windowId;
  const tabId = sender.tab.id;

  if (windowId !== undefined && windowId !== null) {
    await chrome.sidePanel.open({ windowId });
  } else if (tabId !== undefined && tabId !== null) {
    await chrome.sidePanel.open({ tabId });
  } else {
    throw new Error("Missing window or tab identifier.");
  }
  return { success: true };
}

/**
 * Handle saving data to cache from non-background context
 * @param {Object} message
 * @returns {Promise<Object>}
 */
async function handleSaveToCache(message) {
  const activeClient = await getClient();

  const validation = validateVideoId(message);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const videoId = validation.videoId;

  try {
    await activeClient.saveToCache(videoId, message.data);
    return { success: true };
  } catch (error) {
    logger.error("Save to cache failed:", error);
    throw error;
  }
}

export {
  getClient,
  handleOpenSidePanel,
  handleAnalysisRequest,
  handleCancelAnalysis,
  handleCacheCheck,
  handleGetAnalysisState,
  handleSaveToCache,
  handleClearCache,
  handleGetCacheStats,
  handleRevokeConsent,
  handleCheckPolicyVersion,
  StateManager,
  configManager,
};


