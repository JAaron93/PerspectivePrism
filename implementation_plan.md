# Implementation Plan - Background Service Worker Core Functionality

## Goal Description
Implement the core functionality of the background service worker for the Perspective Prism Chrome Extension. This includes creating the `PerspectivePrismClient` class to handle API requests to the backend, implementing robust retry logic with exponential backoff, handling MV3 service worker lifecycle events (persistence and recovery of in-flight requests), and adding progress tracking.

## User Review Required
> [!IMPORTANT]
> This implementation relies on `chrome.storage.local` for persisting request state and `chrome.alarms` for retry scheduling to ensure operations survive service worker termination, which is a critical requirement for Manifest V3.

## Proposed Changes

### Chrome Extension

#### [NEW] [client.js](file:///Users/pretermodernist/PerspectivePrismMVP/chrome-extension/client.js)
- Create `PerspectivePrismClient` class.
- Implement `analyzeVideo(videoId)` method with validation.
- Implement `executeAnalysisRequest(videoId, videoUrl)` with retry logic.
- Implement `makeAnalysisRequest(videoUrl)` with timeout (120s) and `AbortController`.
- Implement `recoverPersistedRequests()` to load pending requests from `chrome.storage.local` on startup.
- Implement `setupAlarmListener()` to handle retry alarms.
- Implement `persistRequestState()` and `cleanupPersistedRequest()`.
- Add request deduplication using `pendingRequests` Map.

#### [MODIFY] [background.js](file:///Users/pretermodernist/PerspectivePrismMVP/chrome-extension/background.js)
- Import `client.js`.
- Initialize `PerspectivePrismClient`.
- Set up message listeners to handle `ANALYZE_VIDEO` requests from content scripts.
- Integrate `PerspectivePrismClient` with the message handling logic.

## Verification Plan

### Automated Tests
- Since this is a Chrome Extension, standard unit tests are tricky without a mock environment. I will rely on manual verification and potentially adding a test HTML page if needed, but the primary verification will be manual.
- I will create a `test-background.js` (or similar) if possible to run in a browser context, but for now, I will use the existing `test-config.html` pattern if applicable, or just manual testing via the extension.

### Manual Verification
1.  **Load Extension**: Load the unpacked extension in Chrome.
2.  **Trigger Analysis**:
    - Open a YouTube video.
    - Click the "Analyze" button (if implemented) or manually trigger the message via DevTools console in the background page.
    - `chrome.runtime.sendMessage({ type: 'ANALYZE_VIDEO', videoId: '...' })`
3.  **Verify Persistence**:
    - Trigger an analysis.
    - Immediately terminate the service worker (via `chrome://serviceworker-internals/` or DevTools "Stop" button).
    - Verify that the request resumes (or at least the state is preserved and retry alarm is set) when the service worker restarts (or alarm fires).
4.  **Verify Retry Logic**:
    - Simulate a network failure (offline mode).
    - Trigger analysis.
    - Verify retries happen with exponential backoff.
5.  **Verify Deduplication**:
    - Trigger analysis for the same video ID twice rapidly.
    - Verify only one network request is made.