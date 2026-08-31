# Chrome Extension Invariants & Development Rules

This document defines the implementation guidelines, security invariants, storage rules, and Side Panel architecture for the Manifest V3 browser extension (`chrome-extension/`).

---

## 1. Zero-Build Architecture & Static Type Safety (ADR 004)

* **0ms Latency Development Loop**:
  - The extension runs directly from source. Chrome loads raw JS directly via "Load unpacked", avoiding compilation watcher latency.
  - Plain vanilla JavaScript (ES modules for background/popup/options/sidepanel, and classic scripts for content scripts).
* **Static Semantic Type Checking (`checkJs: true`)**:
  - `chrome-extension/tsconfig.json` MUST configure `"checkJs": true` and `"useUnknownInCatchVariables": false` with `"noEmit": true`.
  - Type checking is executed compile-free via `npm run typecheck` (`tsc --noEmit`).
* **Ambient Typings & Vendor Isolation**:
  - Ambient extension globals, DOM element augmentations (`currentTime`, `duration`, `dataset`), and window methods are declared in `chrome-extension/globals.d.ts`.
  - Third-party vendor bundles in `chrome-extension/vendor/` MUST include `// @ts-nocheck` and be excluded from `tsconfig.json`.
  - DOM element attribute setters MUST cast values to strings (`String(...)`) to satisfy semantic validation.

---

## 2. Security & Storage Invariants

* **BYOK Storage Isolation**:
  - User API keys, credentials, and sensitive settings MUST be stored exclusively in `chrome.storage.local` across both module (`config.js`) and script (`config-script.js`) variants.
  - `chrome.storage.sync` is strictly prohibited for secrets.
* **IPC Origin Verification**:
  - Service worker `background.js` MUST validate `sender.id === chrome.runtime.id` for all `chrome.runtime.onMessage` listeners, returning structured error objects `{ success: false, error: "...", code: "UNAUTHORIZED" }`.
* **Storage Eviction & Reserved Key Protection**:
  - When enumerating `chrome.storage.local` keys starting with `cache_` for TTL eviction or LRU pruning, all operations MUST filter targets using an `isCacheEntry(key, entry)` validator to exclude reserved non-analysis metadata keys (`cache_metrics`, `cache_metadata`, `cache_stats`, `cache_settings`).
* **Content-Hashed Storage Keys**:
  - Analysis cache entries must use key format `cache_${videoId}_${contentHash}`. If a response does not supply `content_hash`, compute a deterministic SHA-256 digest of the payload locally (`computeContentHash(data)`).
* **Storage Key Video ID Parsing**:
  - Extract video IDs from storage keys using `key.replace("cache_", "").split("_")[0]`.
* **Configurable TTL Propagation**:
  - All cache expiration routines (`checkCache`, `isExpired`, `cleanupExpiredCache`, `evictExpiredAndLRU`) MUST load the user-configured `cacheDuration` setting and pass the calculated `ttlMs` to all expiration checks.
* **Non-Cryptographic Fallback Hashing**:
  - Fallback hashing implementations used when `crypto.subtle` is unavailable MUST employ a 64-bit dual-pass algorithm combining DJB2 and SDBM formatted as a 16-character hex string.
* **Storage Migration Write & Cleanup Protection**:
  - Deletion of legacy keys (`chrome.storage.sync.remove(...)`) MUST be strictly guarded behind verified completion of `chrome.storage.local.set` (checking `chrome.runtime.lastError` or using `await`).
* **Strict URL Protocol Allowlisting**:
  - `sanitizeUrl()` and link sanitizers MUST enforce an explicit protocol allowlist (`protocol === "http:" || protocol === "https:"`). Non-allowlisted URLs MUST resolve to `"#"` and render as plain text.

---

## 3. Content Scripts & Load Order

* **Content Script Load Order**:
  - Scripts are injected into YouTube pages in this strict sequence:
    `logging-utils-script.js` → `config-script.js` → `video-utils-script.js` → `consent.js` → `claim-navigator.js` → `timeline-utils-script.js` → `content-markers-script.js` → `content.js`
* **Dual Script/Module Invariant**:
  - Shared utilities MUST maintain two variants when exposed to content scripts: a module version (`*.js`) with `export` statements, and a classic script version (`*-script.js`) without `export` statements.
* **ESLint Globals & Scoped Overrides**:
  - Functions defined in classic scripts (`*-script.js`), shared module classes (`CacheManager`), and Web APIs must be explicitly added to `globals` in `eslint.config.js`.
  - Transitive dependency overrides in `package.json` must always use parent-scoped overrides (e.g. `"minimatch@3": { ... }`).

---

## 4. Native Side Panel UI & Progressive Streaming

* **Zero-Latency Optimistic UI**: On analysis start or cache miss, `sidepanel.js` must immediately render 4 animated CSS shimmer cards (<50ms execution latency).
* **Progressive Stream Chunk Morphing**: As backend progress broadcasts arrive, skeleton cards morph into populated claim stance cards with confidence fill meters and stance chips.
* **Idempotent Skeleton Rendering**: Skeleton loaders (`renderOptimisticSkeletons`) MUST check if the container already has child nodes before clearing contents (`container.innerHTML = ""`). Clearing is restricted to context switches (`videoId`/`tabId` changes) or resets (`idle`/`error`).
* **SPA State Sync**: Content script broadcasts `VIDEO_NAVIGATED` and `YOUTUBE_NAVIGATED` upon `yt-navigate-finish`. Side Panel resets generation state, checks local cache (<20ms hit), or renders skeletons (<50ms miss).
* **State Preservation on Rebind**: When rebinding media playback listeners, do not reset monotonic sequence counters (`playbackSequence`). Compare node instances directly (`video !== activeVideoElement`).
* **Tab Context Isolation**: Reset generation IDs, sequence state, and tab scoping when switching active tabs or when tabs query returns no active tab.
* **UI Overlay Excise & Privacy Isolation**: Excised in-page overlays must not alter independent user dialogs (Privacy & Consent modals managed by `ConsentManager`).
* **Idempotent Service Worker Promise Getters**: Lazy initialization getters (`getClient()`) must return the cached Promise reference (`clientPromise`) directly to preserve promise identity during Service Worker wake-up.
