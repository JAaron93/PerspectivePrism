# Implementation Tasks: Perspective Prism Chrome Extension UX v3

## Overview
This document outlines the test-driven implementation plan for migrating to the Chrome Side Panel API and integrating timeline markers with playback synchronization.

> [!TIP] PARALLEL EXECUTION
> Track 1 (Side Panel Foundation) and Track 2 (Timeline Rendering) can be executed in parallel, as they touch different parts of the extension (Service Worker vs Content Script DOM injection). Track 3 (Synchronization) depends on both.

## Track 1: Side Panel Foundation
*Migrates the existing popup/injected panel to the native `chrome.sidePanel` API.*

- [ ] **Task 1.1: Manifest Updates**
  - **Dependency:** None
  - **Action:** Update `manifest.json` to include the `"sidePanel"` permission and configure the default side panel HTML page (e.g., `"side_panel": { "default_path": "sidepanel.html" }`).
  - **Traceability:** FR-1

- [ ] **Task 1.2: Side Panel UI Scaffold**
  - **Dependency:** Task 1.1
  - **Action:** Create `sidepanel.html` and `sidepanel.js`. Port the existing React/Vanilla UI rendering logic from `content.js`'s shadow DOM into this new context.
  - **Traceability:** FR-1, US-1

- [ ] **Task 1.3: Toggle Mechanisms**
  - **Dependency:** Task 1.2
  - **Action:** Implement side panel toggling. 
    1. Update `background.js` to open the panel when the extension action (toolbar icon) is clicked via `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
    2. Add a message listener in `background.js` to call `chrome.sidePanel.open()` when requested by the content script's injected YouTube button.
  - **Traceability:** FR-2, FR-3

## Track 2: Timeline Rendering & Clustering
*Handles DOM injection of visual markers on the YouTube progress bar.*

- [ ] **Task 2.1: Timestamp Parsing & Clustering Logic**
  - **Dependency:** None
  - **Action:** Implement a utility to parse `"HH:MM:SS"` to seconds. Implement a clustering function that takes an array of claims and groups them if their timestamps are within `X` seconds (configurable, default 5s).
  - **Traceability:** FR-4, FR-6, BDD (Timeline Visualization)

- [ ] **Task 2.2: Marker DOM Injection**
  - **Dependency:** Task 2.1
  - **Action:** Implement `renderTimelineMarkers()` in `content.js`. Locate `.ytp-progress-list`. Iterate over clustered claims, calculate percentage width based on video duration, and inject absolutely positioned `<div>` elements. Apply color classes based on the cluster's aggregate truth profile severity.
  - **Traceability:** FR-5, NFR-3, US-2

- [ ] **Task 2.3: SPA Navigation Cleanup**
  - **Dependency:** Task 2.2
  - **Action:** Hook into YouTube's `yt-navigate-start` and `yt-navigate-finish` events to clear existing markers and re-fetch/re-render when the user changes videos without a page reload.
  - **Traceability:** FR-11, NFR-2

## Track 3: Playback Synchronization Engine
*Bridges the Side Panel and Content Script for auto-scrolling and click-to-seek.*

- [ ] **Task 3.1: Click-to-Seek & Highlight**
  - **Dependency:** Track 1, Track 2
  - **Action:** Add click event listeners to timeline markers in `content.js`. On click:
    1. Set `document.querySelector('video').currentTime` to the cluster's timestamp.
    2. Dispatch a `chrome.runtime.sendMessage` indicating a cluster was clicked.
    3. Side panel listens for this message, scrolls the corresponding claims into view, and applies a CSS highlight class.
  - **Traceability:** FR-7, FR-8, US-4, BDD (Clicking a timeline marker)

- [ ] **Task 3.2: Throttled Playback Broadcasting**
  - **Dependency:** Track 1
  - **Action:** Add a `timeupdate` event listener to the YouTube `<video>` element in `content.js`. Throttle the callback to max 4 times per second. Broadcast the current time via `chrome.runtime.sendMessage`.
  - **Traceability:** FR-9, NFR-1

- [ ] **Task 3.3: Auto-Scrolling Side Panel**
  - **Dependency:** Task 3.2
  - **Action:** Update `sidepanel.js` to listen for time broadcast messages. Map the current time to the active claim. Automatically scroll the container to keep the active claim in focus.
  - **Traceability:** FR-10, US-3, BDD (Auto-scrolling)
