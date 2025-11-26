// Background service worker
importScripts("config.js", "client.js");

console.log("Perspective Prism background service worker loaded");

let client;
const configManager = new ConfigManager();

// Track analysis state for each video
// Note: This in-memory Map will be cleared on service worker restart (MV3 behavior).
// This is intentional - we reconstruct state from cache in handleGetAnalysisState()
// when no in-memory state exists. This provides a good balance between performance
// (fast in-memory access) and reliability (cache-based recovery after restart).
const analysisStates = new Map();

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
    // Fallback or error state? For now, we need a client to handle messages even if config fails (maybe with default?)
    // ConfigManager returns defaults on failure, so we should be good.
  });

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE_VIDEO") {
    handleAnalysisRequest(message, sendResponse);
    return true; // Indicates async response
  }
  if (message.type === "CHECK_CACHE") {
    handleCacheCheck(message, sendResponse);
    return true; // Indicates async response
  }
  if (message.type === "GET_CACHE_STATS") {
    handleGetCacheStats(sendResponse);
    return true; // Indicates async response
  }
  if (message.type === "CLEAR_CACHE") {
    handleClearCache(sendResponse);
    return true; // Indicates async response
  }
  if (message.type === "GET_ANALYSIS_STATE") {
    handleGetAnalysisState(message, sendResponse);
    return true; // Indicates async response
  }
  if (message.type === "OPEN_PRIVACY_POLICY") {
    chrome.tabs.create({ url: chrome.runtime.getURL("privacy.html") });
    return false; // No async response needed
  }
});

async function handleCacheCheck(message, sendResponse) {
  if (!client) {
    const config = await configManager.load();
    client = new PerspectivePrismClient(config.backendUrl);
  }

  const validation = validateVideoId(message);
  if (!validation.valid) {
    sendResponse({ success: false, error: validation.error });
    return;
  }

  const videoId = validation.videoId;

  try {
    const data = await client.checkCache(videoId);
    sendResponse({ success: true, data: data });
  } catch (error) {
    console.error("Cache check failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleAnalysisRequest(message, sendResponse) {
  if (!client) {
    // Should rarely happen if config loads fast, but handle it
    const config = await configManager.load();
    client = new PerspectivePrismClient(config.backendUrl);
  }

  // Declare videoId outside try block so catch block can access it
  let videoId = undefined;

  try {
    const validation = validateVideoId(message);
    if (!validation.valid) {
      sendResponse({ success: false, error: validation.error });
      return;
    }

    videoId = validation.videoId;

    // Set state to in_progress
    setAnalysisState(videoId, {
      status: "in_progress",
      progress: 0,
    });

    // Start analysis
    const result = await client.analyzeVideo(videoId);

    if (result.success) {
      // Set state to complete
      setAnalysisState(videoId, {
        status: "complete",
        claimCount: result.data?.claims?.length || 0,
        isCached: result.fromCache || false,
        analyzedAt: Date.now(),
      });
    } else {
      // Set state to error
      setAnalysisState(videoId, {
        status: "error",
        errorMessage: result.error || "Analysis failed",
        errorDetails: "",
      });
    }

    sendResponse(result);
  } catch (error) {
    console.error("Analysis request failed:", error);

    // Set state to error (videoId may be undefined if validation failed)
    if (videoId) {
      setAnalysisState(videoId, {
        status: "error",
        errorMessage: "Analysis failed",
        errorDetails: error.message,
      });
    }

    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Set analysis state for a video and notify listeners
 * @param {string} videoId - Video ID
 * @param {Object} state - Analysis state object
 */
function setAnalysisState(videoId, state) {
  analysisStates.set(videoId, state);

  // Notify popup and content scripts of state change
  chrome.runtime
    .sendMessage({
      type: "ANALYSIS_STATE_CHANGED",
      videoId: videoId,
      state: state,
    })
    .catch(() => {
      // Ignore errors if no listeners
    });
}

/**
 * Get analysis state for a video
 * @param {Object} message - Message with videoId
 * @param {Function} sendResponse - Response callback
 */
async function handleGetAnalysisState(message, sendResponse) {
  const validation = validateVideoId(message);
  if (!validation.valid) {
    sendResponse({ success: false, error: validation.error });
    return;
  }

  const videoId = validation.videoId;
  const state = analysisStates.get(videoId);

  if (state) {
    sendResponse({ success: true, state: state });
  } else {
    // Check if we have cached data
    if (!client) {
      const config = await configManager.load();
      client = new PerspectivePrismClient(config.backendUrl);
    }

    try {
      const cachedData = await client.checkCache(videoId);
      if (cachedData) {
        // We have cached data, show complete state
        const cacheState = {
          status: "complete",
          claimCount: cachedData.claims?.length || 0,
          isCached: true,
          analyzedAt: cachedData.metadata?.analyzed_at
            ? new Date(cachedData.metadata.analyzed_at).getTime()
            : Date.now(),
        };
        analysisStates.set(videoId, cacheState);
        sendResponse({ success: true, state: cacheState });
      } else {
        // No cached data, show idle state
        sendResponse({
          success: true,
          state: { status: "idle" },
        });
      }
    } catch (error) {
      console.error("Failed to check cache for state:", error);
      sendResponse({
        success: true,
        state: { status: "idle" },
      });
    }
  }
}

async function handleGetCacheStats(sendResponse) {
  if (!client) {
    const config = await configManager.load();
    client = new PerspectivePrismClient(config.backendUrl);
  }

  try {
    const stats = await client.getCacheStats();
    sendResponse({ success: true, stats: stats });
  } catch (error) {
    console.error("Failed to get cache stats:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleClearCache(sendResponse) {
  if (!client) {
    const config = await configManager.load();
    client = new PerspectivePrismClient(config.backendUrl);
  }

  try {
    await client.clearCache();

    // Clear all analysis states
    analysisStates.clear();

    // Notify popup of cache update
    chrome.runtime
      .sendMessage({
        type: "CACHE_UPDATED",
      })
      .catch(() => {
        // Ignore errors if no listeners
      });

    sendResponse({ success: true });
  } catch (error) {
    console.error("Failed to clear cache:", error);
    sendResponse({ success: false, error: error.message });
  }
}
