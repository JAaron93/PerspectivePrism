# Macroscope Run-Agents Context & Review Guide (`run-agents.md`)

This file provides context, architectural constraints, and review criteria for Macroscope review agents, automated runners, and agentic pair programmers working on the **PerspectivePrism** repository.

---

## 1. Project Overview & Active Branch Context

- **Repository**: PerspectivePrism (YouTube claim, bias & deception analyzer)
- **Active Branch**: `audit-browser-extension-standards`
- **Active Specification**: `optimization-architecture`
- **Spec Root Directory**: [.kiro/specs/optimization-architecture/](.kiro/specs/optimization-architecture/)

---

## 2. Active Specification Suite

Review agents MUST validate all pull requests, code modifications, and commits against the authoritative specification files:

1. **[design.md](.kiro/specs/optimization-architecture/design.md)**: Architectural design detailing `chrome.sidePanel` migration, legacy overlay removal, Optimistic UI skeletons, Content-Hashed `chrome.storage.local` caching, Vite bundling, and Service Worker lazy initialization.
2. **[requirements.md](.kiro/specs/optimization-architecture/requirements.md)**: Functional/Non-Functional requirements (FR-1 to FR-7, NFR-1 to NFR-4) and BDD Gherkin acceptance criteria.
3. **[tasks.md](.kiro/specs/optimization-architecture/tasks.md)**: 6-Track task breakdown with explicit dependencies and parallelism.

---

## 3. Major Architectural Guardrails & Guidelines for Review Agents

### A. Legacy In-DOM Overlay Excise (`#pp-analysis-panel`)
- **Rule**: All legacy floating DOM overlay code (`#pp-analysis-panel`, Shadow DOM mounting to `document.body`, `createPanelContainer`, `removePanel`, and overlay z-index manipulation) MUST be removed from [content.js](chrome-extension/content.js).
- **Review Check**: Verify that `content.js` does NOT inject modal overlay dialogs into YouTube's DOM tree.

### B. Exclusive Native Chrome Side Panel (`chrome.sidePanel`)
- **Rule**: Chrome's native `sidePanel` API is the single official UI surface for claim analysis.
- **Review Check**: Ensure `manifest.json` declares `"permissions": ["sidePanel"]` and `"side_panel": { "default_path": "side-panel.html" }`.

### C. Zero Breakdown & Non-Breaking Navigation
- **Rule**: Helper scripts ([claim-navigator.js](chrome-extension/claim-navigator.js)) and YouTube player action buttons MUST NOT depend on panel DOM references (`panel._keydownHandler`, `shadowRoot`).
- **Review Check**: The "Analyze Video" action button MUST dispatch an `OPEN_SIDE_PANEL` message to `background.js` to open/focus `chrome.sidePanel`.

### D. Service Worker Lifetime Resilience
- **Rule**: The background Service Worker (`background.js`) MUST use an async `getClient()` getter pattern to lazily load configuration and API client state, preventing SW wake/sleep race conditions.
- **Review Check**: Confirm no un-awaited top-level `.then()` callbacks interact with incoming `chrome.runtime.onMessage` handlers.

### E. Optimistic UI & Progressive Streaming
- **Rule**: On analysis initiation or video navigation, `side-panel.js` MUST immediately render 4 animated CSS shimmer skeleton cards (<50ms latency) and morph each card into populated claims as FastAPI streams back perspective chunks.
- **Review Check**: Validate zero-latency UI feedback and smooth CSS transitions on stream chunk arrival.

### F. Content-Hashed Local Storage Caching (`chrome.storage.local`)
- **Rule**: Service Worker MUST act as sole authoritative writer for `chrome.storage.local` cache under key `cache_${videoId}_${contentHash}` with 7-day TTL and 10MB LRU storage auto-eviction.
- **Review Check**: Re-analyzing a cached video MUST return results instantly (<20ms) without initiating FastAPI HTTP requests.

### G. Vite Bundling & Utility Consolidation
- **Rule**: Standardize on single ES module utility files (`config.js`, `logging-utils.js`). Eliminate standalone `-script.js` duplicates.

---

## 4. Test Suite Execution & Quality Gates

Macroscope review agents MUST verify that the following test suites pass prior to approving changes:

```bash
# 1. Extension Unit Tests (Vitest)
cd chrome-extension && npm test

# 2. Extension Integration Tests (Playwright Persistent Extension Context)
cd chrome-extension && npm run test:integration

# 3. Backend Unit/Integration Tests (Pytest)
cd backend && pytest
```

> [!NOTE]
> **Playwright Persistent Context Harness**: Integration tests use Playwright's `chromium.launchPersistentContext()` in [fixtures.js](chrome-extension/tests/integration/fixtures.js) to load the unpacked extension, capture background Service Worker instances (`context.serviceWorkers()`), and test `side-panel.html` rendering.

> [!IMPORTANT]
> **Testing vs Debugging Tool Routing Discipline**:
> - **Automated Testing & QA**: Use **Playwright's Persistent Extension Context** (`npm run test:integration`) as the primary harness for all automated integration testing, assertions, and CI quality gates.
> - **Interactive Debugging**: Use **Chrome DevTools MCP** (via `chrome-devtools`, `memory-leak-debugging`, or `a11y-debugging` skills) **ONLY** when actively investigating tricky runtime bugs, memory leaks, detached DOM nodes, or Service Worker sleep state race conditions during development. Do NOT invoke Chrome DevTools MCP for routine test suite execution.

---

## 5. File Mapping Reference

| Component | Primary Files |
| :--- | :--- |
| **Service Worker** | [background.js](chrome-extension/background.js) |
| **Content Script** | [content.js](chrome-extension/content.js), [claim-navigator.js](chrome-extension/claim-navigator.js) |
| **Side Panel UI** | side-panel.html, side-panel.js (planned) |
| **Extension Manifest** | [manifest.json](chrome-extension/manifest.json) |
| **FastAPI Backend** | [main.py](backend/app/main.py), [input_sanitizer.py](backend/app/utils/input_sanitizer.py) |
| **Specification Suite** | [.kiro/specs/optimization-architecture/](.kiro/specs/optimization-architecture/) |
