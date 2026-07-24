// Content script for Perspective Prism

// Defensive logger initialization: use window.Logger if available, otherwise fallback to no-op
const logger = (typeof window.Logger !== 'undefined')
  ? new window.Logger("[Perspective Prism Content]")
  : { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

logger.info("Perspective Prism content script loaded");

// State
let currentVideoId = null;
let analysisButton = null;
let cancelRequest = false;
let navigationGeneration = 0;
let playbackSequence = 0;
let activeVideoElement = null;
let throttledTimeUpdateHandler = null;

// Constants
const BUTTON_ID = "pp-analysis-button";


// --- Video ID Extraction ---

function isValidVideoId(id) {
  return window.isValidVideoId ? window.isValidVideoId(id) : (id && /^[a-zA-Z0-9_-]{11}$/.test(id));
}

function extractVideoId() {
  if (window.extractVideoIdFromUrl) {
    return window.extractVideoIdFromUrl(window.location.href);
  }
  // Fallback
  const urlParams = new URLSearchParams(window.location.search);
  const watchParam = urlParams.get("v");
  if (watchParam && isValidVideoId(watchParam)) {
    return watchParam;
  }
  
  // Strategy 5: Hash fragment (e.g. #v=VIDEO_ID)
  const hashMatch = window.location.hash.match(/[?&]v=([A-Za-z0-9_-]+)/);
  if (hashMatch && isValidVideoId(hashMatch[1])) {
    return hashMatch[1];
  }

  return null;
}

// --- UI Injection ---

function createAnalysisButton() {
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.className = "pp-ext-button";
  btn.setAttribute("data-pp-analysis-button", "true"); // Duplication prevention

  // Accessibility attributes
  btn.setAttribute("aria-label", "Analyze video claims");
  btn.setAttribute("role", "button");
  btn.setAttribute("tabindex", "0");

  btn.innerHTML = `
        <span class="pp-icon">🔍</span>
        <span>Analyze Claims</span>
    `;
  btn.onclick = handleAnalysisClick;
  return btn;
}

// Metrics State
const metrics = {
  attempts: 0,
  successes: 0,
  failures: 0,
  bySelector: {}, // Map of selector -> count
};

function loadMetrics() {
  chrome.storage.local.get(["selectorMetrics"], (result) => {
    if (result.selectorMetrics) {
      Object.assign(metrics, result.selectorMetrics);
      logger.debug("Metrics loaded:", metrics);
    }
  });
}

function saveMetrics() {
  chrome.storage.local.set({ selectorMetrics: metrics }, () => {
    if (chrome.runtime.lastError) {
      logger.error(
        "Failed to save metrics:",
        chrome.runtime.lastError,
      );
    }
    // console.debug('[Perspective Prism] Metrics saved');
  });
}

function printMetrics() {
  console.table(metrics);
  console.table(metrics.bySelector);
}

// Expose for debugging
window.ppPrintMetrics = printMetrics;

function isElementVisible(el) {
  if (!el) return false;
  let current = el;
  while (current && current !== document.body) {
    if (current.hasAttribute("hidden")) return false;
    if (current.style && (current.style.display === "none" || current.style.visibility === "hidden")) {
      return false;
    }
    try {
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") return false;
    } catch (e) {
      // Ignored
    }
    current = current.parentElement;
  }
  return true;
}

function injectButton() {
  // Check for existing button and visibility
  const existingBtn = document.getElementById(BUTTON_ID) || document.querySelector('[data-pp-analysis-button="true"]');
  if (existingBtn) {
    if (isElementVisible(existingBtn)) {
      logger.debug("Visible button already exists, skipping injection.");
      return;
    } else {
      logger.info("Found hidden or orphaned button. Removing to re-inject.");
      existingBtn.remove();
    }
  }

  metrics.attempts++;

  // Selectors from design doc
  const selectors = [
    "#top-level-buttons-computed", // Primary: Action buttons bar
    "#actions", // Secondary: Common container for actions
    "#menu-container", // Fallback 1: Alternative menu container
    "#info-contents", // Fallback 2: Metadata area
  ];

  let container = null;
  let usedSelector = null;

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (isElementVisible(el)) {
        container = el;
        usedSelector = selector;
        break;
      }
    }
    if (container) break;
  }

  if (container) {
    analysisButton = createAnalysisButton();
    // Use requestAnimationFrame for smoother injection
    requestAnimationFrame(() => {
      try {
        if (container && document.contains(container) && isElementVisible(container)) {
          const duplicate = document.getElementById(BUTTON_ID) || document.querySelector('[data-pp-analysis-button="true"]');
          if (duplicate) {
            if (isElementVisible(duplicate)) return;
            duplicate.remove();
          }
          container.insertBefore(analysisButton, container.firstChild);
          logger.info(
            `Button injected using selector: ${usedSelector}`,
          );
          metrics.successes++;
          metrics.bySelector[usedSelector] =
            (metrics.bySelector[usedSelector] || 0) + 1;
          saveMetrics();
        } else {
          metrics.failures++;
          saveMetrics();
        }
      } catch (error) {
        logger.error(
          `Failed to inject button into ${usedSelector}:`,
          error,
        );
        metrics.failures++;
        saveMetrics();
      }
    });
  } else {
    // Only log at debug level to avoid console noise
    // logger.debug(
    //   "[Perspective Prism] No suitable container found for button injection. Retrying later.",
    // );
    metrics.failures++;
    saveMetrics();
  }
}

// --- Messaging Utilities ---

/**
 * Send a message to the background service worker with automatic retry.
 *
 * @param {Object} message - Message to send
 * @param {Object} options - Retry options
 * @param {number} options.timeout - Per-request timeout in ms (default: 5000)
 * @param {number} options.maxAttempts - Max retry attempts (default: 4)
 * @returns {Promise<any>} Response from background
 */
async function sendMessageWithRetry(message, options = {}) {
  const { timeout = 5000, maxAttempts = 4 } = options;

  const backoffDelays = [0, 500, 1000, 2000];
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Wait for backoff delay before retry (skip for first attempt)
      if (attempt > 0) {
        const delay =
          backoffDelays[Math.min(attempt, backoffDelays.length - 1)];
        await sleep(delay);
      }

      // Send message with timeout
      return await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);

        try {
          chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeoutId);

            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (response && response.error) {
              // Treat fatal errors as non-retriable
              const err = new Error(response.error.message || response.error);
              if (
                response.error.code === "AUTH_ERROR" ||
                response.error.fatal
              ) {
                err.fatal = true;
              }
              reject(err);
              return;
            }

            resolve(response);
          });
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
    } catch (error) {
      lastError = error;

      // Stop retrying on fatal errors
      if (
        error.fatal ||
        error.message.includes("Extension context invalidated")
      ) {
        throw error;
      }

      // If last attempt, throw
      if (attempt === maxAttempts - 1) {
        logger.error(
          `All ${maxAttempts} retry attempts failed.`,
        );
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateTimelineMarkers(data) {
  try {
    const canRender = data && data.claims &&
      typeof window.clusterClaims === "function" &&
      typeof window.renderTimelineMarkers === "function";

    if (canRender) {
      const video = document.querySelector("#movie_player-video") || document.querySelector("video");
      const duration = video ? video.duration : 0;
      if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
        const clusters = window.clusterClaims(data.claims, duration);
        window.renderTimelineMarkers(clusters, duration);
      } else {
        window.renderTimelineMarkers([], 0);
      }
    } else {
      if (typeof window.renderTimelineMarkers === "function") {
        window.renderTimelineMarkers([], 0);
      }
    }
  } catch (err) {
    logger.error("Timeline marker rendering failed, skipping:", err);
  }
}

async function handleAnalysisClick() {
  if (!currentVideoId) {
    logger.warn("Analysis requested but no Video ID found.");
    return;
  }

  const analysisVideoId = currentVideoId;

  // Send OPEN_SIDE_PANEL synchronously while user gesture is active
  chrome.runtime.sendMessage({
    type: "OPEN_SIDE_PANEL",
    videoId: analysisVideoId,
  }).catch((err) => logger.debug("OPEN_SIDE_PANEL ignored:", err));

  setButtonState("loading");
  cancelRequest = false;

  try {
    const response = await sendMessageWithRetry(
      {
        type: "ANALYZE_VIDEO",
        videoId: currentVideoId,
      },
      {
        timeout: 60000,
        maxAttempts: 2,
      },
    );

    if (cancelRequest) {
      logger.info("Request was cancelled");
      setButtonState("idle");
      return;
    }

    if (analysisVideoId !== currentVideoId) {
      logger.info(`Discarding stale response for ${analysisVideoId} (current: ${currentVideoId})`);
      return;
    }

    if (response && response.success) {
      setButtonState("success");
      updateTimelineMarkers(response.data);
    } else {
      setButtonState("error");
      logger.error("Analysis failed:", response?.error || "Unknown error");
    }
  } catch (error) {
    if (cancelRequest) {
      logger.info("[Perspective Prism] Request was cancelled");
      setButtonState("idle");
      return;
    }

    logger.error(
      "Analysis request failed after retries:",
      error,
    );
    setButtonState("error");
  }
}

function setButtonState(state) {
  if (!analysisButton) return;

  const textSpan = analysisButton.querySelector("span:last-child");
  const iconSpan = analysisButton.querySelector(".pp-icon");

  if (!textSpan || !iconSpan) return;

  // Reset ARIA busy state
  analysisButton.setAttribute("aria-busy", "false");
  analysisButton.classList.remove("pp-state-error", "pp-state-success");

  switch (state) {
    case "loading":
      textSpan.textContent = "Analyzing...";
      iconSpan.textContent = "⏳";
      analysisButton.disabled = true;
      analysisButton.setAttribute("aria-label", "Analysis in progress");
      analysisButton.setAttribute("aria-busy", "true");
      break;
    case "success":
      textSpan.textContent = "Analyzed";
      iconSpan.textContent = "✅";
      analysisButton.disabled = false;
      analysisButton.setAttribute(
        "aria-label",
        "Analysis complete. Click to view results.",
      );
      analysisButton.classList.add("pp-state-success");
      break;
    case "error":
      textSpan.textContent = "Retry Analysis";
      iconSpan.textContent = "⚠️";
      analysisButton.disabled = false;
      analysisButton.setAttribute(
        "aria-label",
        "Analysis failed. Click to retry.",
      );
      analysisButton.classList.add("pp-state-error");
      break;
    default: // idle
      textSpan.textContent = "Analyze Claims";
      iconSpan.textContent = "🔍";
      analysisButton.disabled = false;
      analysisButton.setAttribute("aria-label", "Analyze video claims");
  }
}

// --- Cleanup & Helpers ---

function removePanel() {
  // Legacy overlay excised - no-op for backward compatibility
}

let observer = null;
let debounceTimer = null;

function handleMutations(mutations) {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    if (currentVideoId && !document.getElementById(BUTTON_ID)) {
      logger.info(
        "Mutation detected, re-injecting button...",
      );
      injectButton();
    }
  }, 500); // 500ms debounce
}

function setupObservers() {
  if (observer) {
    observer.disconnect();
  }

  // Always observe document body to catch all re-renders and navigation events
  // This is more robust than observing specific containers which might be replaced
  logger.info("Setting up global observer");
  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// --- Cleanup & Navigation ---

function throttle(func, limit) {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

function setupVideoSync(video, videoId, generationId) {
  if (activeVideoElement) {
    cleanupVideoSync();
  }
  
  activeVideoElement = video;
  
  const onTimeUpdate = () => {
    playbackSequence++;
    chrome.runtime.sendMessage({
      type: "SYNC_PLAYBACK",
      videoId: videoId,
      generationId: generationId,
      sequence: playbackSequence,
      currentTime: video.currentTime
    }).catch(() => {});
  };
  
  throttledTimeUpdateHandler = throttle(onTimeUpdate, 250);
  video.addEventListener("timeupdate", throttledTimeUpdateHandler);
  logger.info(`Video sync set up for video: ${videoId}, generation: ${generationId}`);
}

function cleanupVideoSync() {
  if (activeVideoElement && throttledTimeUpdateHandler) {
    activeVideoElement.removeEventListener("timeupdate", throttledTimeUpdateHandler);
  }
  activeVideoElement = null;
  throttledTimeUpdateHandler = null;
  logger.info("Video sync cleaned up");
}

let isCleaningUp = false;

function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  logger.info("Starting cleanup for navigation...");

  try {
    // 1. Disconnect MutationObserver
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (navigationTimer) {
      clearTimeout(navigationTimer);
      navigationTimer = null;
    }

    // 2. Cancel in-flight requests and timers
    cancelRequest = true;
    cleanupVideoSync();
    
    // 3. Remove button (will be re-injected if needed)
    if (analysisButton) {
      analysisButton.remove();
      analysisButton = null;
    }
    const existingBtn = document.getElementById(BUTTON_ID);
    if (existingBtn) existingBtn.remove();

    // 4. Clear timeline markers
    if (typeof window.renderTimelineMarkers === "function") {
      window.renderTimelineMarkers([], 0);
    }

    // 5. Reset state
    currentVideoId = null;
    
    logger.info("Cleanup complete.");
  } catch (error) {
    logger.error("Error during cleanup:", error);
  } finally {
    isCleaningUp = false;
  }
}

let navigationTimer = null;

function handleNavigation(immediate = false) {
  if (navigationTimer) {
    clearTimeout(navigationTimer);
    navigationTimer = null;
  }

  if (immediate) {
    performNavigation();
  } else {
    navigationTimer = setTimeout(() => {
      performNavigation();
    }, 500);
  }
}

function performNavigation() {
  if (isCleaningUp) {
    logger.debug("Navigation skipped due to cleanup in progress.");
    return;
  }

  const vid = extractVideoId();

  if (vid !== currentVideoId) {
    logger.info(`Navigation detected: ${currentVideoId} -> ${vid}`);
    
    if (currentVideoId) {
      cleanup();
    }

    if (vid) {
      currentVideoId = vid;
      navigationGeneration++;
      playbackSequence = 0;
      
      chrome.runtime.sendMessage({
        type: "YOUTUBE_NAVIGATED",
        videoId: vid
      }).catch(() => {});

      cancelRequest = false;
      
      setTimeout(() => {
        if (extractVideoId() !== currentVideoId) return;
        injectButton();
        setupObservers();

        const video = document.querySelector("#movie_player-video") || document.querySelector("video");
        if (video) {
          setupVideoSync(video, currentVideoId, navigationGeneration);
        }
      }, 500);
    }
  } else if (currentVideoId) {
    if (!document.getElementById(BUTTON_ID)) {
      injectButton();
    }
    if (!observer) {
      setupObservers();
    }
    const video = document.querySelector("#movie_player-video") || document.querySelector("video");
    if (video && video !== activeVideoElement) {
      setupVideoSync(video, currentVideoId, navigationGeneration);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYSIS_PROGRESS') {
    const { videoId, payload } = message;
    if (videoId !== currentVideoId) return;
    logger.info(`Progress update for ${videoId}:`, payload);
  }
  return false;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYSIS_STATE_CHANGED') {
    const { videoId, state } = message;
    if (videoId !== currentVideoId) return;

    if (state.status === 'in_progress') {
      setButtonState('loading');
    } else if (state.status === 'complete') {
      setButtonState('success');
      if (state.data) {
        updateTimelineMarkers(state.data);
      }
    } else if (state.status === 'error') {
      setButtonState('error');
    } else {
      setButtonState('idle');
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEEK_TO') {
    const video = document.querySelector("#movie_player-video") || document.querySelector("video");
    if (video) {
      const seconds = typeof window.parseTimestampToSeconds === "function"
        ? window.parseTimestampToSeconds(message.timestamp)
        : 0;
      video.currentTime = seconds;
      logger.info(`Seeked video to timestamp: ${message.timestamp} (${seconds}s)`);
    }
  }
});

function init() {
  loadMetrics();

  // --- Navigation Detection Strategy ---
  // Hybrid approach: History API interception + Polling fallback

  // 1. History API Interception
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    // Small delay to allow URL to update
    setTimeout(handleNavigation, 0);
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    setTimeout(handleNavigation, 0);
  };

  // 2. Popstate Event (Back/Forward)
  window.addEventListener("popstate", handleNavigation);

  // 3. YouTube SPA Navigation Events
  document.addEventListener("yt-navigate-start", () => {
    logger.info("yt-navigate-start event detected");
    cleanup();
  });

  document.addEventListener("yt-navigate-finish", () => {
    logger.info("yt-navigate-finish event detected");
    handleNavigation();
  });

  // 4. Polling Fallback (1 second)
  // Catches missed events or delayed DOM updates
  setInterval(handleNavigation, 1000);

  // Initial check
  handleNavigation();

  // Initial State Check (if we joined mid-analysis)
  setTimeout(checkInitialState, 1000);
}

/**
 * Check state on load to sync UI if analysis is running
 */
async function checkInitialState() {
  const videoId = extractVideoId();
  if (videoId) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ANALYSIS_STATE',
        videoId: videoId
      });
      
      if (response && response.success && response.state) {
        const state = response.state;
        if (state.status === 'in_progress') {
          setButtonState('loading');
        } else if (state.status === 'complete') {
          setButtonState('success');
        } else if (state.status === 'error') {
          setButtonState('error');
        }
      } else if (response && !response.success) {
         logger.warn("Initial state check failed:", response.error);
      }
    } catch (e) {
      // Ignore errors (e.g. extension context invalid)
    }
  }
}

// Run
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
