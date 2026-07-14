# ADR 002: Rigorous Specification for Chrome Side Panel Migration

## Status
Accepted

## Context
The Perspective Prism Chrome Extension is migrating its primary UI to the native Chrome Side Panel API (`chrome.sidePanel`), alongside integrating a timeline marker system within the YouTube video player. 

During the specification phase (UX v3), the design and requirements underwent a highly rigorous review process. Browser extensions—especially those injecting content into complex Single Page Applications (SPAs) like YouTube—are prone to subtle and difficult-to-debug issues. We needed to ensure that the architecture could handle the unique constraints of this environment before any code was written.

The three primary challenges identified were:
1.  **Memory Leaks:** YouTube utilizes SPA navigation (`yt-navigate-start`, `yt-navigate-finish`), meaning the page does not fully reload when a user clicks a new video. If DOM listeners and timeline markers are not meticulously cleaned up, the extension will cause memory leaks and performance degradation over time.
2.  **Race Conditions & Stale State:** Users frequently swap between videos rapidly or open multiple videos in different tabs. Without strict tab-scoping, generation counters, and monotonic sequence ordering, the synchronization engine could easily broadcast a `timeupdate` for Video A to a Side Panel that is currently displaying Video B.
3.  **Caching Integrity:** The system relies entirely on `chrome.storage.local` for persisting analysis results (Backend Statelessness constraint). If the backend schema updates, or if a user encounters a TTL expiry, the extension must gracefully fetch new data without silently failing or displaying garbage data.

## Decision
We decided to encode strict, rigorous architectural constraints directly into the specification documents (`design.md`, `requirements.md`, and `tasks.md`) and mandate a Test-Driven Development (TDD) approach for all subsequent implementation.

Specifically, the specification requires:
- **Tab-Scoped Routing:** All synchronization messages must be identity-bearing, including the active `videoId`, a navigation generation counter, and the originating `tabId` to ensure the Service Worker routes updates only to the correct side panel.
- **Monotonic Playback Sequence:** A monotonic sequence field is required in `timeupdate` broadcasts so that the Side Panel rejects any delayed or out-of-order messages within the same video generation.
- **Authoritative Cache Ownership:** The Service Worker is designated as the sole authoritative owner of `chrome.storage.local` to manage migrations, TTLs, and evictions.
- **Explicit Cache Outcome Handling:** The spec explicitly defines four cache scenarios (supported hits, schema migrations, unsupported-version misses, and TTL expiries) and requires fallback handling (to an in-memory session cache) for quota exceptions or read/write failures.

## Consequences

### Positive
- **Robust Architecture:** By forcing the resolution of complex edge cases during the design phase, the resulting architecture is highly resilient against race conditions and memory leaks.
- **Predictable Implementation:** The TDD tasks are explicitly defined around these edge cases (e.g., mocking delayed messages, identical timestamps in different tabs, or storage write failures), making the execution phase smoother and more predictable.
- **Maintainability:** Clear boundaries (e.g., the Service Worker as the sole cache owner) prevent race conditions where multiple contexts try to read/write to storage simultaneously.

### Negative
- **Upfront Cost:** Front-loading the architectural decisions significantly increased the time and effort required during the specification phase.
- **Testing Overhead:** The implementation phase will require writing complex, stateful mocks for unit tests and comprehensive Playwright E2E tests to satisfy the stringent BDD constraints.
