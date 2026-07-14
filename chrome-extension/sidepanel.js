// sidepanel.js - Perspective Prism Side Panel
import { logger } from "./logging-utils.js";
import { extractVideoIdFromUrl } from "./video-utils.js";
import { parseTimestampToSeconds } from "./timeline-utils.js";

let currentVideoId = null;
let currentTabId = null;
let lastSequence = -1;
let currentGenerationId = null;

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

// Show specific state in UI
function showState(stateName) {
  stateIdle.style.display = stateName === "idle" ? "flex" : "none";
  stateLoading.style.display = stateName === "loading" ? "flex" : "none";
  stateError.style.display = stateName === "error" ? "flex" : "none";
  stateResults.style.display = stateName === "results" ? "flex" : "none";
}

if (typeof window !== "undefined") {
  window.showState = showState;
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
      if (claim.timestamp) {
        claimCard.dataset.timestampSeconds = parseTimestampToSeconds(claim.timestamp);
      }

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

      // Card Body (Collapsible detail view)
      const body = document.createElement("div");
      body.className = "claim-card-body";
      body.style.display = "none"; // Collapsed by default

      // 1. Overall Assessment Badge
      const assessmentVal = claim.truth_profile?.overall_assessment || "Unverified";
      const badge = document.createElement("span");
      let badgeClass = "badge-unverified";
      const lowerAssess = assessmentVal.toLowerCase();
      if (lowerAssess.includes("true")) {
        badgeClass = "badge-true";
      } else if (lowerAssess.includes("mixed")) {
        badgeClass = "badge-mixed";
      } else if (lowerAssess.includes("false")) {
        badgeClass = "badge-false";
      } else if (lowerAssess.includes("deceptive") || lowerAssess.includes("suspicious")) {
        badgeClass = "badge-deceptive";
      }
      badge.className = `badge ${badgeClass}`;
      badge.textContent = assessmentVal;
      body.appendChild(badge);

      // 2. Perspectives (Scientific, Journalistic, Partisan Left, Partisan Right)
      if (claim.truth_profile?.perspectives) {
        const perspectivesContainer = document.createElement("div");
        perspectivesContainer.style.display = "flex";
        perspectivesContainer.style.flexDirection = "column";
        perspectivesContainer.style.gap = "8px";
        perspectivesContainer.style.marginTop = "8px";
        
        Object.entries(claim.truth_profile.perspectives).forEach(([key, val]) => {
          if (!val) return;
          const pItem = document.createElement("div");
          pItem.className = "perspective-item";
          
          const pInfo = document.createElement("div");
          pInfo.className = "perspective-info";
          
          const pLabel = document.createElement("span");
          pLabel.textContent = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          
          const pVal = document.createElement("span");
          const confidencePercent = typeof val.confidence === "number" 
            ? Math.round(val.confidence <= 1 ? val.confidence * 100 : val.confidence)
            : null;
          pVal.textContent = confidencePercent !== null ? `${confidencePercent}%` : "";
          
          pInfo.appendChild(pLabel);
          pInfo.appendChild(pVal);
          pItem.appendChild(pInfo);
          
          if (confidencePercent !== null) {
            const pFillContainer = document.createElement("div");
            pFillContainer.className = "perspective-fill-container";
            
            const pFill = document.createElement("div");
            pFill.className = "perspective-fill";
            pFill.style.width = `${confidencePercent}%`;
            
            pFillContainer.appendChild(pFill);
            pItem.appendChild(pFillContainer);
          }
          
          perspectivesContainer.appendChild(pItem);
        });
        
        body.appendChild(perspectivesContainer);
      }

      // 3. Bias Indicators (logical_fallacies & emotional_manipulation)
      const bias = claim.truth_profile?.bias_indicators;
      const fallacies = claim.truth_profile?.logical_fallacies || bias?.logical_fallacies || [];
      const manipulation = claim.truth_profile?.emotional_manipulation || bias?.emotional_manipulation || [];
      const tags = [...fallacies, ...manipulation];
      
      if (tags.length > 0) {
        const biasContainer = document.createElement("div");
        biasContainer.className = "bias-container";
        biasContainer.style.marginTop = "8px";
        tags.forEach((tagText) => {
          const tag = document.createElement("span");
          tag.className = "bias-tag";
          tag.textContent = tagText;
          biasContainer.appendChild(tag);
        });
        body.appendChild(biasContainer);
      }

      // 4. Deception Score
      const deceptionScore = claim.truth_profile?.deception_score !== undefined 
        ? claim.truth_profile.deception_score 
        : bias?.deception_score;
        
      if (deceptionScore !== undefined && deceptionScore !== null) {
        const scoreRow = document.createElement("div");
        scoreRow.className = "deception-score-row";
        scoreRow.style.marginTop = "8px";
        
        const scoreLabel = document.createElement("span");
        scoreLabel.textContent = "Deception Risk";
        
        const scoreValue = document.createElement("span");
        const displayScore = deceptionScore > 10 ? `${deceptionScore}%` : `${deceptionScore}/10`;
        scoreValue.textContent = displayScore;
        
        scoreRow.appendChild(scoreLabel);
        scoreRow.appendChild(scoreValue);
        body.appendChild(scoreRow);
      }

      claimCard.appendChild(body);

      // Toggle expanded state on header click and keyboard activation.
      // Give the header button semantics so keyboard users and screen
      // readers can discover and activate it without a mouse.
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("aria-expanded", "false");

      const toggleBody = () => {
        const isCollapsed = body.style.display === "none";
        body.style.display = isCollapsed ? "flex" : "none";
        header.setAttribute("aria-expanded", String(isCollapsed));
      };

      header.addEventListener("click", toggleBody);
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault(); // Prevent Space from scrolling the panel
          toggleBody();
        }
      });

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

function syncPlayback(currentTime) {
  const cards = Array.from(claimsListContainer.querySelectorAll(".claim-card"))
    .filter(c => c.dataset.timestampSeconds !== undefined);
  
  if (cards.length === 0) return;
  
  cards.sort((a, b) => parseFloat(a.dataset.timestampSeconds) - parseFloat(b.dataset.timestampSeconds));
  
  let activeCard = null;
  
  const firstTimestamp = parseFloat(cards[0].dataset.timestampSeconds);
  if (currentTime < firstTimestamp) {
    cards.forEach(c => c.classList.remove("pp-claim-active"));
    return;
  }
  
  for (let i = 0; i < cards.length; i++) {
    const cardTime = parseFloat(cards[i].dataset.timestampSeconds);
    if (cardTime <= currentTime) {
      activeCard = cards[i];
    } else {
      break;
    }
  }
  
  let activeChanged = false;
  cards.forEach(c => {
    if (c === activeCard) {
      if (!c.classList.contains("pp-claim-active")) {
        c.classList.add("pp-claim-active");
        activeChanged = true;
      }
    } else {
      c.classList.remove("pp-claim-active");
    }
  });
  
  if (activeChanged && activeCard && typeof activeCard.scrollIntoView === "function") {
    activeCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function highlightClaims(claimsToHighlight, timestampSeconds) {
  const cards = Array.from(claimsListContainer.querySelectorAll(".claim-card"));
  
  let matchFn;
  if (claimsToHighlight && claimsToHighlight.length > 0) {
    const textsToHighlight = new Set(claimsToHighlight.map(c => c.claim_text));
    matchFn = (c) => {
      const titleText = c.querySelector(".claim-card-title")?.textContent;
      return titleText && textsToHighlight.has(titleText);
    };
  } else if (typeof timestampSeconds === "number") {
    matchFn = (c) => parseFloat(c.dataset.timestampSeconds) === timestampSeconds;
  } else {
    return;
  }
  
  let firstHighlighted = null;
  cards.forEach(c => {
    if (matchFn(c)) {
      c.classList.add("pp-claim-active");
      if (!firstHighlighted) {
        firstHighlighted = c;
      }
    } else {
      c.classList.remove("pp-claim-active");
    }
  });
  
  if (firstHighlighted && typeof firstHighlighted.scrollIntoView === "function") {
    firstHighlighted.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
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
    currentTabId = tab.id;
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
      const progressVal = state.progress !== undefined && state.progress !== null ? state.progress : 0;
      progressBarFill.style.width = `${progressVal}%`;
      progressBarFill.setAttribute("aria-valuenow", progressVal);
      break;
      
    case "complete":
      showState("results");
      // Capture the video ID synchronously so we can detect stale responses.
      const requestedVideoId = currentVideoId;
      chrome.runtime.sendMessage({
        type: "CHECK_CACHE",
        videoId: requestedVideoId
      }).then((response) => {
        // Discard the response if navigation has already changed the active video.
        if (currentVideoId !== requestedVideoId) return;
        if (response && response.success && response.data) {
          renderResults(response.data);
        } else {
          showState("error");
          errorMessage.textContent = "Failed to load analysis results.";
        }
      }).catch(() => {
        if (currentVideoId !== requestedVideoId) return;
        showState("error");
        errorMessage.textContent = "Failed to load analysis results.";
      });
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
      if (message.payload.progress !== undefined && message.payload.progress !== null) {
        progressBarFill.style.width = `${message.payload.progress}%`;
        progressBarFill.setAttribute("aria-valuenow", message.payload.progress);
      }
    }
  } else if (message.type === "YOUTUBE_NAVIGATED") {
    checkCurrentTabState();
  } else if (message.type === "SYNC_PLAYBACK") {
    if (message.tabId === currentTabId && message.videoId === currentVideoId) {
      if (message.generationId !== currentGenerationId) {
        currentGenerationId = message.generationId;
        lastSequence = -1;
      }
      if (message.sequence > lastSequence) {
        lastSequence = message.sequence;
        syncPlayback(message.currentTime);
      }
    }
  } else if (message.type === "HIGHLIGHT_CLAIMS") {
    if (message.tabId === currentTabId) {
      highlightClaims(message.claims, message.timestampSeconds);
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
