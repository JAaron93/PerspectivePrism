// sidepanel.js - Perspective Prism Side Panel
import { logger } from "./logging-utils.js";

let currentVideoId = null;

// DOM Elements
const stateIdle = document.getElementById("state-idle");
const stateLoading = document.getElementById("state-loading");
const stateError = document.getElementById("state-error");
const stateResults = document.getElementById("state-results");

const loadingTitle = document.getElementById("loading-title");
const loadingSubmessage = document.getElementById("loading-submessage");
const progressBarFill = document.getElementById("progress-bar-fill");
const cancelBtn = document.getElementById("pp-cancel-btn");

const errorTitle = document.getElementById("error-title");
const errorMessage = document.getElementById("error-message");
const retryBtn = document.getElementById("pp-retry-btn");

const overallAssessmentBadge = document.getElementById("overall-assessment-badge");
const analysisMetadata = document.getElementById("analysis-metadata");
const claimsListContainer = document.getElementById("claims-list-container");
const optionsBtn = document.getElementById("pp-options-btn");

// Extract video ID from URL
function extractVideoIdFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const vParam = urlObj.searchParams.get("v");
    if (vParam) return vParam;
    
    if (urlObj.hostname.includes("youtu.be")) {
      const pathParts = urlObj.pathname.split("/");
      return pathParts[1] || null;
    }
    
    const shortsMatch = urlObj.pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];
    
    return null;
  } catch (error) {
    return null;
  }
}

// Show specific state in UI
function showState(stateName) {
  stateIdle.style.display = stateName === "idle" ? "flex" : "none";
  stateLoading.style.display = stateName === "loading" ? "flex" : "none";
  stateError.style.display = stateName === "error" ? "flex" : "none";
  stateResults.style.display = stateName === "results" ? "flex" : "none";
}

// Render analysis results
function renderResults(data) {
  if (!data) return;

  // Render overall assessment
  const assessment = data.overall_assessment || "Unverified";
  overallAssessmentBadge.textContent = assessment;
  overallAssessmentBadge.className = "badge"; // Reset classes
  
  if (assessment === "Likely True") {
    overallAssessmentBadge.classList.add("badge-true");
  } else if (assessment === "Mixed") {
    overallAssessmentBadge.classList.add("badge-mixed");
  } else if (assessment === "Likely False") {
    overallAssessmentBadge.classList.add("badge-false");
  } else if (assessment === "Deceptive" || assessment === "Suspicious/Deceptive") {
    overallAssessmentBadge.classList.add("badge-deceptive");
  } else {
    overallAssessmentBadge.classList.add("badge-unverified");
  }

  // Render metadata
  if (data.metadata && data.metadata.analyzed_at) {
    const dateStr = new Date(data.metadata.analyzed_at).toLocaleString();
    analysisMetadata.textContent = `Analyzed on: ${dateStr}`;
  } else {
    analysisMetadata.textContent = "";
  }

  // Render claims list
  claimsListContainer.innerHTML = "";
  if (data.claims && data.claims.length > 0) {
    data.claims.forEach((claim) => {
      const claimCard = document.createElement("div");
      claimCard.className = "claim-card";

      // Card Header
      const header = document.createElement("div");
      header.className = "claim-card-header";
      
      const title = document.createElement("span");
      title.className = "claim-card-title";
      title.textContent = claim.claim_text;
      
      header.appendChild(title);
      
      if (claim.timestamp) {
        const timestamp = document.createElement("span");
        timestamp.className = "claim-timestamp";
        timestamp.textContent = claim.timestamp;
        timestamp.addEventListener("click", (e) => {
          e.stopPropagation();
          seekToTimestamp(claim.timestamp);
        });
        header.appendChild(timestamp);
      }
      
      claimCard.appendChild(header);
      claimsListContainer.appendChild(claimCard);
    });
  } else {
    claimsListContainer.innerHTML = "<p class='state-description'>No claims found in this video.</p>";
  }
}

// Seek video to timestamp helper
function seekToTimestamp(timestampStr) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "SEEK_TO",
        timestamp: timestampStr
      }).catch(() => {});
    }
  });
}

// Load and handle state for current video
async function checkCurrentTabState() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) {
      showState("idle");
      return;
    }

    const tab = tabs[0];
    const videoId = extractVideoIdFromUrl(tab.url || "");

    if (!videoId) {
      currentVideoId = null;
      showState("idle");
      return;
    }

    currentVideoId = videoId;

    const response = await chrome.runtime.sendMessage({
      type: "GET_ANALYSIS_STATE",
      videoId: videoId
    });

    if (response && response.success && response.state) {
      handleAnalysisState(response.state);
    } else {
      showState("idle");
    }
  } catch (error) {
    logger.error("Failed to check tab state:", error);
    showState("idle");
  }
}

// Process state updates
function handleAnalysisState(state) {
  if (!state) return;

  switch (state.status) {
    case "idle":
      showState("idle");
      break;
      
    case "in_progress":
      showState("loading");
      loadingSubmessage.textContent = "Analyzing video...";
      progressBarFill.style.width = `${state.progress || 0}%`;
      break;
      
    case "complete":
      showState("results");
      // Fetch the actual cache data from Service Worker
      chrome.runtime.sendMessage({
        type: "CHECK_CACHE",
        videoId: currentVideoId
      }).then((response) => {
        if (response && response.success && response.data) {
          renderResults(response.data);
        }
      }).catch(() => {});
      break;
      
    case "error":
      showState("error");
      errorMessage.textContent = state.errorMessage || "An error occurred during analysis.";
      break;
      
    case "cancelled":
      showState("idle");
      break;
  }
}

// Listen to message broadcasts from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYSIS_STATE_CHANGED") {
    if (message.videoId === currentVideoId) {
      handleAnalysisState(message.state);
    }
  } else if (message.type === "ANALYSIS_PROGRESS") {
    if (message.videoId === currentVideoId) {
      loadingSubmessage.textContent = message.payload.message || "Analyzing...";
      if (message.payload.progress) {
        progressBarFill.style.width = `${message.payload.progress}%`;
      }
    }
  }
  return false;
});

// Options / Settings button
if (optionsBtn) {
  optionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

// Cancel analysis button
if (cancelBtn) {
  cancelBtn.addEventListener("click", () => {
    if (currentVideoId) {
      chrome.runtime.sendMessage({
        type: "CANCEL_ANALYSIS",
        videoId: currentVideoId
      }).catch(() => {});
    }
  });
}

// Retry analysis button
if (retryBtn) {
  retryBtn.addEventListener("click", () => {
    if (currentVideoId) {
      chrome.runtime.sendMessage({
        type: "ANALYZE_VIDEO",
        videoId: currentVideoId
      }).catch(() => {});
    }
  });
}

// Monitor tab updates/activation to track YouTube video URL changes
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      checkCurrentTabState();
    }
  });

  chrome.tabs.onActivated.addListener(() => {
    checkCurrentTabState();
  });
}

// Run initialization
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    checkCurrentTabState();
  });
  
  // Also run immediately in case DOMContentLoaded already fired
  if (document.readyState === "interactive" || document.readyState === "complete") {
    checkCurrentTabState();
  }
}
