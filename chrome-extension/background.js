// Background service worker
importScripts("config.js", "client.js");

console.log("Perspective Prism background service worker loaded");

let client;
const configManager = new ConfigManager();

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

  try {
    const validation = validateVideoId(message);
    if (!validation.valid) {
      sendResponse({ success: false, error: validation.error });
      return;
    }

    const result = await client.analyzeVideo(validation.videoId);
    sendResponse(result);
  } catch (error) {
    console.error("Analysis request failed:", error);
    sendResponse({ success: false, error: error.message });
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
    sendResponse({ success: true });
  } catch (error) {
    console.error("Failed to clear cache:", error);
    sendResponse({ success: false, error: error.message });
  }
}
