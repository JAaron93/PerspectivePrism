# Testing, Tool Routing & Hygiene Invariants

This document defines repository-wide test execution standards, test fixture discipline, accessibility rules, and git merge invariants.

---

## 1. Test Harness & Tool Routing Discipline

* **Primary Integration Test Harness**: Always use **Playwright's Persistent Extension Context** (`npm run test:integration` in `chrome-extension/`) for automated integration testing, assertions, regression checks, and CI quality gates.
* **Domain-Relevant Test Fixtures**: **Never use pop music videos or dummy Rick Astley IDs (`dQw4w9WgXcQ`) for automated testing or browser QA**. Always use realistic journalism, news analysis, science reporting, or policy documentary video URLs/IDs (e.g. PBS NewsHour, BBC News, DW News, or Veritasium claims) so test data accurately reflects Perspective Prism's claim extraction domain.
* **Network Mocking & Stubbing (MSW v2)**: Use **MSW (Mock Service Worker v2)** (`msw` package in `chrome-extension/`) for intercepting FastAPI backend requests (`/analyze/jobs`), simulating stream progress chunks, testing network errors (500/429), and verifying local cache hit/miss behavior without making live API calls.
* **Linux CI/CD Virtual Display (`xvfb-run`)**: Chrome Extensions cannot initialize background Service Workers or Side Panel APIs in pure headless mode on Linux. In GitHub Actions, launch Playwright with `headless: false` wrapped in `xvfb-run npm run test:integration`.
* **Vitest Script Evaluation**: To test `*-script.js` files (which lack `export` statements and attach directly to `window`), evaluate them in Vitest's JSDOM environment using `new Function("window", code)(globalThis)` inside a `beforeAll` block.
* **Vitest Async Init Guards**: Any Vitest test suite executing a module with top-level asynchronous initialization (such as `sidepanel.js` calling `checkCurrentTabState()`) MUST wait for the initial outbound `chrome.runtime.sendMessage` payload inside a `vi.waitFor` block prior to dispatching synthetic listener messages.
* **Selective Interactive Debugging**: Use Chrome DevTools MCP (`chrome-devtools`, `memory-leak-debugging`, or `a11y-debugging` skills) **ONLY** when actively diagnosing tricky runtime bugs, memory leaks, detached DOM nodes, or Service Worker sleep state race conditions during development. Do NOT use Chrome DevTools MCP for routine test suite execution.
* **Review Comment Evaluation Protocol (Valid vs. By-Design Edge Cases)**:
  - **Valid Metadata Omissions**: If an automated review agent identifies that an ingested signal (e.g. `channel_name`) was omitted from a multi-field filter condition, treat it as valid and apply cascading updates (`design.md` -> `requirements.md` -> `tasks.md`).
  - **By-Design Zero-Caption Edge Cases**: If a review comment flags that captionless media with non-political metadata bypasses LLM calibration, treat it as by-design: transcript-based analysis cannot run without text or audio, and the user-facing `[⚡ Analyze Anyway]` (Force Override) button is the designated architectural mechanism for manual bypass.
* **ADK Agent Generation Config Verification**:
  - Any test verifying an ADK 2.0 `Agent` instance must assert that `agent.generate_content_config` is present, `thinking_level` conforms to the task routing standard (`HIGH` for analytical agents, `LOW` for routers), and `max_output_tokens` meets ceiling requirements (65,536 for analytical, 2,048 for routers). Never allow untested bare `Agent(...)` instantiations in services or test fixtures.

---

## 2. Automated Accessibility (axe-core & a11y-debugging)

* **Prerequisites Before Scanning**:
  1. Wait for client-side rendering/hydration to complete before invoking `analyze`.
  2. Dismiss modal overlays, cookie consent banners, or dropdowns that block page interaction.
* **Workflow Pattern**:
  1. Run `analyze` on specific, isolated selectors (e.g. `#main-content`, `form.checkout`) rather than whole-page scans.
  2. Call `remediate` on returned violation IDs to get code-level fixes.
  3. Focus fixes on semantic HTML elements (`<button>` over `<div onClick>`), proper ARIA labels, and WCAG AA color contrast compliance.
* **Tool Complementarity (`axe-core-mcp` vs `a11y-debugging`)**:
  - `axe-core-mcp`: Primary tool for component-level DOM scanning (`analyze`) and code-level remediation (`remediate`).
  - `a11y-debugging` skill: Full-page Lighthouse accessibility scores, visual tap-target size validation (48x48px), and keyboard focus trap cycling (`Tab`/`Shift+Tab`).

---

## 3. Git Merge & Documentation Invariants

* **Git Merge Resolution & Parent Verification**:
  - **Conclude Merge State**: After resolving conflict markers in files during a `git merge`, ALWAYS finalize the two-parent merge commit using terminal command `git commit --no-edit` (or explicit merge commit message).
  - **Verify Merge Parents**: Before pushing a merge resolution commit to remote (`git push`), verify that the resulting commit is a true 2-parent merge commit by checking `git rev-parse HEAD^1 HEAD^2`.
* **Documentation Hygiene & Test Suite Claims**:
  - **No Brittle Test Item Counts**: In `README.md` and public docs, avoid hardcoding static test item numbers that drift from glob-based runners. Describe covered module scope and document runnable commands (`npm test`, `npm run test:integration`, `pytest`).
  - **Verifiable Performance & Storage Claims**: Ensure performance/latency statements are internally consistent and match actual code behavior (e.g. state `<20ms cache hit load` rather than mixing `<20ms` with `sub-millisecond`).
