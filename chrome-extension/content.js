// Content script for Perspective Prism

console.log("Perspective Prism content script loaded");

// State
let currentVideoId = null;
let analysisPanel = null;
let analysisButton = null;
let cancelRequest = false;
let loadingTimer = null;
let previouslyFocusedElement = null; // Track focus before panel opens
let wasPanelOpen = false; // Track if panel was open before navigation

// Constants
const BUTTON_ID = "pp-analysis-button";
const PANEL_ID = "pp-analysis-panel";

// Panel Styles - Comprehensive styles with dark mode support
// Imported from panel-styles.js (loaded via manifest)
const PANEL_STYLES = `
/* ============================================
   Host Container - Fixed Position Panel
   ============================================ */

:host {
    all: initial;
    position: fixed;
    top: 60px;
    right: 20px;
    width: 400px;
    max-width: calc(100vw - 40px);
    max-height: 80vh;
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
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
    color: #0f0f0f;
}

.title-icon { font-size: 18px; }

.badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 8px;
    font-weight: 500;
}

.badge-cached { background: #fef7e0; color: #b06000; }
.badge-fresh { background: #e6f4ea; color: #137333; }

.header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.refresh-btn, .close-btn {
    cursor: pointer;
    border: none;
    background: none;
    padding: 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
    color: #606060;
}

.refresh-btn { font-size: 18px; width: 32px; height: 32px; }
.close-btn { font-size: 24px; width: 32px; height: 32px; line-height: 1; }

.refresh-btn:hover:not(:disabled), .close-btn:hover { background: #e5e5e5; }

.refresh-btn:focus-visible, .close-btn:focus-visible {
    outline: 2px solid #065fd4;
    outline-offset: 2px;
}

.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.refresh-btn.refreshing { animation: spin 1s linear infinite; }

.content {
    padding: 16px;
    overflow-y: auto;
    flex-grow: 1;
    scrollbar-width: thin;
    scrollbar-color: #d1d1d1 transparent;
}

.content::-webkit-scrollbar { width: 8px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: #d1d1d1; border-radius: 4px; }
.content::-webkit-scrollbar-thumb:hover { background: #b1b1b1; }

.claim-card {
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
    background: #ffffff;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.claim-card:last-child { margin-bottom: 0; }
.claim-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); border-color: #d1d1d1; }

.claim-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    cursor: pointer;
    margin-bottom: 12px;
    padding: 4px;
    border-radius: 4px;
    transition: background 0.2s ease;
    gap: 8px;
}

.claim-header:hover { background: #f9f9f9; }
.claim-header:focus { outline: 2px solid #065fd4; outline-offset: 2px; }

.claim-text {
    font-weight: 500;
    font-size: 14px;
    line-height: 1.4;
    flex-grow: 1;
    color: #0f0f0f;
}

.toggle-btn {
    background: none;
    border: none;
    font-size: 14px;
    cursor: pointer;
    padding: 0;
    color: #606060;
    transition: transform 0.3s ease, color 0.2s ease;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.toggle-btn:hover { color: #0f0f0f; }

.claim-details {
    max-height: 2000px;
    opacity: 1;
    overflow: hidden;
    transition: max-height 0.3s ease, opacity 0.3s ease, margin-top 0.3s ease;
    margin-top: 0;
}

.claim-details.collapsed { max-height: 0; opacity: 0; margin-top: -12px; }

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
.assessment-badge.medium { background: #fef7e0; color: #b06000; }
.assessment-badge.low { background: #fce8e6; color: #c5221f; }

.section-title {
    font-size: 12px;
    font-weight: 600;
    color: #606060;
    text-transform: uppercase;
    margin: 12px 0 8px 0;
    letter-spacing: 0.5px;
}

.perspectives-grid { display: grid; gap: 8px; }

.perspective-row {
    display: grid;
    grid-template-columns: 120px 1fr;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
}

.perspective-row:last-child { border-bottom: none; }
.perspective-name { color: #606060; font-weight: 500; }

.confidence-container {
    display: flex;
    align-items: center;
    gap: 8px;
}

.confidence-bar {
    flex-grow: 1;
    height: 6px;
    background: #e5e5e5;
    border-radius: 3px;
    overflow: hidden;
    position: relative;
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
    min-width: 35px;
    font-weight: 500;
}

.bias-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}

.bias-tag {
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    background: #f0f0f0;
    color: #606060;
    font-weight: 500;
}

.deception-score {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    margin-top: 12px;
    padding: 8px;
    background: #fef7e0;
    border-radius: 6px;
}

.deception-label {
    font-weight: 600;
    color: #b06000;
    min-width: 110px;
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
    transition: width 0.3s ease;
}

.score-text {
    font-weight: 600;
    color: #c5221f;
    min-width: 40px;
    text-align: right;
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
    transition: background 0.2s ease;
    color: #0f0f0f;
}

.cancel-btn:hover { background: #d9d9d9; }
.cancel-btn:focus-visible { outline: 2px solid #065fd4; outline-offset: 2px; }
.cancel-btn.visible { display: inline-block; }

.error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 24px;
    text-align: center;
}

.error-icon { font-size: 48px; margin-bottom: 16px; }
.error-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #c5221f; }
.error-message { font-size: 14px; color: #606060; margin-bottom: 20px; line-height: 1.4; }

.actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 18px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
    min-width: 80px;
}

.retry-btn { background: #065fd4; color: #ffffff; }
.retry-btn:hover { background: #0553bf; }
.retry-btn:focus-visible { outline: 2px solid #065fd4; outline-offset: 2px; }

.close-btn-action { background: #f1f1f1; color: #0f0f0f; }
.close-btn-action:hover { background: #d9d9d9; }
.close-btn-action:focus-visible { outline: 2px solid #606060; outline-offset: 2px; }

.empty-state {
    text-align: center;
    color: #606060;
    padding: 40px 20px;
}

.empty-state p { margin: 0; font-size: 14px; line-height: 1.4; }

#pp-refresh-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.95);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10;
    border-radius: 12px;
    animation: fadeIn 0.2s ease-out;
}

.toast {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #c5221f;
    color: #ffffff;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 11;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* DARK MODE */
:host(.dark-mode) { background: #212121; color: #f1f1f1; }
:host(.dark-mode) .header { background: #181818; border-bottom-color: #3f3f3f; }
:host(.dark-mode) .title { color: #f1f1f1; }
:host(.dark-mode) .badge-cached { background: #3d2e00; color: #fdd663; }
:host(.dark-mode) .badge-fresh { background: #0d5224; color: #81c995; }
:host(.dark-mode) .refresh-btn, :host(.dark-mode) .close-btn { color: #aaaaaa; }
:host(.dark-mode) .refresh-btn:hover:not(:disabled), :host(.dark-mode) .close-btn:hover { background: #3f3f3f; }
:host(.dark-mode) .refresh-btn:focus-visible, :host(.dark-mode) .close-btn:focus-visible { outline-color: #aecbfa; }
:host(.dark-mode) .content { scrollbar-color: #4f4f4f transparent; }
:host(.dark-mode) .content::-webkit-scrollbar-thumb { background: #4f4f4f; }
:host(.dark-mode) .content::-webkit-scrollbar-thumb:hover { background: #6f6f6f; }
:host(.dark-mode) .claim-card { background: #181818; border-color: #3f3f3f; }
:host(.dark-mode) .claim-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); border-color: #4f4f4f; }
:host(.dark-mode) .claim-header:hover { background: #272727; }
:host(.dark-mode) .claim-header:focus { outline-color: #aecbfa; }
:host(.dark-mode) .claim-text { color: #f1f1f1; }
:host(.dark-mode) .toggle-btn { color: #aaaaaa; }
:host(.dark-mode) .toggle-btn:hover { color: #f1f1f1; }
:host(.dark-mode) .assessment-badge.high { background: #0d5224; color: #81c995; }
:host(.dark-mode) .assessment-badge.medium { background: #3d2e00; color: #fdd663; }
:host(.dark-mode) .assessment-badge.low { background: #8c1816; color: #f28b82; }
:host(.dark-mode) .section-title { color: #aaaaaa; }
:host(.dark-mode) .perspective-row { border-bottom-color: #3f3f3f; }
:host(.dark-mode) .perspective-name { color: #aaaaaa; }
:host(.dark-mode) .confidence-bar { background: #3f3f3f; }
:host(.dark-mode) .confidence-fill { background: #aecbfa; }
:host(.dark-mode) .confidence-text { color: #aaaaaa; }
:host(.dark-mode) .bias-tag { background: #3f3f3f; color: #aaaaaa; }
:host(.dark-mode) .deception-score { background: #3d2e00; }
:host(.dark-mode) .deception-label { color: #fdd663; }
:host(.dark-mode) .score-bar { background: #3f3f3f; }
:host(.dark-mode) .score-fill { background: #f28b82; }
:host(.dark-mode) .score-text { color: #f28b82; }
:host(.dark-mode) .spinner { border-color: #3f3f3f; border-top-color: #aecbfa; }
:host(.dark-mode) .message { color: #f1f1f1; }
:host(.dark-mode) .submessage { color: #aaaaaa; }
:host(.dark-mode) .cancel-btn { background: #3f3f3f; color: #f1f1f1; }
:host(.dark-mode) .cancel-btn:hover { background: #4f4f4f; }
:host(.dark-mode) .cancel-btn:focus-visible { outline-color: #aecbfa; }
:host(.dark-mode) .error-title { color: #f28b82; }
:host(.dark-mode) .error-message { color: #aaaaaa; }
:host(.dark-mode) .retry-btn { background: #aecbfa; color: #0f0f0f; }
:host(.dark-mode) .retry-btn:hover { background: #8ab4f8; }
:host(.dark-mode) .close-btn-action { background: #3f3f3f; color: #f1f1f1; }
:host(.dark-mode) .close-btn-action:hover { background: #4f4f4f; }
:host(.dark-mode) .empty-state { color: #aaaaaa; }
:host(.dark-mode) #pp-refresh-overlay { background: rgba(33, 33, 33, 0.95); }
:host(.dark-mode) .toast { background: #8c1816; color: #f1f1f1; }

/* RESPONSIVE */
@media (max-width: 480px) {
    :host { width: 100%; max-width: calc(100vw - 20px); right: 10px; top: 50px; }
    .header { padding: 12px; }
    .title { font-size: 14px; }
    .content { padding: 12px; }
    .claim-card { padding: 12px; margin-bottom: 12px; }
    .claim-text { font-size: 13px; }
    .perspective-row { grid-template-columns: 100px 1fr; font-size: 12px; gap: 6px; }
    .section-title { font-size: 11px; }
}

@media (max-width: 360px) {
    :host { max-width: calc(100vw - 10px); right: 5px; }
    .perspective-row { grid-template-columns: 1fr; gap: 4px; }
}

@media (min-width: 1200px) {
    :host { width: 480px; }
}

/* ACCESSIBILITY */
@media (prefers-contrast: high) {
    :host { border: 2px solid currentColor; }
    .claim-card { border-width: 2px; }
    .btn, .refresh-btn, .close-btn { border: 2px solid currentColor; }
}

@media (prefers-reduced-motion: reduce) {
    :host, .claim-details, .confidence-fill, .score-fill, .toggle-btn, .btn, .refresh-btn, .close-btn, .claim-card, #pp-refresh-overlay, .toast {
        animation: none !important;
        transition: none !important;
    }
    .spinner { animation: none !important; border-top-color: #065fd4; opacity: 0.7; }
    :host(.dark-mode) .spinner { border-top-color: #aecbfa; }
}

*:focus-visible { outline: 2px solid #065fd4; outline-offset: 2px; }
:host(.dark-mode) *:focus-visible { outline-color: #aecbfa; }

@media print {
    :host { display: none !important; }
}

/* ============================================
   Setup Notification Styles (Onboarding)
   ============================================ */

.pp-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.pp-panel-header {
    padding: 16px;
    border-bottom: 1px solid #e5e5e5;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f9f9f9;
    border-radius: 12px 12px 0 0;
    flex-shrink: 0;
}

.pp-panel-title {
    font-weight: 600;
    font-size: 16px;
    color: #0f0f0f;
    margin: 0;
}

.pp-close-btn {
    cursor: pointer;
    border: none;
    background: none;
    padding: 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
    color: #606060;
    font-size: 24px;
    width: 32px;
    height: 32px;
    line-height: 1;
}

.pp-close-btn:hover { background: #e5e5e5; }
.pp-close-btn:focus-visible { outline: 2px solid #065fd4; outline-offset: 2px; }

.pp-panel-content {
    padding: 24px;
    overflow-y: auto;
    flex-grow: 1;
}

.pp-setup-message {
    text-align: center;
}

.pp-setup-icon {
    font-size: 64px;
    margin-bottom: 16px;
}

.pp-setup-message h3 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #0f0f0f;
}

.pp-setup-message p {
    font-size: 14px;
    color: #606060;
    margin: 0 0 24px 0;
    line-height: 1.5;
}

.pp-setup-steps {
    background: #f9f9f9;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
    text-align: left;
}

.pp-setup-steps h4 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #0f0f0f;
}

.pp-setup-steps ol {
    margin: 0;
    padding-left: 20px;
    font-size: 13px;
    color: #606060;
    line-height: 1.6;
}

.pp-setup-steps li {
    margin-bottom: 6px;
}

.pp-setup-steps li:last-child {
    margin-bottom: 0;
}

.pp-setup-note {
    background: #fef7e0;
    border-left: 3px solid #b06000;
    padding: 12px;
    border-radius: 4px;
    margin-bottom: 24px;
    font-size: 13px;
    color: #606060;
    line-height: 1.5;
    text-align: left;
}

.pp-setup-note strong {
    color: #b06000;
    font-weight: 600;
}

.pp-setup-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
}

.pp-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.1s ease;
    min-width: 120px;
}

.pp-btn:active {
    transform: scale(0.98);
}

.pp-btn-primary {
    background: #065fd4;
    color: #ffffff;
}

.pp-btn-primary:hover {
    background: #0553bf;
}

.pp-btn-primary:focus-visible {
    outline: 2px solid #065fd4;
    outline-offset: 2px;
}

.pp-btn-secondary {
    background: #f1f1f1;
    color: #0f0f0f;
}

.pp-btn-secondary:hover {
    background: #d9d9d9;
}

.pp-btn-secondary:focus-visible {
    outline: 2px solid #606060;
    outline-offset: 2px;
}

/* Dark mode for setup notification */
:host(.dark-mode) .pp-panel-header {
    background: #181818;
    border-bottom-color: #3f3f3f;
}

:host(.dark-mode) .pp-panel-title {
    color: #f1f1f1;
}

:host(.dark-mode) .pp-close-btn {
    color: #aaaaaa;
}

:host(.dark-mode) .pp-close-btn:hover {
    background: #3f3f3f;
}

:host(.dark-mode) .pp-close-btn:focus-visible {
    outline-color: #aecbfa;
}

:host(.dark-mode) .pp-setup-message h3 {
    color: #f1f1f1;
}

:host(.dark-mode) .pp-setup-message p {
    color: #aaaaaa;
}

:host(.dark-mode) .pp-setup-steps {
    background: #272727;
}

:host(.dark-mode) .pp-setup-steps h4 {
    color: #f1f1f1;
}

:host(.dark-mode) .pp-setup-steps ol {
    color: #aaaaaa;
}

:host(.dark-mode) .pp-setup-note {
    background: #3d2e00;
    border-left-color: #fdd663;
    color: #aaaaaa;
}

:host(.dark-mode) .pp-setup-note strong {
    color: #fdd663;
}

:host(.dark-mode) .pp-btn-primary {
    background: #aecbfa;
    color: #0f0f0f;
}

:host(.dark-mode) .pp-btn-primary:hover {
    background: #8ab4f8;
}

:host(.dark-mode) .pp-btn-secondary {
    background: #3f3f3f;
    color: #f1f1f1;
}

:host(.dark-mode) .pp-btn-secondary:hover {
    background: #4f4f4f;
}
`;



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
    console.debug("[Perspective Prism] Button already exists, skipping injection.");
    return;
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
    container = document.querySelector(selector);
    if (container) {
      usedSelector = selector;
      break;
    }
  }

  if (container) {
    analysisButton = createAnalysisButton();
    // Use requestAnimationFrame for smoother injection
    requestAnimationFrame(() => {
      if (container && document.contains(container)) {
        container.insertBefore(analysisButton, container.firstChild);
        console.log(
          `[Perspective Prism] Button injected using selector: ${usedSelector}`,
        );
      }
    });

    metrics.successes++;
    metrics.bySelector[usedSelector] =
      (metrics.bySelector[usedSelector] || 0) + 1;
    saveMetrics();
  } else {
    // Only log at debug level to avoid console noise
    // console.debug(
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

/**
 * Check if backend URL is configured
 * Part of onboarding flow - ensures user has set up the extension before first use
 * @returns {Promise<boolean>} - True if backend is configured, false otherwise
 */
async function checkBackendConfiguration() {
  try {
    const result = await chrome.storage.sync.get('config');
    const config = result.config;
    
    // Check if config exists and has a valid backend URL
    if (!config || !config.backendUrl) {
      console.log('[Perspective Prism] Backend URL not configured');
      return false;
    }
    
    // Check if backend URL is not the default localhost (indicates user hasn't configured)
    // This is optional - you might want to allow localhost as valid
    // For now, we'll accept any configured URL including localhost
    
    return true;
  } catch (error) {
    console.error('[Perspective Prism] Failed to check backend configuration:', error);
    return false;
  }
}

/**
 * Show setup notification when backend is not configured
 * Guides user to settings page to complete setup
 * Part of onboarding flow
 */
function showSetupNotification() {
  console.log('[Perspective Prism] Showing setup notification');
  
  // Create notification panel with setup instructions
  const panel = createPanelContainer();
  const shadow = panel.attachShadow({ mode: 'open' });
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = PANEL_STYLES;
  shadow.appendChild(style);
  
  // Create content
  const content = document.createElement('div');
  content.className = 'pp-panel';
  content.setAttribute('role', 'dialog');
  content.setAttribute('aria-modal', 'true');
  content.setAttribute('aria-labelledby', 'pp-setup-title');
  
  content.innerHTML = `
    <div class="pp-panel-header">
      <h2 id="pp-setup-title" class="pp-panel-title">Setup Required</h2>
      <button class="pp-close-btn" aria-label="Close setup notification">×</button>
    </div>
    <div class="pp-panel-content">
      <div class="pp-setup-message">
        <div class="pp-setup-icon" aria-hidden="true">⚙️</div>
        <h3>Welcome to Perspective Prism!</h3>
        <p>Before you can analyze videos, you need to configure your backend URL.</p>
        
        <div class="pp-setup-steps">
          <h4>Quick Setup:</h4>
          <ol>
            <li>Click "Open Settings" below</li>
            <li>Enter your Perspective Prism backend URL</li>
            <li>Click "Test Connection" to verify</li>
            <li>Save your settings</li>
            <li>Return here and click "Analyze" again</li>
          </ol>
        </div>
        
        <div class="pp-setup-note">
          <strong>Note:</strong> You'll need a running Perspective Prism backend server. 
          This can be a self-hosted instance or a trusted third-party service.
        </div>
        
        <div class="pp-setup-actions">
          <button class="pp-btn pp-btn-primary" id="pp-open-settings-btn">
            Open Settings
          </button>
          <button class="pp-btn pp-btn-secondary" id="pp-view-welcome-btn">
            View Welcome Guide
          </button>
        </div>
      </div>
    </div>
  `;
  
  shadow.appendChild(content);
  document.body.appendChild(panel);
  
  // Store reference
  analysisPanel = panel;
  wasPanelOpen = true; // Mark panel as open for navigation persistence
  
  // Setup keyboard navigation
  setupKeyboardNavigation(panel, shadow);
  
  // Event handlers
  const closeBtn = shadow.querySelector('.pp-close-btn');
  const openSettingsBtn = shadow.querySelector('#pp-open-settings-btn');
  const viewWelcomeBtn = shadow.querySelector('#pp-view-welcome-btn');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      removePanel();
      setButtonState('idle');
    });
  }
  
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      // Open settings page
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' }).catch(error => {
        console.error('[Perspective Prism] Failed to open settings:', error);
        // Note: openOptionsPage() not available in content scripts
      });
      removePanel();
      setButtonState('idle');
    });
  }
  
  if (viewWelcomeBtn) {
    viewWelcomeBtn.addEventListener('click', () => {
      // Open welcome page
      chrome.runtime.sendMessage({ type: 'OPEN_WELCOME_PAGE' }).catch(error => {
        console.error('[Perspective Prism] Failed to open welcome page:', error);
        // Note: chrome.tabs API not available in content scripts
        // User will need to manually open the welcome page from popup/settings
      });
      removePanel();
      setButtonState('idle');
    });
  }
  
  // Move focus to primary action button
  if (openSettingsBtn) {
    openSettingsBtn.focus();
  }
}

async function handleAnalysisClick() {
  if (!currentVideoId) {
    console.warn("[Perspective Prism] Analysis requested but no Video ID found.");
    return;
  }

  setButtonState("loading");
  showPanelLoading();
  cancelRequest = false;

  // Check if backend is configured (onboarding step)
  try {
    const isConfigured = await checkBackendConfiguration();
    
    if (!isConfigured) {
      setButtonState("idle");
      removePanel();
      showSetupNotification();
      return;
    }
  } catch (error) {
    console.error("[Perspective Prism] Configuration check failed:", error);
    setButtonState("error");
    showPanelError("Failed to check configuration. Please try again.");
    return;
  }

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
      try {
        consentManager.showConsentDialog(async (allowed) => {
          if (allowed) {
            // Retry analysis with consent
            handleAnalysisClick();
          }
        }, consent); // Pass consent object (with reason) to dialog
      } catch (dialogError) {
        console.error('[Perspective Prism] Failed to show consent dialog:', dialogError);
        setButtonState("error");
        showPanelError("Failed to show consent dialog. Please reload the page and try again.");
      }
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
        timeout: 60000, // 60 second timeout for full analysis
        maxAttempts: 2, // Reduce retries since timeout is longer
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

  // Apply dark mode class if YouTube is in dark mode
  const isDarkMode = document.documentElement.hasAttribute('dark') || 
                     document.documentElement.getAttribute('theme') === 'dark';
  
  if (isDarkMode) {
    panel.classList.add('dark-mode');
  }

  // Styles - Import from panel-styles.js
  const style = document.createElement("style");
  style.textContent = PANEL_STYLES;

  // Content Container
  const container = document.createElement("div");

  // Header
  const header = document.createElement("div");
  header.className = "header";

  const cachedBadge = isCached
    ? '<span class="badge badge-cached">Cached</span>'
    : '<span class="badge badge-fresh">Fresh</span>';

  header.innerHTML = `
        <div class="title" id="pp-panel-title">
            <span class="title-icon">🔍</span> Perspective Prism${cachedBadge}
        </div>
        <div class="header-actions">
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

            // Add confidence bar with percentage if available
            if (typeof val.confidence === "number") {
              const confidenceContainer = document.createElement("div");
              confidenceContainer.className = "confidence-container";
              
              const confidenceBar = document.createElement("div");
              confidenceBar.className = "confidence-bar";
              confidenceBar.setAttribute("role", "progressbar");
              confidenceBar.setAttribute(
                "aria-valuenow",
                Math.round(val.confidence * 100),
              );
              confidenceBar.setAttribute("aria-valuemin", "0");
              confidenceBar.setAttribute("aria-valuemax", "100");
              confidenceBar.setAttribute("aria-label", `Confidence: ${Math.round(val.confidence * 100)}%`);

              const barFill = document.createElement("div");
              barFill.className = "confidence-fill";
              barFill.style.width = `${val.confidence * 100}%`;
              confidenceBar.appendChild(barFill);

              const percentText = document.createElement("span");
              percentText.className = "confidence-text";
              percentText.textContent = `${Math.round(val.confidence * 100)}%`;

              confidenceContainer.appendChild(confidenceBar);
              confidenceContainer.appendChild(percentText);

              row.appendChild(nameSpan);
              row.appendChild(confidenceContainer);
            } else {
              row.appendChild(nameSpan);
            }

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
          label.className = "deception-label";
          label.textContent = "Deception Risk:";

          const scoreBar = document.createElement("div");
          scoreBar.className = "score-bar";
          scoreBar.setAttribute("role", "progressbar");
          scoreBar.setAttribute("aria-valuenow", bias.deception_score);
          scoreBar.setAttribute("aria-valuemin", "0");
          scoreBar.setAttribute("aria-valuemax", "10");
          scoreBar.setAttribute("aria-label", `Deception risk: ${bias.deception_score} out of 10`);

          const scoreFill = document.createElement("div");
          scoreFill.className = "score-fill";
          scoreFill.style.width = `${bias.deception_score * 10}%`;
          scoreBar.appendChild(scoreFill);

          const scoreText = document.createElement("span");
          scoreText.className = "score-text";
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
        <div class="empty-state">
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
  wasPanelOpen = true; // Mark panel as open for navigation persistence

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

  // Apply dark mode class if YouTube is in dark mode
  const isDarkMode = document.documentElement.hasAttribute('dark') || 
                     document.documentElement.getAttribute('theme') === 'dark';
  
  if (isDarkMode) {
    panel.classList.add('dark-mode');
  }

  const style = document.createElement("style");
  style.textContent = PANEL_STYLES;

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
  wasPanelOpen = true; // Mark panel as open for navigation persistence

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
  cancelBtn.onclick = async () => {
    cancelRequest = true;
    clearLoadingTimer();
    
    // Send cancel message to background
    if (currentVideoId) {
      try {
        await sendMessageWithRetry({
          type: 'CANCEL_ANALYSIS',
          videoId: currentVideoId
        }, {
          timeout: 2000,
          maxAttempts: 2
        });
        console.log('[Perspective Prism] Analysis cancelled');
      } catch (error) {
        console.error('[Perspective Prism] Failed to send cancel message:', error);
      }
    }
    
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

  // Apply dark mode class if YouTube is in dark mode
  const isDarkMode = document.documentElement.hasAttribute('dark') || 
                     document.documentElement.getAttribute('theme') === 'dark';
  
  if (isDarkMode) {
    panel.classList.add('dark-mode');
  }

  const style = document.createElement("style");
  style.textContent = PANEL_STYLES;

  // Create container with static HTML (no user data)
  const container = document.createElement("div");
  container.innerHTML = `
        <div class="error-container">
            <div class="error-icon">⚠️</div>
            <div class="error-title" id="pp-panel-error-title">Analysis Failed</div>
            <div class="actions">
                <button class="btn retry-btn" id="pp-retry-btn">Retry</button>
                <button class="btn close-btn-action" id="pp-close-btn">Close</button>
            </div>
        </div>
    `;

  // Safely insert error message using textContent (XSS-safe)
  const messageEl = document.createElement("div");
  messageEl.className = "error-message";
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
  wasPanelOpen = true; // Mark panel as open for navigation persistence

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
    wasPanelOpen = false; // Reset panel state tracking

    // Return focus to previously focused element (Analysis Button)
    if (
      previouslyFocusedElement &&
      document.contains(previouslyFocusedElement)
    ) {
      const elementToFocus = previouslyFocusedElement;
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        if (elementToFocus && document.contains(elementToFocus)) {
          elementToFocus.focus();
        }
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

  // Always observe document body to catch all re-renders and navigation events
  // This is more robust than observing specific containers which might be replaced
  console.log("[Perspective Prism] Setting up global observer");
  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
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
    
    // 3. Track panel state before cleanup
    wasPanelOpen = analysisPanel !== null;
    
    // 4. Close and clean panel UI (but remember it was open)
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
      // Note: Don't reset wasPanelOpen here - we need it for re-opening
    }

    // 5. Remove button (will be re-injected if needed)
    if (analysisButton) {
      analysisButton.remove();
      analysisButton = null;
    }
    const existingBtn = document.getElementById(BUTTON_ID);
    if (existingBtn) existingBtn.remove();

    // 6. Reset state
    currentVideoId = null;
    
    console.log("[Perspective Prism] Cleanup complete. Panel was open:", wasPanelOpen);
  } catch (error) {
    console.error("[Perspective Prism] Error during cleanup:", error);
  } finally {
    isCleaningUp = false;
  }
}

function handleNavigation() {
  // If we are currently cleaning up, skip (or queue?)
  if (isCleaningUp) {
    console.debug("[Perspective Prism] Navigation skipped due to cleanup in progress.");
    return;
  }

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
        // Verify we're still on the same video
        if (extractVideoId() !== currentVideoId) return;
        injectButton();
        setupObservers();
        
        // If panel was open before navigation, automatically analyze the new video
        if (wasPanelOpen) {
          console.log("[Perspective Prism] Panel was open, auto-analyzing new video...");
          // Trigger analysis for the new video
          handleAnalysisClick();
        }
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

/**
 * Handle progress updates from background service worker
 * Updates the loading panel with progress information
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYSIS_PROGRESS') {
    const { videoId, payload } = message;
    
    // Only handle progress for current video
    if (videoId !== currentVideoId) {
      return;
    }
    
    // Only update if panel is in loading state
    if (!analysisPanel) {
      return;
    }
    
    const shadow = analysisPanel.shadowRoot;
    if (!shadow) {
      return;
    }
    
    const submessageEl = shadow.getElementById('pp-loading-submessage');
    if (!submessageEl) {
      return;
    }
    
    // Update message based on elapsed time
    if (payload.elapsedMs >= 10000 && payload.message) {
      submessageEl.textContent = payload.message;
    }
    
    // Log progress for debugging
    console.log(`[Perspective Prism] Progress update for ${videoId}:`, payload);
  }
  
  // Don't send response (not needed for progress updates)
  return false;
});

/**
 * Handle state updates from background service worker
 * Syncs button state and panel content
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYSIS_STATE_CHANGED') {
    const { videoId, state } = message;

    // Only update if it matches current video
    if (videoId !== currentVideoId) return;

    // Update button state
    if (state.status === 'in_progress') {
      setButtonState('loading');
      // If panel is open, ensure it shows loading (unless it's already there)
      if (analysisPanel && !analysisPanel.shadowRoot.getElementById('pp-panel-loading-title')) {
         showPanelLoading();
      }
    } else if (state.status === 'complete') {
      setButtonState('success');
      // If we have active panel, show results? 
      // Maybe not automatically override if user is looking at something else, 
      // but if we are in loading state, we should transition to results.
      // For now, let's rely on the response from the request if we initiated it.
      // But if Popup initiated it, we might want to synchronize.
    } else if (state.status === 'error') {
      setButtonState('error');
    } else {
      setButtonState('idle');
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

  // 3. Polling Fallback (1 second)
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
        }
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
