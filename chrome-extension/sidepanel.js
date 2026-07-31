// sidepanel.js - Perspective Prism Side Panel
import { logger } from "./logging-utils.js";
import { extractVideoIdFromUrl } from "./video-utils.js";
import { parseTimestampToSeconds } from "./timeline-utils.js";
import DOMPurify from "./vendor/dompurify.js";

/**
 * Sanitize text / HTML content using DOMPurify
 * @param {string} input - Input text to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeText(input) {
  if (typeof input !== "string") return input;
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "span", "p", "br", "code"],
    ALLOWED_ATTR: ["class", "title", "data-*"],
  });
}

/**
 * Sanitize URLs to prevent javascript: and data: URI attacks
 * @param {string} url - Target URL
 * @returns {string} Sanitized URL or '#' if dangerous protocol
 */
function sanitizeUrl(url) {
  if (typeof url !== "string") return "#";
  const trimmed = url.trim();
  if (!trimmed || /^(?:javascript|data|vbscript):/i.test(trimmed)) {
    if (trimmed && /^(?:javascript|data|vbscript):/i.test(trimmed)) {
      logger.warn("Blocked unsafe URI protocol:", trimmed);
    }
    return "#";
  }
  return DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

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
const skeletonContainer = document.getElementById("skeleton-container");

const errorTitle = document.getElementById("error-title");
const errorMessage = document.getElementById("error-message");
const retryBtn = document.getElementById("pp-retry-btn");

const overallAssessmentBadge = document.getElementById("overall-assessment-badge");
const analysisMetadata = document.getElementById("analysis-metadata");
const claimsListContainer = document.getElementById("claims-list-container");
const optionsBtn = document.getElementById("pp-options-btn");

const SKELETON_PERSPECTIVES = [
  { name: "Scientific", class: "stance-scientific" },
  { name: "Journalistic", class: "stance-journalistic" },
  { name: "Partisan Left", class: "stance-left" },
  { name: "Partisan Right", class: "stance-right" }
];

/**
 * Render optimistic UI shimmer skeletons for 4 core perspectives (FR-3.1, FR-3.2, US-3)
 * Renders instantly (<50ms execution latency) upon analysis start on a cache miss.
 * @param {boolean} force - Force re-rendering even if cards already exist.
 */
function renderOptimisticSkeletons(force = false) {
  const container = document.getElementById("skeleton-container") || skeletonContainer;
  if (!container) return;

  // Preserve existing cards if container is already populated and force is false
  if (!force && container.children.length > 0) {
    container.style.display = "flex";
    return;
  }

  container.innerHTML = "";
  container.style.display = "flex";

  SKELETON_PERSPECTIVES.forEach((persp) => {
    const card = document.createElement("div");
    card.className = "skeleton-card fade-in";
    card.dataset.perspective = persp.name;

    const header = document.createElement("div");
    header.className = "skeleton-header";

    const titleLine = document.createElement("div");
    titleLine.className = "skeleton-line title skeleton-shimmer";

    const timestampLine = document.createElement("div");
    timestampLine.className = "skeleton-line timestamp skeleton-shimmer";

    header.appendChild(titleLine);
    header.appendChild(timestampLine);
    card.appendChild(header);

    const chip = document.createElement("div");
    chip.className = `stance-chip ${persp.class}`;
    chip.textContent = persp.name;
    card.appendChild(chip);

    const descLine = document.createElement("div");
    descLine.className = "skeleton-line short skeleton-shimmer";
    card.appendChild(descLine);

    const grid = document.createElement("div");
    grid.className = "skeleton-perspective-grid";
    for (let i = 0; i < 2; i++) {
      const box = document.createElement("div");
      box.className = "skeleton-perspective-box skeleton-shimmer";
      grid.appendChild(box);
    }
    card.appendChild(grid);

    container.appendChild(card);
  });
}

// Show specific state in UI
function showState(stateName) {
  if (stateIdle) stateIdle.style.display = stateName === "idle" ? "flex" : "none";
  if (stateLoading) stateLoading.style.display = stateName === "loading" ? "flex" : "none";
  if (stateError) stateError.style.display = stateName === "error" ? "flex" : "none";
  if (stateResults) stateResults.style.display = stateName === "results" ? "flex" : "none";
}

if (typeof window !== "undefined") {
  window.showState = showState;
  window.renderOptimisticSkeletons = renderOptimisticSkeletons;
  window.checkCurrentTabState = checkCurrentTabState;
}

// Render analysis results
function renderResults(data) {
  if (!data) return;

  // Render overall assessment
  const assessment = sanitizeText(data.overall_assessment || "Unverified");
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
    analysisMetadata.textContent = sanitizeText(`Analyzed on: ${dateStr}`);
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
      title.textContent = sanitizeText(claim.claim_text);
      
      header.appendChild(title);
      
      if (claim.timestamp) {
        const timestamp = document.createElement("span");
        timestamp.className = "claim-timestamp";
        timestamp.textContent = sanitizeText(claim.timestamp);
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
      const rawAssess = claim.truth_profile?.overall_assessment || "Unverified";
      const assessmentVal = sanitizeText(rawAssess);
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
          pLabel.textContent = sanitizeText(key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
          
          const pVal = document.createElement("span");
          const confidencePercent = typeof val.confidence === "number" 
            ? Math.round(val.confidence <= 1 ? val.confidence * 100 : val.confidence)
            : null;
          pVal.textContent = confidencePercent !== null ? `${confidencePercent}%` : "";
          
          pInfo.appendChild(pLabel);
          pInfo.appendChild(pVal);
          pItem.appendChild(pInfo);

          // Render research / evidence sources safely
          const sources = val.sources || val.evidence;
          if (Array.isArray(sources) && sources.length > 0) {
            const sourcesList = document.createElement("div");
            sourcesList.className = "perspective-sources";
            sourcesList.style.fontSize = "11px";
            sourcesList.style.marginTop = "4px";

            sources.forEach((src) => {
              if (!src) return;
              const url = typeof src === "string" ? src : (src.url || src.link || "");
              const titleText = typeof src === "string" ? src : (src.title || src.name || url);
              const safeUrl = sanitizeUrl(url);

              if (!safeUrl || safeUrl === "#" || safeUrl === "") {
                const textEl = document.createElement("span");
                textEl.className = "perspective-source-text";
                textEl.textContent = sanitizeText(titleText);
                sourcesList.appendChild(textEl);
              } else {
                const linkEl = document.createElement("a");
                linkEl.href = safeUrl;
                linkEl.target = "_blank";
                linkEl.rel = "noopener noreferrer";
                linkEl.textContent = sanitizeText(titleText);
                sourcesList.appendChild(linkEl);
              }
            });
            pItem.appendChild(sourcesList);
          }
          
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
          tag.textContent = sanitizeText(tagText);
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
        scoreValue.textContent = sanitizeText(displayScore);
        
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
    let tabId = null;
    let videoId = null;

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      tabId = tabs[0].id;
      videoId = extractVideoIdFromUrl(tabs[0].url || "");
    }

    if (!videoId && typeof window !== "undefined" && window.location) {
      videoId = extractVideoIdFromUrl(window.location.href || "");
    }
    
    if (tabId !== currentTabId || videoId !== currentVideoId) {
      currentGenerationId = null;
      lastSequence = -1;
      const container = document.getElementById("skeleton-container") || skeletonContainer;
      if (container) {
        container.innerHTML = "";
      }
    }
    
    currentTabId = tabId || currentTabId;

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
      renderOptimisticSkeletons();
      loadingSubmessage.textContent = state.submessage || "Analyzing video...";
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

/**
 * Handle progressive stream chunk rendering (FR-4.2, FR-4.3, US-4)
 * Morphs skeleton cards into populated claim/stance cards as stream chunks arrive.
 */
function handleProgressiveStreamChunk(payload) {
  if (!payload) return;
  const container = document.getElementById("skeleton-container") || skeletonContainer;
  if (!container) return;

  const perspectiveName = payload.perspective || payload.perspective_name;
  if (perspectiveName) {
    const skeletonCard = container.querySelector(`[data-perspective="${perspectiveName}"]`);
    if (skeletonCard) {
      skeletonCard.classList.add("card-morph-enter");
      setTimeout(() => {
        skeletonCard.innerHTML = "";
        skeletonCard.className = "skeleton-card card-morph-active";

        const chipClass = perspectiveName.toLowerCase().includes("scientific") ? "stance-scientific"
          : perspectiveName.toLowerCase().includes("journalistic") ? "stance-journalistic"
          : perspectiveName.toLowerCase().includes("left") ? "stance-left"
          : "stance-right";

        const chip = document.createElement("div");
        chip.className = `stance-chip ${chipClass}`;
        chip.textContent = `${perspectiveName} - Complete`;
        skeletonCard.appendChild(chip);

        if (payload.claims && payload.claims.length > 0) {
          payload.claims.forEach((claimText) => {
            const claimLine = document.createElement("div");
            claimLine.className = "state-description fade-in";
            claimLine.style.fontWeight = "500";
            claimLine.textContent = typeof claimText === "string" ? claimText : (claimText.claim_text || "Claim analyzed");
            skeletonCard.appendChild(claimLine);
          });
        } else {
          const detail = document.createElement("div");
          detail.className = "state-description fade-in";
          detail.textContent = "Perspective analysis complete";
          skeletonCard.appendChild(detail);
        }
      }, 150);
    }
  }
}

// Listen to message broadcasts from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYSIS_STATE_CHANGED") {
    if (message.videoId === currentVideoId) {
      handleAnalysisState(message.state);
    }
  } else if (message.type === "ANALYSIS_PROGRESS" || message.type === "JOB_PROGRESS") {
    if (message.videoId === currentVideoId) {
      const payload = message.payload || message.data || {};
      loadingSubmessage.textContent = payload.message || "Analyzing...";
      if (payload.progress !== undefined && payload.progress !== null) {
        progressBarFill.style.width = `${payload.progress}%`;
        progressBarFill.setAttribute("aria-valuenow", payload.progress);
      }
      if (payload.perspective || payload.claims || payload.chunk) {
        handleProgressiveStreamChunk(payload);
      }
    }
  } else if (message.type === "VIDEO_NAVIGATED" || message.type === "YOUTUBE_NAVIGATED") {
    if (message.videoId && message.videoId !== currentVideoId) {
      currentVideoId = message.videoId;
      currentGenerationId = null;
      lastSequence = -1;
    }
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

export { sanitizeText, sanitizeUrl, renderResults };
