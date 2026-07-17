# Implementation Tasks: Perspective Prism Chrome Extension UX v3

## Overview
This document outlines the test-driven implementation plan for migrating to the Chrome Side Panel API and integrating timeline markers with playback synchronization. 

> [!IMPORTANT]
> **Strict TDD Sequence Enforced**: As per global rules, all feature creation must be preceded by an AI-generated failing unit test or reproduction command. 

> [!TIP] PARALLEL EXECUTION
> Track 1 (Side Panel Foundation) and Track 2 (Timeline Rendering) can be executed in parallel, as they touch different parts of the extension (Service Worker vs Content Script DOM injection). Track 3 (Synchronization) depends on both.

## Track 1: Side Panel Foundation
*Migrates the existing popup/injected panel to the native `chrome.sidePanel` API.*

- [x] **Task 1.1: Test Suite Setup for Side Panel**
  - **Dependency:** None
  - **Evidence:** Created unit tests in `chrome-extension/tests/unit/sidepanel.test.js` mocking the `chrome.sidePanel` API to verify state changes, toggle commands, and UI rendering. Mock implementation is defined in `tests/setup.js`.
  - **Traceability:** TDD Constraint

- [x] **Task 1.2: Manifest Updates**
  - **Dependency:** Task 1.1
  - **Evidence:** Updated `manifest.json` to include the `"sidePanel"` permission and configure the default side panel HTML page (`"side_panel": { "default_path": "sidepanel.html" }`).
  - **Traceability:** FR-1

- [x] **Task 1.3: Side Panel UI Scaffold**
  - **Dependency:** Task 1.2
  - **Evidence:** Ported core UI rendering logic into `sidepanel.html` and `sidepanel.js` from the original content script shadows. Verified correct idle, loading, error, and results state rendering via unit tests in `sidepanel.test.js`.
  - **Traceability:** FR-1, US-1

- [x] **Task 1.4: Toggle Mechanisms & Integration Testing**
  - **Dependency:** Task 1.3
  - **Evidence:** Implemented background service worker toggle logic in `background.js` and verified opening mechanics on extension action click or page button click via Playwright tests in `tests/integration/side-panel.spec.js`.
  - **Traceability:** FR-2, FR-3

- [x] **Task 1.5: Verify Browser-First Caching Constraints (TDD)**
  - **Dependency:** None (Can run parallel to 1.1)
  - **Evidence:** Configured `background.js` as the sole cache owner and verified delegation behavior, expiration rules, TTL, schema migrations, and local storage read/write fallback paths via unit tests in `tests/unit/background-cache.test.js` and `tests/unit/client-cache.test.js`.
  - **Traceability:** FR-12, NFR-4


## Track 2: Timeline Rendering & Clustering
*Handles DOM injection of visual markers on the YouTube progress bar.*

- [x] **Task 2.1: Timestamp Parsing & Clustering Logic (TDD)**
  - **Dependency:** None
  - **Evidence:** Implemented parsing and clustering utilities in `chrome-extension/timeline-utils.js` and verified clamping/boundary conditions, negative timestamps, shuffled inputs, and transitive grouping via unit tests in `tests/unit/timeline-utils.test.js`.
  - **Traceability:** FR-4, FR-6, BDD (Timeline Visualization)

- [x] **Task 2.2: Marker DOM Injection (TDD)**
  - **Dependency:** Task 2.1
  - **Evidence:** Implemented progress bar injection in `renderTimelineMarkers()` and verified marker element layout percentages and styling colors via jsdom unit tests in `tests/unit/timeline-markers.test.js`.
  - **Traceability:** FR-5, NFR-3, US-2

- [x] **Task 2.3: SPA Navigation Cleanup & E2E Testing**
  - **Dependency:** Task 2.2
  - **Evidence:** Hooked into YouTube `yt-navigate-start` and `yt-navigate-finish` events for automatic teardown/reset of timeline markers and side-panel state, verified with Playwright integration tests in `tests/integration/navigation-cleanup.spec.js` and `tests/integration/rapid-navigation.spec.js`.
  - **Traceability:** FR-11, NFR-2

## Track 3: Playback Synchronization Engine
*Bridges the Side Panel and Content Script for auto-scrolling and click-to-seek.*

- [x] **Task 3.1: Synchronization Logic Tests**
  - **Dependency:** Track 1, Track 2
  - **Evidence:** Implemented tab and video isolation logic to prevent cross-context leakage. Verified isolation, message sequencing, sequence preservation, and state resets under unit tests in `tests/unit/sync.test.js`.
  - **Traceability:** TDD Constraint

- [x] **Task 3.2: Click-to-Seek & Highlight**
  - **Dependency:** Task 3.1
  - **Evidence:** Linked timeline markers to media seeking and coordinated side-panel scrolls and class highlights. Verified E2E flow in `tests/integration/sync.spec.js`.
  - **Traceability:** FR-7, FR-8, US-4, BDD (Clicking a timeline marker)

- [x] **Task 3.3: Throttled Playback Broadcasting & Auto-Scrolling**
  - **Dependency:** Task 3.2
  - **Evidence:** Implemented throttled `timeupdate` broadcaster in `content.js` (max 4/sec) and matching highlight update boundaries in `sidepanel.js`. Verified highlight behaviors before, during, and after claims under unit tests in `tests/unit/sync.test.js` and integration tests in `tests/integration/sync.spec.js`.
  - **Traceability:** FR-9, NFR-1, FR-10, US-3, BDD (Auto-scrolling)

- [x] **Task 3.4: E2E BDD Verification & Full-Page Reload Rehydration**
  - **Dependency:** Task 3.3
  - **Evidence:** Executed full Playwright E2E test runs verifying auto-scrolling, marker clicks, seeking, and full-page reload/rehydration flows in `tests/integration/sync.spec.js`.
  - **Traceability:** BDD Constraints
