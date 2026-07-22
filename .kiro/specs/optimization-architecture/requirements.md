# Requirements Specification: Extension Optimization & MV3 Standards (`optimization-architecture`)

## 1. User Stories

### US-1: Exclusive Native Side Panel UI
**As a** YouTube viewer  
**I want** analysis results to display exclusively in Chrome's native Side Panel without any in-page floating DOM overlays  
**So that** the video player and page layout are completely unblocked and clean.

### US-2: Content-Hashed Local Storage Caching
**As a** user re-visiting a previously analyzed YouTube video  
**I want** the extension to load cached results instantly from `chrome.storage.local` without triggering new backend LLM API calls  
**So that** latency is zero and API quota costs are preserved.

### US-3: Optimistic UI & Zero-Latency Feedback
**As a** user initiating a video analysis for a new video  
**I want** to see an immediate Optimistic UI with animated loading skeletons in the Side Panel  
**So that** I receive instant visual feedback without staring at a blank screen or static spinner.

### US-4: Progressive Stream Updates
**As an** extension user watching a video analysis process  
**I want** claims and perspectives (Scientific, Journalistic, Left, Right) to populate progressively as they complete  
**So that** I can start reading early results immediately without waiting for the full job to finish.

### US-5: Resilient Service Worker Execution
**As an** extension user  
**I want** background message processing to be instant and error-free even after browser inactivity  
**So that** I never experience silent failures or hanging loading states due to Service Worker termination.

### US-6: Seamless YouTube SPA Navigation
**As a** user browsing multiple YouTube videos in a single tab session  
**I want** the side panel to automatically reset and load the active video's analysis  
**So that** analysis state stays strictly in sync with the currently active video.

---

## 2. Functional Requirements (FR)

### FR-1: Legacy DOM Overlay Removal & Non-Breakage
- **FR-1.1**: The extension MUST completely remove all legacy in-DOM overlay element creation (`#pp-analysis-panel`, Shadow DOM overlay mounting in `content.js`, `panel-styles.js` DOM injection).
- **FR-1.2**: All content script helper functions (e.g. `claim-navigator.js`, button click handlers) MUST be decoupled from `#pp-analysis-panel` DOM references so that removing the overlay does NOT throw `NullPointerException` or `TypeError`.
- **FR-1.3**: The YouTube page "Analyze" action button handler MUST dispatch an `OPEN_SIDE_PANEL` message to `background.js` to open `chrome.sidePanel`.

### FR-2: Content-Hashed Local Storage Caching (`chrome.storage.local`)
- **FR-2.1**: The Service Worker MUST act as the sole authoritative manager for `chrome.storage.local` analysis cache.
- **FR-2.2**: Cache entries MUST be stored using key format `cache_${videoId}_${contentHash}` containing completed claims, perspectives, bias/deception ratings, and timestamp.
- **FR-2.3**: Before initiating a FastAPI backend job, the Service Worker MUST query `chrome.storage.local`. On a valid cache hit, it MUST immediately return `{ success: true, cached: true, data }` to the Side Panel.
- **FR-2.4**: Cache entries MUST enforce a 7-day TTL and automatically purge oldest entries when storage exceeds 10MB.

### FR-3: Optimistic UI & Loading Skeleton Rendering
- **FR-3.1**: Upon initiating analysis or navigating to a new un-cached video, `side-panel.js` MUST immediately render an Optimistic UI state containing animated CSS shimmer skeletons for claims and perspective cards.
- **FR-3.2**: The Side Panel MUST maintain zero latency (<50ms) between user click and skeleton UI display.

### FR-4: Progressive Stream Rendering in Chrome Side Panel
- **FR-4.1**: `manifest.json` MUST define `"side_panel": { "default_path": "side-panel.html" }` and the `"sidePanel"` permission.
- **FR-4.2**: `side-panel.js` MUST listen for incremental job progress events from `background.js` and replace perspective skeleton cards with populated claims/stances as each perspective completes.
- **FR-4.3**: Perspective stance chips (Scientific, Journalistic, Partisan Left, Partisan Right) and Deception Ratings MUST animate into place smoothly using CSS transitions as stream chunks arrive.

### FR-5: Lazy Client & Configuration Loading
- **FR-5.1**: The Service Worker (`background.js`) MUST initialize the API client lazily via an async getter (`getClient()`).
- **FR-5.2**: All `chrome.runtime.onMessage` listeners MUST await `getClient()` prior to executing API requests or storage checks.

### FR-6: SPA Navigation Handling
- **FR-6.1**: The content script MUST attach an event listener to YouTube's custom `yt-navigate-finish` event.
- **FR-6.2**: On navigation, the content script MUST broadcast a `VIDEO_NAVIGATED` message containing the new `videoId` to the Service Worker.
- **FR-6.3**: The Side Panel MUST listen for navigation events, checking cache first, and displaying optimistic skeletons if un-cached.

### FR-7: Modern Extension Build Pipeline
- **FR-7.1**: The project MUST provide a Vite build configuration compiling content scripts, background worker, popup, options, and side panel.
- **FR-7.2**: Duplicate standalone script files (`config-script.js`, `logging-utils-script.js`) MUST be refactored into single ES module imports.

---

## 3. Non-Functional Requirements (NFR)

- **NFR-1 (Performance)**: Content script initialization MUST execute in under 30ms on YouTube page load.
- **NFR-2 (Clean DOM)**: Content script MUST NOT insert floating dialog overlays into YouTube's `document.body`.
- **NFR-3 (Cache Retrieval Latency)**: Local storage cache hits MUST render in the Side Panel in under 20ms.
- **NFR-4 (MV3 Security Compliance)**: Manifest CSP MUST forbid `unsafe-eval` and remote code loading. All assets MUST be bundled locally.

---

## 4. Behavior-Driven Development (BDD) Scenarios

```gherkin
Feature: Content-Hashed Local Storage Cache Hit
  Scenario: Re-analyzing a previously processed video
    Given a completed analysis for video "video_XYZ" is cached in chrome.storage.local under "cache_video_XYZ_hash123"
    When the user opens the Side Panel on video "video_XYZ"
    Then the Service Worker detects the local cache entry
    And returns the cached analysis to side-panel.js in under 20ms
    And no HTTP request is sent to the FastAPI backend.

Feature: Optimistic UI Skeleton and Progressive Stream Updates
  Scenario: User initiates analysis for a new video (Cache Miss)
    Given no local cache entry exists for video "video_NEW"
    When the user clicks "Analyze Video"
    Then the Side Panel immediately renders 4 animated shimmer skeleton cards (zero latency)
    And when the backend emits Scientific perspective analysis
    Then the Scientific skeleton card morphs smoothly into a populated claim stance.
```
