# Task Execution Plan: Extension Optimization & MV3 Standards (`optimization-architecture`)

## Glossary & Traceability Matrix

| Task ID | Component / Track | Target Requirements | Execution Mode |
| :--- | :--- | :--- | :--- |
| **TASK-1.x** | Track 1: Legacy DOM Overlay Excise & Non-Breakage Audit | FR-1, NFR-2, US-1 | Linear First Step |
| **TASK-2.x** | Track 2: Service Worker Resilience & Side Panel Triggering | FR-4.1, FR-5, US-5 | Linear |
| **TASK-3.x** | Track 3: Native Side Panel, Optimistic UI & Progressive Streaming | FR-3, FR-4, FR-6, US-1, US-3, US-4 | Parallel Track A |
| **TASK-4.x** | Track 4: Content-Hashed Local Storage Caching (`chrome.storage.local`) | FR-2, NFR-3, US-2 | Parallel Track B |
| **TASK-5.x** | Track 5: Build System Modernization (Vite Setup) | FR-7, NFR-4 | Parallel Track C |
| **TASK-6.x** | Track 6: Store Publishing & E2E Verification | NFR-4, US-1..US-6 | Final Integration |

---

## Track 1: Legacy DOM Overlay Excise & Non-Breakage Audit (Sequential First Step)

### TASK-1.1: Audit & Safely Remove In-DOM Overlay Code from `content.js`
- **Description**: Remove `#pp-analysis-panel` creation, Shadow DOM overlay insertion into `document.body`, `createPanelContainer()`, `removePanel()`, and overlay z-index manipulation from `content.js`.
- **Traceability**: Covers FR-1.1, NFR-2, US-1.
- **Dependencies**: None.
- **Acceptance Criteria**: `content.js` does NOT create or append `#pp-analysis-panel` to `document.body`. No floating panel overlays render on YouTube pages.

### TASK-1.2: Decouple Navigation & Keyboard Helpers (`claim-navigator.js`)
- **Description**: Refactor `claim-navigator.js` and button injection logic in `content.js` so they operate on timestamps/YouTube player events directly or communicate with `side-panel.js` via messaging without relying on panel DOM references (`panel._keydownHandler`, `shadowRoot`).
- **Traceability**: Covers FR-1.2, US-1.
- **Dependencies**: TASK-1.1.
- **Acceptance Criteria**: Clicking injected YouTube page action buttons or pressing claim navigation hotkeys executes cleanly without throwing `TypeError: Cannot read properties of null` in content script logs.

---

## Track 2: Service Worker Resilience & Side Panel Triggering

### TASK-2.1: Implement Lazy `getClient()` Getter in `background.js`
- **Description**: Refactor top-level `configManager.load().then(...)` in `background.js` into an idempotent async getter `getClient()`. Ensure all `onMessage` async handlers invoke `await getClient()` first.
- **Traceability**: Covers FR-5.1, FR-5.2, US-5.
- **Dependencies**: TASK-1.2.
- **Acceptance Criteria**: Vitest suite passes; SW wakeup processes concurrent messages cleanly without initialization race conditions.

### TASK-2.2: Implement `OPEN_SIDE_PANEL` Message Handler in Service Worker
- **Description**: Add `OPEN_SIDE_PANEL` message handler in `background.js` calling `chrome.sidePanel.open({ windowId: sender.tab.windowId })` when triggered by YouTube page buttons or action clicks.
- **Traceability**: Covers FR-1.3, FR-4.1, US-1.
- **Dependencies**: TASK-2.1.
- **Acceptance Criteria**: Clicking the injected YouTube action button opens and focuses Chrome's native side panel.

---

> [!TIP] PARALLEL EXECUTION
> Track 3 (Side Panel & Streaming), Track 4 (Content-Hashed Caching), and Track 5 (Vite Setup) can be executed concurrently after Track 2 is complete.

## Track 3: Native Side Panel UI, Optimistic UI & Progressive Streaming

### TASK-3.1: Manifest V3 Side Panel Configuration & HTML View
- **Description**: Update `manifest.json` with `"permissions": ["sidePanel"]` and `"side_panel": { "default_path": "sidepanel.html" }`. Create `sidepanel.html` and `sidepanel.js`.
- **Traceability**: Covers FR-4.1, US-1.
- **Dependencies**: TASK-2.2.
- **Acceptance Criteria**: `side-panel.html` mounts in Chrome's native side panel container.

### TASK-3.2: Implement Optimistic UI Shimmer Skeletons in Side Panel
- **Description**: Implement CSS shimmer animation rules and JavaScript skeleton generator in `side-panel.js` to immediately display 4 placeholder skeleton cards (Scientific, Journalistic, Left, Right) with zero latency (<50ms) upon analysis start on a cache miss.
- **Traceability**: Covers FR-3.1, FR-3.2, US-3.
- **Dependencies**: TASK-3.1.
- **Acceptance Criteria**: Triggering analysis on an un-cached video renders 4 animated shimmer cards in the Side Panel instantly before any backend response arrives.

### TASK-3.3: Implement Progressive Stream Rendering Listener
- **Description**: Wire `side-panel.js` to listen for incremental `JOB_PROGRESS` broadcasts from `background.js`. As each perspective analysis completes, morph the corresponding skeleton card into a populated claim card with perspective stance chips and confidence scores.
- **Traceability**: Covers FR-4.2, FR-4.3, US-4.
- **Dependencies**: TASK-3.2.
- **Acceptance Criteria**: As FastAPI emits perspective chunks, skeleton cards morph smoothly into populated claims.

### TASK-3.4: Implement SPA Navigation State Synchronization (`yt-navigate-finish`)
- **Description**: Wire `content.js` listener for YouTube `yt-navigate-finish` events to broadcast `VIDEO_NAVIGATED` to `background.js` and `side-panel.js`, checking cache first and displaying skeletons if un-cached.
- **Traceability**: Covers FR-6.1, FR-6.2, FR-6.3, US-6.
- **Dependencies**: TASK-3.3.
- **Acceptance Criteria**: Navigating to a new video automatically resets the side panel, checks cache, and renders cached results or optimistic skeletons.

---

## Track 4: Content-Hashed Local Storage Caching (`chrome.storage.local`)

### TASK-4.1: Authoritative SW Content-Hashed Cache Manager
- **Description**: Implement `CacheManager` in `background.js` using key schema `cache_${videoId}_${contentHash}` in `chrome.storage.local`. Intercept analysis requests to return cached results instantly on cache hits.
- **Traceability**: Covers FR-2.1, FR-2.2, FR-2.3, NFR-3, US-2.
- **Dependencies**: TASK-2.1.
- **Acceptance Criteria**: Re-analyzing a cached video returns complete results in <20ms without invoking FastAPI API endpoints.

### TASK-4.2: Implement 7-Day TTL & LRU Storage Eviction Policy
- **Description**: Add 7-day TTL check and 10MB LRU storage pruning logic in `background.js` prior to storing new cache entries.
- **Traceability**: Covers FR-2.4, US-2.
- **Dependencies**: TASK-4.1.
- **Acceptance Criteria**: Cache entries older than 7 days or exceeding 10MB overall storage auto-evict cleanly.

---

## Track 5: Build System Modernization (Vite Setup)

### TASK-5.1: Configure Vite Extension Bundler
- **Description**: Create `chrome-extension/vite.config.js` for entrypoints (`background.js`, `content.js`, `popup.js`, `options.js`, `side-panel.js`).
- **Traceability**: Covers FR-7.1.
- **Dependencies**: None.
- **Acceptance Criteria**: `npm run build` generates clean minified bundles in `dist/`.

### TASK-5.2: Remove Standalone Duplicate Utility Files
- **Description**: Remove `config-script.js` and `logging-utils-script.js`, standardizing on single ES module imports.
- **Traceability**: Covers FR-7.2.
- **Dependencies**: TASK-5.1.
- **Acceptance Criteria**: Single source of truth for utility modules across all extension scripts.

---

## Track 6: Store Publishing & E2E Verification

### TASK-6.1: Draft Store Listing & Permissions (`CHROMEWEBSTORE.md`)
- **Description**: Create `CHROMEWEBSTORE.md` with explicit permission justifications for `storage`, `sidePanel`, `alarms`, `notifications`.
- **Traceability**: Covers NFR-4.
- **Dependencies**: TASK-3.4, TASK-4.2.

### TASK-6.2: Full Test Suite Verification (Vitest & Playwright)
- **Description**: Run unit test suite (`npm test`) and Playwright E2E suite (`npm run test:integration`).
- **Traceability**: Covers all functional requirements.
- **Dependencies**: All prior tasks.
- **Acceptance Criteria**: 100% test pass rate with zero regression errors or overlay DOM leaks.
