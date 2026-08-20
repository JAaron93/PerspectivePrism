# ADR 003: Selective TypeScript 7 Migration & Extension Zero-Build Preservation

## Status
Accepted

## Context
TypeScript 7.0 was released on July 8, 2026, delivering a major architectural overhaul by rewriting the TypeScript compiler (`tsc`) into a native Go binary. This port brings 8x to 12x faster compilation speeds and native multithreaded type-checking.

The Perspective Prism project contains three distinct runtime tiers:
1. **Backend**: Python 3.10+ (FastAPI with Google ADK 2.0 and a compiled PyO3 Rust sanitizer).
2. **Frontend**: React 19 + TypeScript + Vite Single Page Application.
3. **Chrome Extension**: Manifest V3 browser extension for YouTube watch pages.

We evaluated migrating all remaining JavaScript in the repository—specifically within [`chrome-extension/`](../../chrome-extension/)—to TypeScript 7.0 to eliminate compilation latency and provide end-to-end static typing.

## Decision
We have decided to adopt a **selective, hybrid TypeScript strategy**:

1. **Upgrade [`frontend/`](../../frontend/) to TypeScript 7.0**:
   * Leverage the native Go compiler for sub-second build times (`tsc -b && vite build`) and instant IDE feedback.
   * Employ Microsoft's `@typescript/typescript6` compatibility package to bridge downstream AST consumers (such as `typescript-eslint`) until TypeScript 7.1 releases the stabilized programmatic compiler API.

2. **Preserve Vanilla JavaScript and Zero-Build Architecture in [`chrome-extension/`](../../chrome-extension/)**:
   * Keep the extension runtime 100% vanilla JavaScript (ES modules for service worker/popup/options, and classic injection scripts for YouTube DOM manipulation).
   * Do **not** introduce a compilation watcher, bundler, or build pipeline into the daily development loop.
   * Enforce static type checking and IDE autocompletion using a non-emitting `tsconfig.json` with `"checkJs": true`, `"noEmit": true`, and `@types/chrome`, along with JSDoc type annotations referencing shared TypeScript definitions from the frontend.

## Rationale & Invariants

### 1. Developer Latency Invariant (0ms vs. >0ms)
The Chrome extension currently has **0ms build latency** in development. Developers load the unpacked extension directly from source (`chrome://extensions`) and reload YouTube or extension contexts instantly. Introducing TypeScript—even with TS 7.0's sub-second Go engine—would introduce a compilation step, file watcher overhead, and potential stale-state synchronization where none existed.

### 2. Manifest V3 Content Script Execution Model
In Chrome Manifest V3, content scripts injected via `manifest.json` execute in YouTube's isolated world as classic scripts in a strict deterministic order:
```
logging-utils-script.js ➔ config-script.js ➔ video-utils-script.js ➔ consent.js ➔ claim-navigator.js ➔ timeline-utils-script.js ➔ content-markers-script.js ➔ content.js
```
The extension maintains paired variants (e.g., `config.js` as an ES module for `background.js`, and `config-script.js` for classic DOM injection). Compiling TypeScript into multiple isolated and classic script targets would require complex multi-entry bundling configurations and ambient global declarations (`declare global { interface Window { ... } }`) without providing true runtime isolation benefits.

### 3. Integration Testing & Tooling Stability
Playwright integration tests launch Chrome with persistent extension contexts pointing directly to the unpacked source directory. Converting the extension to TypeScript would require redirecting Playwright and manual QA workflows to a compiled `dist/` directory, introducing failure modes from stale build outputs.

## Consequences

### Positive
* **Frontend Performance**: Sub-second type-checking and build verification in CI and local frontend development.
* **Preserved Extension Agility**: Zero build steps, instant browser refresh cycles, and clean debugging directly on YouTube's live DOM.
* **Zero-Build Type Safety**: JSDoc and `checkJs: true` provide autocompletion and schema validation against backend API models without modifying the extension's runtime architecture.
* **Test Harness Integrity**: Playwright and Vitest test suites continue to execute against raw source files without compilation indirection.

### Negative
* **Two Typing Paradigms**: The frontend uses native `.tsx`/`.ts` syntax, while the extension uses JSDoc type comments (`/** @type {...} */`) for type annotations.
* **ESLint Bridge Requirement**: Frontend requires `@typescript/typescript6` as a dev dependency to allow `typescript-eslint` to parse ASTs under TypeScript 7.0 until TS 7.1.
