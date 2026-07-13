# Implementation Tasks: Perspective Prism Chrome Extension UX v3

## Overview
This document outlines the test-driven implementation plan for migrating to the Chrome Side Panel API and integrating timeline markers with playback synchronization. 

> [!IMPORTANT]
> **Strict TDD Sequence Enforced**: As per global rules, all feature creation must be preceded by an AI-generated failing unit test or reproduction command. 

> [!TIP] PARALLEL EXECUTION
> Track 1 (Side Panel Foundation) and Track 2 (Timeline Rendering) can be executed in parallel, as they touch different parts of the extension (Service Worker vs Content Script DOM injection). Track 3 (Synchronization) depends on both.

## Track 1: Side Panel Foundation
*Migrates the existing popup/injected panel to the native `chrome.sidePanel` API.*

- [ ] **Task 1.1: Test Suite Setup for Side Panel**
  - **Dependency:** None
  - **Action:** Write failing unit tests in `chrome-extension/tests/` that mock the `chrome.sidePanel` API to verify state changes, toggle commands, and UI rendering functions.
  - **Traceability:** TDD Constraint

- [ ] **Task 1.2: Manifest Updates**
  - **Dependency:** Task 1.1
  - **Action:** Update `manifest.json` to include the `"sidePanel"` permission and configure the default side panel HTML page (e.g., `"side_panel": { "default_path": "sidepanel.html" }`).
  - **Traceability:** FR-1

- [ ] **Task 1.3: Side Panel UI Scaffold**
  - **Dependency:** Task 1.2
  - **Action:** Create `sidepanel.html` and `sidepanel.js`. Port the existing React/Vanilla UI rendering logic from `content.js`'s shadow DOM into this new context. Verify tests pass.
  - **Traceability:** FR-1, US-1

- [ ] **Task 1.4: Toggle Mechanisms & Integration Testing**
  - **Dependency:** Task 1.3
  - **Action:** Implement side panel toggling via background service worker. Write a Playwright integration test that simulates an extension action click and verifies the side panel opens. Write a separate Playwright integration test that locates and clicks the content-script-injected YouTube toggle button and verifies the side panel opens.
  - **Traceability:** FR-2, FR-3

- [ ] **Task 1.5: Verify Browser-First Caching Constraints (TDD)**
  - **Dependency:** None (Can run parallel to 1.1)
  - **Action:** Designate `background.js` as the sole cache owner. Write tests proving the side panel delegates all storage logic to the Service Worker via messages. Write unit tests covering `background.js` cache outcomes: fresh cache hits must return without network requests; cache misses or stale entries (defined by an embedded `schemaVersion` mismatch) must fetch from the network and update `chrome.storage.local`. Add coverage for `chrome.storage.local` read and write failures, verifying the required fallback continues analysis without breaking the flow.
  - **Traceability:** FR-12, NFR-4


## Track 2: Timeline Rendering & Clustering
*Handles DOM injection of visual markers on the YouTube progress bar.*

- [ ] **Task 2.1: Timestamp Parsing & Clustering Logic (TDD)**
  - **Dependency:** None
  - **Action:** Write failing unit tests for `parseTimestampToSeconds` and timeline marker positioning. Expand tests to cover unknown or zero video duration, negative timestamps, and timestamps beyond the video duration, asserting resulting marker percentages remain finite and clamped within the valid range. Add shuffled-input coverage to verify order-independent clustering (claims must be sorted first) and correct cluster starts. Preserve the existing exact 5-second boundary and chained claims testing for transitive grouping. Then implement the utilities until tests pass.
  - **Traceability:** FR-4, FR-6, BDD (Timeline Visualization)

- [ ] **Task 2.2: Marker DOM Injection (TDD)**
  - **Dependency:** Task 2.1
  - **Action:** Write failing unit tests using `jsdom` to mock the YouTube `.ytp-progress-list` DOM. Implement `renderTimelineMarkers()` to inject absolute `<div>` markers with correct percentage widths and color classes.
  - **Traceability:** FR-5, NFR-3, US-2

- [ ] **Task 2.3: SPA Navigation Cleanup & E2E Testing**
  - **Dependency:** Task 2.2
  - **Action:** Hook into YouTube's `yt-navigate-start` and `yt-navigate-finish` events. Write a Playwright integration test simulating repeated YouTube SPA navigations to ensure listener cleanup: after multiple navigations, assert that a single navigation event produces exactly one request/render cycle, while preserving the existing marker removal and side-panel state reset checks (claims, highlights, and active video identity).
  - **Traceability:** FR-11, NFR-2

## Track 3: Playback Synchronization Engine
*Bridges the Side Panel and Content Script for auto-scrolling and click-to-seek.*

- [ ] **Task 3.1: Synchronization Logic Tests**
  - **Dependency:** Track 1, Track 2
  - **Action:** Write unit tests for message passing between the mocked Content Script and Side Panel. Mock `timeupdate` events to verify that the throttling logic correctly filters broadcast rate. Add tests covering delayed messages from a previous video and identical timestamps across different videos to ensure identity-bearing isolation.
  - **Traceability:** TDD Constraint

- [ ] **Task 3.2: Click-to-Seek & Highlight**
  - **Dependency:** Task 3.1
  - **Action:** Add click event listeners to timeline markers to seek the `<video>` and dispatch a message. The side panel listens, applies CSS highlight, and scrolls to the claim.
  - **Traceability:** FR-7, FR-8, US-4, BDD (Clicking a timeline marker)

- [ ] **Task 3.3: Throttled Playback Broadcasting & Auto-Scrolling**
  - **Dependency:** Task 3.2
  - **Action:** Add throttled `timeupdate` listeners (max 4/sec). Side panel maps time to claims based on the active-claim boundary rule. Add tests covering behavior for playback times before the first claim (asserting highlights are cleared), between claims (including throttled gaps), and after the final claim (asserting the final claim retains its highlight).
  - **Traceability:** FR-9, NFR-1, FR-10, US-3, BDD (Auto-scrolling)

- [ ] **Task 3.4: E2E BDD Verification & Full-Page Reload Rehydration**
  - **Dependency:** Task 3.3
  - **Action:** Execute a full Playwright E2E suite covering the BDD scenarios defined in `requirements.md` (Timeline Visualization, Auto-scrolling, Clicking markers). Add full-page reload rehydration coverage: reload YouTube and the side panel, then assert that the active video and cached analysis are restored seamlessly, while stale state is discarded.
  - **Traceability:** BDD Constraints
