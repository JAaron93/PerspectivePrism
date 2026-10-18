# Frontend Invariants & Development Rules

This document defines the implementation guidelines, compiler architecture, and coding conventions for the React Single Page Application (`frontend/`).

---

## 1. Tooling & Compiler Architecture (ADR 004)

* **TypeScript 7.0 Native Engine & Vite 8**:
  - The build system (`npm run build`) uses TypeScript 7.0 for sub-second Go-native compilation (`tsc -b && vite build` < 1.0s) paired with Vite 8 for Rolldown-accelerated bundling.
  - Delivers native multithreaded type checking and instant build feedback.
* **ESLint Bridge (`@typescript/typescript6`)**:
  - Because TypeScript 7.0 does not yet ship with a stable programmatic compiler API (targeted for TS 7.1), `package.json` installs Microsoft's `@typescript/typescript6` compatibility package to provide the AST parser for `typescript-eslint`.
  - `tsc` is linked to the native TS 7.0 binary (`typescript-7: npm:typescript@^7.0.2`).
  - Do NOT remove or flag `@typescript/typescript6` as redundant.

---

## 2. Coding Conventions

* **Functional Components & Hooks**:
  - Use functional components with hooks only; no class components.
* **Strict TypeScript Typing**:
  - TypeScript interfaces for all API response and component prop types.
  - Strictly avoid `any`.
* **CSS & Layout**:
  - Plain, responsive custom CSS without external utility libraries (no Tailwind, CSS-in-JS, or Bootstrap).
* **Environment Variables**:
  - All frontend environment variables MUST be prefixed with `VITE_`.
* **Error Handling & State**:
  - Handle asynchronous states with try/catch, clear loading indicators, and user-friendly error banners.

---

## 3. Common Development Commands

* `npm run dev`: Starts local Vite dev server on port 5173.
* `npm run build`: Sub-second production compilation (`tsc -b && vite build`).
* `npm run lint`: Runs ESLint across TypeScript and TSX source files.
* `npm test`: Runs fast component unit tests via `node --test` and esbuild.
* `npm run preview`: Previews the production build bundle locally.

---

## 4. Pre-Classification & Epistemic Lens SPA Invariants

* **Unconditional State Reset on Submission**:
  - On every new analysis submission (`handleSubmit` / `startAnalysis`), the frontend MUST immediately reset all previous results (`setResults(null)`), active errors (`setError(null)`), and streaming states. Stale video IDs or disclaimers must never leak into subsequent analysis runs.
* **Force-Override Target Pinning (CRITICAL)**:
  - When rendering the `#pp-force-analyze-btn` ("⚡ Analyze Anyway") on an ineligible disclaimer, the override handler MUST pin its target to the immutable `analyzedUrl` that generated the disclaimer, NOT the mutable input field state (`url`). This prevents a user who edited the input field from accidentally bypassing pre-classification on a completely different video.
* **Epistemic Lens Component Guardrails**:
  - Must visually classify truth frameworks across the 6 canonical theories (`Correspondence`, `Coherence`, `Pragmatic`, `Perspectivism`, `Consensus`, `Deflationary`) using distinct CSS color tokens.
  - Epistemic summaries must remain strictly descriptive with no normative judgments or bias accusations.
  - Transcript quote drawers must use accessible collapsible controls (`aria-expanded`, `aria-controls`).

---

## 5. Testing Architecture & TypeScript Isolation

* **Fast Node Native Unit Testing**:
  - React component markup and contract tests run via `node --test` bundled with `esbuild` and rendered via `react-dom/server` (`renderToStaticMarkup`) for sub-second feedback (<300ms) without heavy test framework overhead.
* **Browser vs. Node Compiler Scope Separation**:
  - `tsconfig.app.json` is reserved exclusively for browser client types (`"types": ["vite/client"]`).
  - Unit test files containing Node imports (`node:test`, `node:assert/strict`) MUST be explicitly excluded in `tsconfig.app.json` via `"exclude": ["src/**/__tests__/*"]` to ensure `npm run build` (`tsc -b && vite build`) compiles with zero Node type leakage.
* **React Testability Pattern for Vite SPA Components (`onInit` + `onErrorChange` hooks)**:
  When a component contains Vite-specific globals (`import.meta.env`) or async polling (`setTimeout`/`fetch`) whose state changes are invisible from static `renderToStaticMarkup` snapshots, add testability hooks to its `Props` interface rather than wiring stubs around it:
  1. **`import.meta.env` Node safety**: Access Vite env vars with optional chaining (`import.meta.env?.VITE_API_URL`) to avoid `Cannot read properties of undefined` crashes in Node `--test` runners.
  2. **`onInit` action hook**: Export an `onInit?: (actions: { startAnalysis: ... }) => void` prop. During `renderToStaticMarkup(...)`, the component invokes `onInit` synchronously, exposing the fully-configured action function to the test. The test then `await appActions.startAnalysis(url)` to drive the full submit+polling path.
  3. **`onErrorChange` state hook**: Export an `onErrorChange?: (error: string | null) => void` prop. The component calls this alongside `setError(...)`. Tests capture the error value from this callback — no DOM querying required.
  4. **`initialError` / `initialShowKeyInput` / `initialResults` props**: Accept initial state props so tests can render `<App initialError={capturedError} />` and assert rendered error guidance (alerts, action links) independently of the polling flow that produced the error.
  5. **`await checkStatus()`**: Make the initial polling call awaitable (`await checkStatus()` inside the submit handler) so errors propagate synchronously when tests `await startAnalysis()`, rather than being swallowed in a fire-and-forget `setTimeout` chain.
  - **Anti-pattern (reject in code review)**: Tests that construct their own fetch calls instead of calling through the component's action functions (`startAnalysis`) bypass the actual submit/header-forwarding/error-routing logic. Such tests pass even if the real forwarding is removed — Greptile will flag this as "tests bypass the actual page".
  - **Extracted helpers**: Internal logic branches (e.g. `getJobErrorMessage(statusData)` for error-code routing) should be exported as named functions so they are independently unit-testable without requiring a full component render.

---

## 6. Gherkin BDD Acceptance Testing (`playwright-bdd` — Adopted Standard)

> [!NOTE]
> **Decision (2026-10-17, following the backend pytest-bdd expansion, PR #112)**: User-facing Gherkin acceptance scenarios for the React SPA use **`playwright-bdd`** on the Playwright runner. This section codifies the decision, its tradeoffs, and what future agents need to execute these scenarios. The harness may not be installed yet — when implementing, follow this section verbatim.

* **Decision & Rationale**:
  - Mirrors the acceptance-level BDD precedent established by `pytest-bdd` in `backend/tests/bdd/` (`.feature`-first workflow, declarative business-language scenarios, `test(bdd):` conventional commits).
  - Reuses the repository's proven Playwright harness knowledge (pinned Chromium provisioning, host-resolver test backends, `xvfb-run`/`headless: false` Linux CI rules from `testing_and_hygiene.md`) — one browser-automation stack across the Chrome extension and the SPA.
  - Delivers real-browser fidelity with auto-waiting, tracing, and screenshots. `cucumber-js` + jsdom was evaluated and rejected: lighter, but lower fidelity and a more DIY ecosystem.
* **Dependency Set**: `frontend/` devDependencies require `playwright-bdd` and `@playwright/test`; provision the browser with `npx playwright install chromium` (first run and after version bumps). Do NOT introduce `cucumber-js`, `vitest-cucumber`, or any jsdom Gherkin runner.
* **File Layout (mirrors backend)**:
  - Feature files: `frontend/tests/features/<domain>/*.feature`.
  - Step definitions: `frontend/tests/steps/<domain>.ts` using `createBdd()` from `playwright-bdd`; custom shared fixtures extend `test as base` imported from `playwright-bdd` (NOT `@playwright/test`).
  - Wiring: `defineBddConfig({ features: 'tests/features/**/*.feature', steps: 'tests/steps/**/*.ts' })` in `frontend/playwright.config.ts`; the returned `testDir` feeds Playwright's `defineConfig`.
* **Step Async Semantics**: `playwright-bdd` step functions are `async` and receive Playwright fixtures (`{ page }`, custom fixtures) as their first argument. This is the OPPOSITE of the backend pytest-bdd 9.0 sync-step invariant (`backend_invariants.md` §5) — never "fix" async BDD steps here to `def`-style sync wrappers; that rule is Python-scoped.
* **Dev Server Requirement**: Scenarios execute against a running app. Configure Playwright's `webServer` to boot `npm run dev` (port 5173) or `vite preview` after `npm run build` so suite runs are self-contained; do not depend on a manually started server.
* **API Mocking (No Live Backend / LLM)**:
  - Default: Playwright `page.route()` / `context.route()` interception of FastAPI endpoints (`/analyze/jobs*`) with canned `JobResponse` / `JobStatusResponse` payloads. Zero app-code changes, and the component's real `fetch`/polling/submit logic executes — per the section 5 anti-pattern rule, scenarios MUST drive the UI's own action flows, never synthetic fetches that bypass them.
  - MSW v2 remains the shared handler-authoring surface (as in `chrome-extension/`). If browser-level MSW parity is desired, run the MSW **browser worker** gated behind a Vite env flag (e.g. `VITE_ENABLE_MSW`) so production builds stay clean. Critical gotcha: MSW's Node `setupServer` used in the Playwright runner process does NOT intercept in-browser fetches.
* **Runner Discovery Isolation**: Two runner types coexist in `frontend/`: `node --test` unit suites (`src/**/__tests__/*.test.tsx`, esbuild-bundled per section 5) and Playwright BDD specs. Discovery MUST stay mutually exclusive: Playwright's `testDir` must never overlap `src/`, and the generated BDD spec output directory (`.features-gen/` by default, configurable via `defineBddConfig`'s `outputDir`) MUST be gitignored, never hand-edited, and excluded from `tsconfig.app.json` compilation per the section 5 compiler-scope separation.
* **Commands (two-phase: generate, then run)**:
  ```bash
  cd frontend
  npx playwright install chromium   # first run / after version bumps
  npx bddgen                        # compile .feature files -> generated specs (REQUIRED pre-step)
  npx playwright test               # run the generated specs
  ```
  `npx playwright test` does NOT generate specs from `.feature` files by itself: with only the `defineBddConfig` wiring above, a clean checkout reports "No tests found" and a full run generates nothing (verified empirically on playwright-bdd 9.2.1). `npx bddgen` is a mandatory pre-step before EVERY test invocation — including filtered runs — and MUST be re-run after ANY `.feature` edit; stale specs otherwise execute silently (an edited scenario keeps running under its old text until regeneration).
  Scenario runs MUST be fully offline: mocked endpoints only, zero Vertex AI / Supadata / Google CSE traffic.
* **Fixture Discipline**: Domain-relevant journalism/news video URLs only — never Rick Astley or `dQw4w9WgXcQ` (per `testing_and_hygiene.md`). Scenarios follow the backend BDD precedent: scenario-first red → green, one labelled commit per domain.
* **Accepted Tradeoffs (by design, not defects)**:
  - Slower than `node --test` unit suites (browser boot + dev server): BDD scenarios complement, never replace, the section 5 component tests.
  - Each suite run pays a Vite dev-server spin-up plus route mocking — the accepted price of real-browser acceptance fidelity over a jsdom runner.
  - Continuous-mode `npx playwright test` requires the webServer handoff; debugging single scenarios uses `npx bddgen && npx playwright test --grep "<scenario name>"` with the same mocks — the `bddgen` pre-step applies to filtered runs too.


