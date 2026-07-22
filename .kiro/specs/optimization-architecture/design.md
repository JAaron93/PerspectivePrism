# Design Specification: Extension Optimization & MV3 Standards Architecture (`optimization-architecture`)

## 1. Overview & Architectural Goals

The **Perspective Prism** Chrome Extension analyzes YouTube transcripts for claims, bias, and deception via a Python FastAPI backend. The goal of this specification is to modernize the extension architecture to adhere strictly to Manifest V3 standards, migrate exclusively to Chrome's native Side Panel API (`chrome.sidePanel`), safely remove legacy in-DOM panel overlays, implement **Content-Hashed Local Storage Caching** via `chrome.storage.local`, support **Optimistic UI & Progressive Streaming**, eliminate build redundancy through Vite bundling, and establish service worker resilience.

### Key Architectural Objectives
1. **Legacy In-DOM Overlay Removal**: Safely deprecate and excise all legacy in-DOM Shadow DOM panel injection logic (`#pp-analysis-panel`, `createPanelContainer`, `panel-styles.js` DOM injection) from `content.js`, ensuring all UI rendering is handled strictly by `chrome.sidePanel`.
2. **Native Chrome Side Panel (`chrome.sidePanel`)**: Standardize on `chrome.sidePanel` as the sole primary UI surface for claim timeline, perspective analysis, and bias/deception scores.
3. **Content-Hashed Local Storage Caching (`chrome.storage.local`)**:
   - Store completed video analysis in `chrome.storage.local` keyed by `cache_${videoId}_${contentHash}`.
   - Service Worker verifies local cache before dispatching requests to FastAPI. On cache hit, return cached results instantly to the Side Panel, avoiding API costs and latency.
   - Automatic 7-day TTL expiration and 10MB LRU storage pruning.
4. **Optimistic UI & Progressive Streaming**: 
   - **Optimistic UI & Loading Skeletons**: On video load or "Analyze" button click, immediately render animated skeleton loader cards in the Side Panel before backend requests complete.
   - **Progressive Stream Rendering**: As FastAPI returns incremental job updates per perspective (Scientific, Journalistic, Left, Right), replace corresponding skeleton cards in real-time with populated claim stances.
5. **Non-Breaking Navigation & Button Wiring**: Retain YouTube DOM integration points (such as the "Analyze Video" button injected near YouTube player action controls), updating button handlers to open/focus the native `chrome.sidePanel` via background messaging instead of rendering in-page overlays.
6. **Service Worker Lifetime Resilience**: Eliminate startup race conditions in `background.js` by introducing a lazy initialization pattern (`getClient()`) for backend API clients and configuration loading.
7. **Build Modernization (Vite / ESBuild)**: Transition from vanilla script injections to a lightweight Vite bundler, consolidating duplicate script variants (`config.js` vs `config-script.js`) into single ES modules.
8. **SPA Navigation & Tab-Scoped Synchronization**: Handle YouTube's Single Page Application (SPA) routing (`yt-navigate-finish`) with monotonic sequence ordering and tab-scoped state cleanup.

---

## 2. Component Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                          YouTube Watch Page                            │
│  ┌────────────────────────┐         ┌───────────────────────────────┐  │
│  │    Content Script      │         │    Native Side Panel UI       │  │
│  │ (YouTube DOM button,   │◄───────►│  (Optimistic Skeletons,       │  │
│  │  yt-navigate-finish,   │ Message │   Progressive Stream Cards,   │  │
│  │  claim timestamps)     │ Channel │   Bias Deception Ratings)     │  │
│  └───────────┬────────────┘         └───────────────▲───────────────┘  │
└──────────────┼──────────────────────────────────────┼──────────────────┘
               │ Tab-scoped Message                   │ Real-time / Cache Render
               ▼                                      │
┌─────────────────────────────────────────────────────┴──────────────────┐
│                    Background Service Worker                           │
│  ┌────────────────────────┐         ┌───────────────────────────────┐  │
│  │   Lazy Client Init     │         │   Content-Hashed Cache        │  │
│  │   (getClient() cache)  │         │   (chrome.storage.local)      │  │
│  └───────────┬────────────┘         └───────────────▲───────────────┘  │
│              │                                      │ Cache Read/Write │
│              ▼                                      ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │           FastAPI Backend Client (PerspectivePrismClient)        │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
└──────────────────────────────┼─────────────────────────────────────────┘
                               │ HTTPS / JSON Incremental Stream (on Cache Miss)
                               ▼
               ┌───────────────────────────────┐
               │    FastAPI Python Backend     │
               │   (Jobs, Claims, Perspectives)│
               └───────────────────────────────┘
```

### 2.1 Service Worker (`background.js`) & Storage Manager
- **Lazy Initialization Pattern**: Replaces top-level `.then()` execution with an `async getClient()` getter that guarantees configuration resolution before handling any `chrome.runtime.onMessage` event.
- **Authoritative Storage Owner**: Service Worker acts as sole authoritative writer for `chrome.storage.local` cache. Checks `cache_${videoId}_${hash}` prior to initiating FastAPI jobs.
- **State Persistence**: Uses `chrome.storage.session` via `StateManager` to retain analysis job IDs and active video states across Service Worker sleep/wake cycles.
- **Side Panel Triggering**: Responds to `OPEN_SIDE_PANEL` messages from the content script button by calling `chrome.sidePanel.open({ windowId })`.

### 2.2 Side Panel Interface (`side-panel.html` / `side-panel.js`)
- Uses Chrome's `chrome.sidePanel` API configured in `manifest.json`.
- **Optimistic UI Engine**: Instantly displays animated CSS shimmer skeletons for pending claims when an analysis starts.
- **Progressive Stream Component**: Subscribes to incremental job status updates from `background.js` and swaps out skeleton loaders per perspective card as claims complete.
- **Instant Cache View**: When Service Worker reports a cache hit, populates all claims and perspective cards instantly without showing loading states.

### 2.3 Legacy Overlay Cleanup in Content Script (`content.js`)
- **Removed Code**: All functions creating `#pp-analysis-panel`, attaching Shadow DOM overlays to `document.body`, or managing overlay z-index / CSS traps.
- **Retained Code**: Video ID extraction, YouTube action button insertion, video timestamp jumping, and `yt-navigate-finish` SPA event listeners.

---

## 3. Technology Stack & Dependencies

| Layer | Technology / Tools |
| :--- | :--- |
| **Extension Manifest** | Manifest V3 (MV3) |
| **Primary UI Surface** | `chrome.sidePanel` (Native Chrome Side Panel API) |
| **Caching Engine** | Content-Hashed Caching in `chrome.storage.local` (7-day TTL, LRU pruning) |
| **UI UX Patterns** | Optimistic UI, Animated Shimmer Skeletons, Micro-animations |
| **Runtime Environments** | Chrome Extension Service Worker, Content Script, Side Panel |
| **Build System** | Vite 6 + `@crxjs/vite-plugin` (or custom Rollup config) |
| **Storage API** | `chrome.storage.session` (ephemeral state), `chrome.storage.local` (persistent cache) |
| **Testing** | Vitest (Unit/Integration), Playwright (Extension E2E) |
| **Backend Interface** | FastAPI (Async Job Incremental Polling Pipeline) |

---

## 4. Security & Compliance Requirements

1. **Strict Content Security Policy (CSP)**: No `eval()`, `new Function()`, or inline `<script>` tags in extension pages.
2. **Host Permissions**: Scope host permissions to `https://*.youtube.com/*`, `https://youtu.be/*`, and backend domain.
3. **Store Disclosure**: Maintain `CHROMEWEBSTORE.md` documenting permission justifications for `storage`, `sidePanel`, `alarms`, and `notifications`.
