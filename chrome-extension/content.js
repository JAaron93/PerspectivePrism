// Content script for Perspective Prism

console.log("Perspective Prism content script loaded");

// State
let currentVideoId = null;
let analysisPanel = null;
let analysisButton = null;
let cancelRequest = false;
let loadingTimer = null;
let previouslyFocusedElement = null; // Track focus before panel opens

// Constants
const BUTTON_ID = "pp-analysis-button";
const PANEL_ID = "pp-analysis-panel";

// --- Video ID Extraction ---

function isValidVideoId(id) {
  // YouTube video IDs are exactly 11 characters
  // Valid characters: A-Z, a-z, 0-9, underscore, hyphen
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

function extractVideoId() {
  // Strategy 1: Standard watch URL parameter (?v=VIDEO_ID)
  const urlParams = new URLSearchParams(window.location.search);
  const watchParam = urlParams.get("v");
  if (watchParam && isValidVideoId(watchParam)) {
    console.debug(
      "[Perspective Prism] Extracted Video ID via watch param:",
      watchParam,
    );
    return watchParam;
  }

  const pathname = window.location.pathname;

  // Strategy 2: Shorts format: /shorts/VIDEO_ID
  const shortsMatch = pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
  if (shortsMatch && isValidVideoId(shortsMatch[1])) {
    console.debug(
      "[Perspective Prism] Extracted Video ID via shorts path:",
      shortsMatch[1],
    );
    return shortsMatch[1];
  }

  // Strategy 3: Embed format: /embed/VIDEO_ID
  const embedMatch = pathname.match(/\/embed\/([A-Za-z0-9_-]+)/);
  if (embedMatch && isValidVideoId(embedMatch[1])) {
    console.debug(
      "[Perspective Prism] Extracted Video ID via embed path:",
      embedMatch[1],
    );
    return embedMatch[1];
  }

  // Strategy 4: Legacy format: /v/VIDEO_ID
  const legacyMatch = pathname.match(/\/v\/([A-Za-z0-9_-]+)/);
  if (legacyMatch && isValidVideoId(legacyMatch[1])) {
    console.debug(
      "[Perspective Prism] Extracted Video ID via legacy path:",
      legacyMatch[1],
    );
    return legacyMatch[1];
  }

  // Strategy 5: Hash fragment (e.g. #v=VIDEO_ID)
  const hashMatch = window.location.hash.match(/[?&]v=([A-Za-z0-9_-]+)/);
  if (hashMatch && isValidVideoId(hashMatch[1])) {
    console.debug(
      "[Perspective Prism] Extracted Video ID via hash fragment:",
      hashMatch[1],
    );
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
      console.debug("[Perspective Prism] Metrics loaded:", metrics);
    }
  });
}

function saveMetrics() {
  chrome.storage.local.set({ selectorMetrics: metrics }, () => {
    if (chrome.runtime.lastError) {
      console.error(
        "[Perspective Prism] Failed to save metrics:",
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

function injectButton() {
  // Check for existing button using both ID and data attribute
  if (
    document.getElementById(BUTTON_ID) ||
    document.querySelector('[data-pp-analysis-button="true"]')
  ) {
    return;
  }

  metrics.attempts++;

  // Selectors from design doc
  const selectors = [
    "#top-level-buttons-computed", // Primary: Action buttons bar
    "#menu-container", // Fallback 1: Alternative menu container
    "#info-contents", // Fallback 2: Metadata area
  ];

  let container = null;
  let usedSelector = null;

  for (const selector of selectors) {
    container = document.querySelector(selector);
    if (container) {
      usedSelector = selector;
      break;
    }
  }

  if (container) {
    analysisButton = createAnalysisButton();
    // Insert as first child to ensure visibility
    container.insertBefore(analysisButton, container.firstChild);
    console.log(
      `[Perspective Prism] Button injected using selector: ${usedSelector}`,
    );

    metrics.successes++;
    metrics.bySelector[usedSelector] =
      (metrics.bySelector[usedSelector] || 0) + 1;
    saveMetrics();
  } else {
    console.warn(
      "[Perspective Prism] No suitable container found for button injection. Retrying later.",
    );
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
        console.error(
          `[Perspective Prism] All ${maxAttempts} retry attempts failed.`,
        );
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Keyboard Navigation Helpers ---

/**
 * Setup keyboard navigation for a panel (Escape to close, Tab cycling)
 * @param {HTMLElement} panel - The panel element
 * @param {ShadowRoot} shadow - The shadow root of the panel
 */
function setupKeyboardNavigation(panel, shadow) {
  const handleKeyDown = (e) => {
    // Handle Escape key to close panel
    if (e.key === "Escape") {
      e.preventDefault();
      removePanel();
      return;
    }

    // Handle Tab key for focus cycling
    if (e.key === "Tab") {
      handleTabKey(e, shadow);
    }
  };

  // Add event listener to the panel
  panel.addEventListener("keydown", handleKeyDown);

  // Store handler reference for cleanup
  panel._keydownHandler = handleKeyDown;
}

/**
 * Handle Tab key to cycle focus within panel
 * @param {KeyboardEvent} e - The keyboard event
 * @param {ShadowRoot} shadow - The shadow root of the panel
 */
function handleTabKey(e, shadow) {
  // Get all focusable elements within the shadow DOM
  const focusableElements = getFocusableElements(shadow);

  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = shadow.activeElement;

  // If Shift+Tab on first element, cycle to last
  if (e.shiftKey && activeElement === firstElement) {
    e.preventDefault();
    lastElement.focus();
    return;
  }

  // If Tab on last element, cycle to first
  if (!e.shiftKey && activeElement === lastElement) {
    e.preventDefault();
    firstElement.focus();
    return;
  }
}

/**
 * Get all focusable elements within a shadow root
 * @param {ShadowRoot} shadow - The shadow root
 * @returns {Array<HTMLElement>} Array of focusable elements
 */
function getFocusableElements(shadow) {
  const selector = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
    '[role="button"][tabindex="0"]',
  ].join(", ");

  return Array.from(shadow.querySelectorAll(selector));
}

async function handleAnalysisClick() {
  if (!currentVideoId) return;

  setButtonState("loading");
  showPanelLoading();
  cancelRequest = false;

  // Check consent
  try {
    if (typeof ConsentManager === "undefined") {
      throw new Error("ConsentManager dependency missing");
    }

    const consentManager = new ConsentManager();
    const consent = await consentManager.checkConsent();

    if (!consent.hasConsent) {
      setButtonState("idle"); // Reset button state
      removePanel(); // Ensure loading panel is closed
      consentManager.showConsentDialog(async (allowed) => {
        if (allowed) {
          // Retry analysis with consent
          handleAnalysisClick();
        }
      }, consent); // Pass consent object (with reason) to dialog
      return;
    }
  } catch (error) {
    console.error("[Perspective Prism] Consent check failed:", error);
    setButtonState("error");
    showPanelError("Failed to check consent. Please try again.");
    return;
  }

  try {
    const response = await sendMessageWithRetry(
      {
        type: "ANALYZE_VIDEO",
        videoId: currentVideoId,
      },
      {
        timeout: 5000, // 5 second per-request timeout
        maxAttempts: 4,
      },
    );

    // Check if request was cancelled
    if (cancelRequest) {
      console.log("[Perspective Prism] Request was cancelled");
      removePanel();
      setButtonState("idle");
      return;
    }

    if (response && response.success) {
      setButtonState("success");
      const isCached = response.fromCache || false;
      showResults(response.data, isCached);
    } else {
      setButtonState("error");
      showPanelError(response?.error || "Analysis failed");
    }
  } catch (error) {
    if (cancelRequest) {
      console.log("[Perspective Prism] Request was cancelled");
      removePanel();
      setButtonState("idle");
      return;
    }

    console.error(
      "[Perspective Prism] Analysis request failed after retries:",
      error,
    );
    setButtonState("error");
    showPanelError(error.message || "Connection failed. Please try again.");
  }
}

async function handleRefreshClick() {
  if (!currentVideoId || !analysisPanel) return;

  // Add refreshing overlay to current panel
  const shadow = analysisPanel.shadowRoot;
  if (!shadow) return;

  const refreshBtn = shadow.getElementById("pp-refresh-btn");
  if (!refreshBtn) return;

  refreshBtn.disabled = true;
  refreshBtn.classList.add("refreshing");

  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "pp-refresh-overlay";
  overlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10;
    border-radius: 12px;
  `;
  overlay.innerHTML = `
    <div style="width: 48px; height: 48px; border: 4px solid #e5e5e5; border-top-color: #065fd4; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 12px;"></div>
    <div style="font-size: 14px; font-weight: 500; color: #0f0f0f;">Refreshing analysis...</div>
  `;

  shadow.querySelector(":host").appendChild(overlay);

  try {
    // Send refresh request with cache bypass
    const response = await sendMessageWithRetry(
      {
        type: "ANALYZE_VIDEO",
        videoId: currentVideoId,
        bypassCache: true, // Force fresh analysis
      },
      {
        timeout: 5000,
        maxAttempts: 4,
      },
    );

    if (response && response.success) {
      // Remove overlay and show fresh results
      overlay.remove();
      showResults(response.data, false); // Always fresh after refresh
      setButtonState("success");
    } else {
      // Show error but keep previous results
      overlay.remove();
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("refreshing");

      // Show error message in a toast/temporary notification
      const errorToast = document.createElement("div");
      errorToast.style.cssText = `
        position: absolute;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: #c5221f;
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        z-index: 11;
        animation: slideIn 0.3s ease-out;
      `;
      errorToast.textContent = response?.error || "Refresh failed";
      shadow.querySelector(":host").appendChild(errorToast);

      setTimeout(() => errorToast.remove(), 3000);
    }
  } catch (error) {
    console.error("[Perspective Prism] Refresh failed:", error);

    // Remove overlay and restore previous state
    overlay.remove();
    refreshBtn.disabled = false;
    refreshBtn.classList.remove("refreshing");

    // Show error toast
    const errorToast = document.createElement("div");
    errorToast.style.cssText = `
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: #c5221f;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 11;
      animation: slideIn 0.3s ease-out;
    `;
    errorToast.textContent = "Refresh failed. Please try again.";
    shadow.querySelector(":host").appendChild(errorToast);

    setTimeout(() => errorToast.remove(), 3000);
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

// --- Results Display ---

function showResults(data, isCached = false) {
  removePanel(); // Remove existing

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "pp-panel-title");

  // Shadow DOM for style isolation
  const shadow = panel.attachShadow({ mode: "open" });

  // Styles
  const style = document.createElement("style");
  style.textContent = `
        :host {
            all: initial; /* Reset inherited styles */
            position: fixed;
            top: 60px;
            right: 20px;
            width: 400px;
            max-height: 80vh;
            background: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 12px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            font-family: Roboto, Arial, sans-serif;
            color: #0f0f0f;
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { transform: translateX(20px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .header {
            padding: 16px;
            border-bottom: 1px solid #e5e5e5;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f9f9f9;
            border-radius: 12px 12px 0 0;
            flex-shrink: 0;
        }
        .title { 
            font-weight: 600; 
            font-size: 16px; 
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .close-btn {
            cursor: pointer;
            border: none;
            background: none;
            font-size: 24px;
            color: #606060;
            padding: 4px;
            line-height: 1;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        .close-btn:hover { background: #e5e5e5; }
        .content { 
            padding: 16px; 
            overflow-y: auto;
            flex-grow: 1;
        }
        .claim-card {
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
            background: #fff;
            transition: box-shadow 0.2s;
        }
        .claim-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .claim-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            cursor: pointer;
            margin-bottom: 12px;
            padding: 4px;
            border-radius: 4px;
            transition: background 0.2s;
        }
        .claim-header:hover {
            background: #f9f9f9;
        }
        .claim-header:focus {
            outline: 2px solid #065fd4;
            outline-offset: 2px;
        }
        .toggle-btn {
            background: none;
            border: none;
            font-size: 14px;
            cursor: pointer;
            padding: 0;
            margin-left: 8px;
            color: #606060;
            transition: transform 0.2s;
            flex-shrink: 0;
        }
        .claim-details {
            max-height: 2000px;
            opacity: 1;
            overflow: hidden;
            transition: max-height 0.3s ease, opacity 0.3s ease;
        }
        .claim-details.collapsed {
            max-height: 0;
            opacity: 0;
        }
        .claim-text { 
            font-weight: 500; 
            font-size: 14px;
            line-height: 1.4;
            flex-grow: 1;
        }
        .assessment-badge { 
            display: inline-flex;
            align-items: center;
            padding: 4px 8px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 12px;
        }
        .assessment-badge.high { background: #e6f4ea; color: #137333; }
        .assessment-badge.medium { background: #fce8e6; color: #c5221f; }
        .assessment-badge.low { background: #fef7e0; color: #b06000; }
        
        .section-title {
            font-size: 12px;
            font-weight: 600;
            color: #606060;
            text-transform: uppercase;
            margin: 12px 0 8px 0;
            letter-spacing: 0.5px;
        }
        .perspectives-grid {
            display: grid;
            gap: 8px;
        }
        .perspective-row {
            display: grid;
            grid-template-columns: 120px 1fr auto 60px;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            padding: 4px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        .perspective-row:last-child { border-bottom: none; }
        .perspective-name { color: #606060; }
        .perspective-val { font-weight: 500; }
        .confidence-bar {
            height: 6px;
            background: #e5e5e5;
            border-radius: 3px;
            overflow: hidden;
        }
        .confidence-fill {
            height: 100%;
            background: #065fd4;
            border-radius: 3px;
            transition: width 0.3s ease;
        }
        .confidence-text {
            font-size: 11px;
            color: #606060;
            text-align: right;
        }
        
        .bias-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .bias-tag {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 4px;
            background: #f0f0f0;
            color: #606060;
        }
        .deception-score {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            margin-top: 8px;
        }
        .score-bar {
            flex-grow: 1;
            height: 6px;
            background: #e5e5e5;
            border-radius: 3px;
            overflow: hidden;
        }
        .score-fill {
            height: 100%;
            background: #c5221f;
            border-radius: 3px;
        }
        .refresh-btn {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            color: #606060;
            transition: background 0.2s;
            margin-right: 8px;
        }
        .refresh-btn:hover {
            background: #e5e5e5;
        }
        .refresh-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .refreshing {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;

  // Content Container
  const container = document.createElement("div");

  // Header
  const header = document.createElement("div");
  header.className = "header";

  const cachedBadge = isCached
    ? '<span style="font-size: 11px; background: #fef7e0; color: #b06000; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">Cached</span>'
    : '<span style="font-size: 11px; background: #e6f4ea; color: #137333; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">Fresh</span>';

  header.innerHTML = `
        <div class="title" id="pp-panel-title">
            <span>🔍</span> Perspective Prism${cachedBadge}
        </div>
        <div style="display: flex; align-items: center;">
            <button class="refresh-btn" id="pp-refresh-btn" aria-label="Refresh analysis">🔄</button>
            <button class="close-btn" aria-label="Close panel">×</button>
        </div>
    `;
  header.querySelector(".close-btn").onclick = removePanel;

  // Refresh button handler
  const refreshBtn = header.querySelector("#pp-refresh-btn");
  refreshBtn.onclick = () => handleRefreshClick();

  // Content Area
  const content = document.createElement("div");
  content.className = "content";

  if (data.claims && data.claims.length > 0) {
    const totalClaims = data.claims.length;

    data.claims.forEach((claim, index) => {
      const card = document.createElement("div");
      card.className = "claim-card";
      card.setAttribute("role", "article");
      card.setAttribute(
        "aria-label",
        `Claim ${index + 1} of ${totalClaims}: ${claim.claim_text}`,
      );

      // Claim Header (Clickable for expand/collapse)
      const claimHeader = document.createElement("div");
      claimHeader.className = "claim-header";
      claimHeader.setAttribute("role", "button");
      claimHeader.setAttribute("tabindex", "0");
      claimHeader.setAttribute("aria-expanded", "true");

      // 1. Claim Text
      const claimText = document.createElement("div");
      claimText.className = "claim-text";
      claimText.textContent = claim.claim_text;
      claimHeader.appendChild(claimText);

      // Toggle button
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "toggle-btn";
      toggleBtn.setAttribute("aria-label", "Toggle claim details");
      toggleBtn.textContent = "▼";
      claimHeader.appendChild(toggleBtn);

      card.appendChild(claimHeader);

      // Claim Details (Collapsible)
      const claimDetails = document.createElement("div");
      claimDetails.className = "claim-details";

      // 2. Overall Assessment
      const assessment = claim.truth_profile?.overall_assessment || "Unknown";
      let assessClass = "low";
      if (
        assessment.toLowerCase().includes("true") ||
        assessment.toLowerCase().includes("accurate")
      )
        assessClass = "high";
      else if (
        assessment.toLowerCase().includes("false") ||
        assessment.toLowerCase().includes("misleading")
      )
        assessClass = "medium";

      const badge = document.createElement("div");
      badge.className = `assessment-badge ${assessClass}`;
      badge.textContent = assessment;
      claimDetails.appendChild(badge);

      // 3. Perspectives
      if (claim.truth_profile?.perspectives) {
        const pTitle = document.createElement("div");
        pTitle.className = "section-title";
        pTitle.textContent = "Perspectives";
        claimDetails.appendChild(pTitle);

        const pGrid = document.createElement("div");
        pGrid.className = "perspectives-grid";

        Object.entries(claim.truth_profile.perspectives).forEach(
          ([key, val]) => {
            if (!val) return;
            const row = document.createElement("div");
            row.className = "perspective-row";

            // Format key (e.g., partisan_left -> Partisan Left)
            const label = key
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");

            // Create row structure
            const nameSpan = document.createElement("span");
            nameSpan.className = "perspective-name";
            nameSpan.textContent = label;

            const valSpan = document.createElement("span");
            valSpan.className = "perspective-val";
            valSpan.textContent = val.assessment;

            row.appendChild(nameSpan);

            // Add confidence bar if available
            if (typeof val.confidence === "number") {
              const confidenceBar = document.createElement("div");
              confidenceBar.className = "confidence-bar";
              confidenceBar.setAttribute("role", "progressbar");
              confidenceBar.setAttribute(
                "aria-valuenow",
                Math.round(val.confidence * 100),
              );
              confidenceBar.setAttribute("aria-valuemin", "0");
              confidenceBar.setAttribute("aria-valuemax", "100");

              const barFill = document.createElement("div");
              barFill.className = "confidence-fill";
              barFill.style.width = `${val.confidence * 100}%`;
              confidenceBar.appendChild(barFill);

              const percentText = document.createElement("span");
              percentText.className = "confidence-text";
              percentText.textContent = `${Math.round(val.confidence * 100)}%`;

              row.appendChild(confidenceBar);
              row.appendChild(percentText);
            }

            row.appendChild(valSpan);
            pGrid.appendChild(row);
          },
        );
        claimDetails.appendChild(pGrid);
      }

      // 4. Bias Indicators
      const bias = claim.truth_profile?.bias_indicators;
      if (bias) {
        // Fallacies & Manipulation
        const indicators = [
          ...(bias.logical_fallacies || []),
          ...(bias.emotional_manipulation || []),
        ];

        if (indicators.length > 0) {
          const bTitle = document.createElement("div");
          bTitle.className = "section-title";
          bTitle.textContent = "Bias Indicators";
          claimDetails.appendChild(bTitle);

          const bTags = document.createElement("div");
          bTags.className = "bias-tags";
          indicators.forEach((ind) => {
            const tag = document.createElement("span");
            tag.className = "bias-tag";
            tag.textContent = ind;
            bTags.appendChild(tag);
          });
          claimDetails.appendChild(bTags);
        }

        // Deception Score
        if (typeof bias.deception_score === "number") {
          const dDiv = document.createElement("div");
          dDiv.className = "deception-score";

          const label = document.createElement("span");
          label.textContent = "Deception Risk:";

          const scoreBar = document.createElement("div");
          scoreBar.className = "score-bar";

          const scoreFill = document.createElement("div");
          scoreFill.className = "score-fill";
          scoreFill.style.width = `${bias.deception_score * 10}%`;
          scoreBar.appendChild(scoreFill);

          const scoreText = document.createElement("span");
          scoreText.textContent = `${bias.deception_score}/10`;

          dDiv.appendChild(label);
          dDiv.appendChild(scoreBar);
          dDiv.appendChild(scoreText);
          claimDetails.appendChild(dDiv);
        }
      }

      card.appendChild(claimDetails);

      // Toggle functionality
      const toggleClaim = () => {
        const isExpanded = claimHeader.getAttribute("aria-expanded") === "true";
        claimHeader.setAttribute("aria-expanded", !isExpanded);
        claimDetails.classList.toggle("collapsed");
        toggleBtn.textContent = isExpanded ? "▶" : "▼";
      };

      claimHeader.onclick = toggleClaim;
      claimHeader.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleClaim();
        }
      };

      content.appendChild(card);
    });
  } else {
    content.innerHTML = `
        <div style="text-align: center; color: #606060; padding: 20px;">
            <p>No claims extracted from this video.</p>
        </div>
    `;
  }

  container.appendChild(header);
  container.appendChild(content);

  shadow.appendChild(style);
  shadow.appendChild(container);

  // Store reference to previously focused element (Analysis Button)
  previouslyFocusedElement = analysisButton;

  document.body.appendChild(panel);
  analysisPanel = panel;

  // Setup keyboard navigation (Escape to close, Tab cycling)
  setupKeyboardNavigation(panel, shadow);

  // Move focus to close button for accessibility
  const closeBtn = shadow.querySelector(".close-btn");
  if (closeBtn) {
    // Small delay to ensure panel is fully rendered
    setTimeout(() => closeBtn.focus(), 50);
  }
}

function showPanelLoading() {
  removePanel();
  clearLoadingTimer();

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "pp-panel-loading-title");

  const shadow = panel.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
        :host {
            all: initial;
            position: fixed;
            top: 60px;
            right: 20px;
            width: 400px;
            background: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 12px;
            z-index: 9999;
            font-family: Roboto, Arial, sans-serif;
            color: #0f0f0f;
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { transform: translateX(20px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px 24px;
            text-align: center;
        }
        .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid #e5e5e5;
            border-top-color: #065fd4;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }
        .message {
            font-size: 15px;
            font-weight: 500;
            margin-bottom: 8px;
            color: #0f0f0f;
        }
        .submessage {
            font-size: 13px;
            color: #606060;
            margin-bottom: 20px;
        }
        .cancel-btn {
            display: none;
            padding: 8px 16px;
            background: #f1f1f1;
            border: none;
            border-radius: 18px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }
        .cancel-btn:hover {
            background: #d9d9d9;
        }
        .cancel-btn.visible {
            display: inline-block;
        }
    `;

  const container = document.createElement("div");
  container.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <div class="message" id="pp-panel-loading-title">Analyzing video...</div>
            <div class="submessage" id="pp-loading-submessage"></div>
            <button class="cancel-btn" id="pp-cancel-btn">Cancel</button>
        </div>
    `;

  shadow.appendChild(style);
  shadow.appendChild(container);

  // Store reference to previously focused element (Analysis Button)
  previouslyFocusedElement = analysisButton;

  document.body.appendChild(panel);
  analysisPanel = panel;

  // Setup keyboard navigation (Escape to close, Tab cycling)
  setupKeyboardNavigation(panel, shadow);

  // Move focus to panel for screen reader announcement
  // Note: Cancel button will be focused when it becomes visible
  setTimeout(() => {
    const cancelBtn = shadow.getElementById("pp-cancel-btn");
    if (cancelBtn && cancelBtn.classList.contains("visible")) {
      cancelBtn.focus();
    }
  }, 50);

  const messageEl = shadow.getElementById("pp-loading-submessage");
  const cancelBtn = shadow.getElementById("pp-cancel-btn");

  // After 10s, update message
  loadingTimer = setTimeout(() => {
    messageEl.textContent = "Still analyzing... This may take up to 2 minutes";
  }, 10000);

  // After 15s, show cancel button
  setTimeout(() => {
    cancelBtn.classList.add("visible");
  }, 15000);

  // Cancel handler
  cancelBtn.onclick = () => {
    cancelRequest = true;
    clearLoadingTimer();
    removePanel();
    setButtonState("idle");
  };
}

function showPanelError(errorMessage) {
  removePanel();
  clearLoadingTimer();

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "pp-panel-error-title");

  const shadow = panel.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
        :host {
            all: initial;
            position: fixed;
            top: 60px;
            right: 20px;
            width: 400px;
            background: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 12px;
            z-index: 9999;
            font-family: Roboto, Arial, sans-serif;
            color: #0f0f0f;
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { transform: translateX(20px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .error-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px 24px;
            text-align: center;
        }
        .error-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
        .title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #c5221f;
        }
        .message {
            font-size: 14px;
            color: #606060;
            margin-bottom: 20px;
            line-height: 1.4;
        }
        .actions {
            display: flex;
            gap: 12px;
        }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 18px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }
        .retry-btn {
            background: #065fd4;
            color: white;
        }
        .retry-btn:hover {
            background: #0553bf;
        }
        .close-btn {
            background: #f1f1f1;
            color: #0f0f0f;
        }
        .close-btn:hover {
            background: #d9d9d9;
        }
    `;

  // Create container with static HTML (no user data)
  const container = document.createElement("div");
  container.innerHTML = `
        <div class="error-container">
            <div class="error-icon">⚠️</div>
            <div class="title" id="pp-panel-error-title">Analysis Failed</div>
            <div class="actions">
                <button class="btn retry-btn" id="pp-retry-btn">Retry</button>
                <button class="btn close-btn" id="pp-close-btn">Close</button>
            </div>
        </div>
    `;

  // Safely insert error message using textContent (XSS-safe)
  const messageEl = document.createElement("div");
  messageEl.className = "message";
  messageEl.textContent = errorMessage;

  // Insert message before actions
  const errorContainer = container.querySelector(".error-container");
  const actionsEl = errorContainer.querySelector(".actions");
  errorContainer.insertBefore(messageEl, actionsEl);

  shadow.appendChild(style);
  shadow.appendChild(container);

  // Store reference to previously focused element (Analysis Button)
  previouslyFocusedElement = analysisButton;

  document.body.appendChild(panel);
  analysisPanel = panel;

  // Setup keyboard navigation (Escape to close, Tab cycling)
  setupKeyboardNavigation(panel, shadow);

  // Attach event handlers
  shadow.getElementById("pp-retry-btn").onclick = handleAnalysisClick;
  shadow.getElementById("pp-close-btn").onclick = removePanel;

  // Move focus to retry button for accessibility
  const retryBtn = shadow.getElementById("pp-retry-btn");
  if (retryBtn) {
    setTimeout(() => retryBtn.focus(), 50);
  }
}

function clearLoadingTimer() {
  if (loadingTimer) {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }
}

function showError(msg) {
  alert(`Perspective Prism Error: ${msg}`);
}

function removePanel() {
  clearLoadingTimer();
  if (analysisPanel) {
    // Remove event listener if it exists
    if (analysisPanel._keydownHandler) {
      analysisPanel.removeEventListener(
        "keydown",
        analysisPanel._keydownHandler,
      );
    }

    analysisPanel.remove();
    analysisPanel = null;

    // Return focus to previously focused element (Analysis Button)
    if (
      previouslyFocusedElement &&
      document.contains(previouslyFocusedElement)
    ) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        previouslyFocusedElement.focus();
      }, 50);
    }

    previouslyFocusedElement = null;
  }
}

// --- Lifecycle ---

// --- Lifecycle ---

let observer = null;
let debounceTimer = null;

function handleMutations(mutations) {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    if (currentVideoId && !document.getElementById(BUTTON_ID)) {
      console.log(
        "[Perspective Prism] Mutation detected, re-injecting button...",
      );
      injectButton();
    }
  }, 500); // 500ms debounce
}

function setupObservers() {
  if (observer) {
    observer.disconnect();
  }

  // Try to observe specific container first
  const specificContainer =
    document.querySelector("#top-level-buttons-computed") ||
    document.querySelector("#menu-container");

  if (specificContainer) {
    console.log("[Perspective Prism] Observing specific container");
    observer = new MutationObserver(handleMutations);
    observer.observe(specificContainer, {
      childList: true,
      subtree: false, // Performance optimization
    });
  } else {
    console.log("[Perspective Prism] Observing document body (fallback)");
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true, // Necessary for fallback
    });
  }
}

  }
}

// --- Cleanup & Navigation ---

let isCleaningUp = false;

function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log("[Perspective Prism] Starting cleanup for navigation...");

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

    // 2. Cancel in-flight requests and timers
    cancelRequest = true;
    clearLoadingTimer();
    
    // 3. Close and clean panel UI
    removePanel();

    // 4. Remove button (will be re-injected if needed)
    if (analysisButton) {
      analysisButton.remove();
      analysisButton = null;
    }
    const existingBtn = document.getElementById(BUTTON_ID);
    if (existingBtn) existingBtn.remove();

    // 5. Reset state
    currentVideoId = null;
    
    console.log("[Perspective Prism] Cleanup complete.");
  } catch (error) {
    console.error("[Perspective Prism] Error during cleanup:", error);
  } finally {
    isCleaningUp = false;
  }
}

function handleNavigation() {
  // If we are currently cleaning up, skip (or queue?)
  if (isCleaningUp) return;

  const vid = extractVideoId();

  if (vid !== currentVideoId) {
    console.log(`[Perspective Prism] Navigation detected: ${currentVideoId} -> ${vid}`);
    
    // Cleanup old video state
    if (currentVideoId) {
      cleanup();
    }

    // Setup new video state
    if (vid) {
      currentVideoId = vid;
      // Reset cancel flag for new video
      cancelRequest = false;
      
      // Small delay to ensure DOM is ready for injection
      setTimeout(() => {
        injectButton();
        setupObservers();
      }, 500);
    }
  } else if (currentVideoId) {
    // Same video, ensure UI is present
    if (!document.getElementById(BUTTON_ID)) {
      injectButton();
    }
    if (!observer) {
      setupObservers();
    }
  }
}

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

  // 3. Polling Fallback (1 second)
  // Catches missed events or delayed DOM updates
  setInterval(handleNavigation, 1000);

  // Initial check
  handleNavigation();
}

// Run
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
