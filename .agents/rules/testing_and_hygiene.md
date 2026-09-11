# Testing, Tool Routing & Hygiene Invariants

This document defines repository-wide test execution standards, test fixture discipline, accessibility rules, and git merge invariants.

---

## 1. Test Harness & Tool Routing Discipline

* **CLI-First Tool Routing & Stateful MCP Scope**: All test orchestration, git management, and build tasks MUST execute through native CLI binaries (`pytest`, `npm`, `cargo`, `gh`, `git`) paired with companion skills. MCP tools are strictly reserved for stateful persistent daemons (`codebase-memory-mcp` for AST queries, `context7` for external library docs, `chrome-devtools` for live CDP debugging, `axe-core-mcp` for DOM accessibility analysis, and `greptile` for code review gateways). Stateless MCP servers (Git MCP, GitHub MCP, Jira/Slack MCP) are strictly forbidden.
* **CLI Output Hygiene & Token Conservation**: Diagnostic test runs and command queries generating verbose logs (>100 lines) must buffer output to scratch files or filter through Unix pipelines (`head -n <N>`, `grep`, `jq`) to preserve model context. Structured tools must specify projection flags where supported (e.g. `gh --json ... --limit N` on list queries, `docker --format`, `gcloud --format`).
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
* **Multi-Worktree Virtual Environment Shebang Hygiene**:
  - When copying or rsyncing a virtual environment `bin/` directory between git worktrees to optimize dependency installation, script entrypoints (`pytest`, `maturin`, `pip`, `uvicorn`) retain hardcoded absolute shebang paths pointing to the source worktree.
  - Running `pytest` directly will silently invoke the source worktree's Python interpreter and site-packages, ignoring locally compiled native extensions in the current worktree.
  - Always execute test suites via `python -m pytest` or rewrite shebang lines in `backend/venv/bin/*` to point to the current worktree's local virtual environment binary.
* **Evaluation Dataset & Fixture Invariants**:
  - **Runtime Enum Fidelity**: All evaluation datasets and golden fixtures MUST use exact canonical string values matching the codebase's Pydantic/Enum models (e.g. `PerspectiveType` requiring `"Partisan (Left)"` and `"Partisan (Right)"` rather than conversational shorthand `"Partisan Left"` / `"Partisan Right"`). Unit tests for fixtures MUST assert direct enum instantiation (`PerspectiveType(item["perspective"])`).
  - **Transcript Timing Structure**: Evaluation fixtures targeting transcript-consuming services (`ClaimExtractor`) MUST include structured `segments: [{"text": str, "start": float, "duration": float}]` capable of directly instantiating runtime `Transcript` and `TranscriptSegment` objects without synthetic patching.
  - **Temporal Overlap Alignment**: Every annotated gold claim's `[timestamp_start, timestamp_end]` interval MUST explicitly overlap with the spoken segment interval(s) where that claim occurs. Dataset test suites MUST programmatically assert non-empty segment overlap for all annotated claims to prevent temporal scoring drift.
* **Evaluation Sanitizer Regression Test Invariants**:
  - **Sentence & Line Boundary Preservation**: Sanitizer test suites MUST assert that multi-sentence and newline-separated evidence containing benign verbs (`give`, `return`, `set`) and numbers (`5`, `10`) or superlatives (`maximum`, `best`) are preserved intact without false-positive redaction (`[REDACTED_SCORING_DIRECTIVE]`).
  - **Whitespace-Variant Breakout Assertions**: Tag breakout test suites MUST explicitly assert that whitespace variants (e.g. `</tag >` and `<tag >`) are escaped or stripped to verify sandbox integrity.

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

* **GitHub CLI (`gh`) & Feature Branch Operational Guardrails**:
  - All development must occur on dedicated feature branches within isolated git worktrees. Direct commits or pushes to `main` or `master` are strictly prohibited.
  - **Zero Autonomous Merging**: Merging via CLI (`gh pr merge` is prohibited) or automated bot action is strictly forbidden; all PRs require human review and merge.
  - **Pre-Commit Hygiene**: Before staging files via `git add`, verify that no `.env` files, API keys, credentials, or `.sqlite` WAL files are included in the commit payload.
* **Git Merge Resolution & Parent Verification**:
  - **Conclude Merge State**: After resolving conflict markers in files during a `git merge`, ALWAYS finalize the two-parent merge commit using terminal command `git commit --no-edit` (or explicit merge commit message).
  - **Verify Merge Parents**: Before pushing a merge resolution commit to remote (`git push`), verify that the resulting commit is a true 2-parent merge commit by checking `git rev-parse HEAD^1 HEAD^2`.
* **Concurrent ADR Branch Renumbering Protocol**:
  - **Collision Detection**: When resolving merge conflicts against `main`, inspect `docs/adr/` for newly merged ADRs that share the same sequential index as the feature branch's new ADR.
  - **Renumbering**: If a collision occurs (e.g. both branches introduced `006-*`), renumber the newer feature branch ADR to the next available sequential integer (e.g. `007-*`) using `git mv` to preserve git file tracking.
  - **Cross-Reference Synchronization**: Update the ADR title heading, `AGENTS.md` Supreme Architecture Invariants, `.agents/rules/` domain rulebooks, and `.greptile/rules.md` references before concluding the merge commit.
* **Documentation Hygiene & Test Suite Claims**:
  - **No Brittle Test Item Counts**: In `README.md` and public docs, avoid hardcoding static test item numbers that drift from glob-based runners. Describe covered module scope and document runnable commands (`npm test`, `npm run test:integration`, `pytest`).
  - **Verifiable Performance & Storage Claims**: Ensure performance/latency statements are internally consistent and match actual code behavior (e.g. state `<20ms cache hit load` rather than mixing `<20ms` with `sub-millisecond`).

---

## 4. Specification & Architecture Version-Control Invariants

* **Spec Gate Before Implementation**: Whenever a new technical specification (e.g. under `docs/*-spec/`) or Architecture Decision Record (ADR) is generated or updated via `/spec-creator` or architectural planning, the specification documents (`design.md`, `requirements.md`, `tasks.md`, `ADR-*.md`) MUST be committed, pushed to a dedicated feature branch, and have a GitHub Pull Request opened for human review **before** beginning any code implementation, build configuration changes, or test harness modifications.
* **Cascading Update Integrity**: When modifying existing specifications, updates must strictly follow the design-first cascade (`design.md` → `requirements.md` → `tasks.md`). Never implement un-versioned or uncommitted architectural tasks.

---

## 5. Google agents-cli Platform Evaluation & Benchmark Orchestration Invariants (T6.4)

* **CLI Entrypoint**: The canonical benchmark CLI for PerspectivePrism evaluation is `python -m app.evals.cli` (`backend/app/evals/cli.py`). All component benchmark sweeps, ADK judge evaluations, and CI evaluation invocations must route through this unified entrypoint.

* **Dual-Mode Execution** (FR22):
  - **Native Component Mode** (`--component [pre_classifier|extractor|perspective|bias|alethiology|all]`): Directly executes isolated quantitative runners (`app.evals.runners`) and ADK judge agents. Required for offline CI evaluation.
  - **agents-cli Platform Mode** (`--adk-eval`): Delegates evaluation to `agents-cli eval run --config backend/tests/eval/eval_config.yaml`. Use when `agents-cli` is installed and full trajectory grading (`agents-cli eval grade`, `agents-cli eval compare`) is required.

* **Graceful Pure-Python Fallback** (FR22, US4):
  - The CLI MUST probe for the `agents-cli` binary using `shutil.which("agents-cli")` before attempting subprocess delegation.
  - If the binary is absent from the active environment PATH, the CLI MUST emit a warning-level log (containing `PURE-PYTHON FALLBACK`) and seamlessly route to the native component runner **without raising an exception or returning a non-zero exit code**.
  - CI/CD pipelines must never crash due to absence of the `agents-cli` binary.

* **Offline Golden Fixture Invariant** (NFR3, FR20):
  - All component evaluations executed under pytest markers `eval` and `component` MUST run 100% offline using pre-recorded golden datasets in `backend/app/evals/datasets/`.
  - Zero active calls to YouTube, Google Custom Search, or any external API are permitted during `pytest -m "eval and component"` execution.
  - If a component evaluation requires live ADK judge execution (perspective, bias, alethiology), the offline CI test records `is_fallback=True` placeholder records to preserve dataset structure without making network calls.

* **Pytest Marker Registration** (FR20):
  - Component evaluation tests MUST be marked with both `@pytest.mark.eval` and `@pytest.mark.component` to enable selective CI execution:
    ```bash
    pytest -m "eval and component" backend/tests/
    ```
  - These markers are registered in `backend/pyproject.toml` under `[tool.pytest.ini_options]`.

* **Trace Schema & Artifact Parity** (FR21):
  - Execution traces exported to `artifacts/traces/run_<timestamp>.json` MUST conform to the `EvaluationDataset` JSON schema (fields: `eval_cases`, each with `eval_case_id`, `prompt`, `responses`, `metadata`), ensuring compatibility with `agents-cli eval grade` and `agents-cli eval compare`.
  - Aggregated benchmark reports MUST be written to `artifacts/eval_results/summary_<timestamp>.md` (Markdown with `tabulate` tables) AND `artifacts/eval_results/summary_<timestamp>.json` (structured JSON).

* **Fallback Isolation in Aggregation** (FR16, FR21):
  - `aggregate_benchmark_results()` MUST exclude records with `is_fallback=True` from mean score calculations. Fallback counts MUST be separately recorded in `fallback_count` and per-component `error_rate` fields.
  - Trace files MUST include **all** records (valid AND fallback) for audit completeness.

* **eval_config.yaml Schema Invariants** (FR23):
  - `backend/tests/eval/eval_config.yaml` MUST specify: `version`, `project: "perspective-prism"`, evaluation `model: "gemini-3.5-flash-lite"` (benchmark candidate), `max_concurrency <= 10`, `timeout_seconds >= 120`, five dataset paths (pre_classifier, claim_extractor, perspective_stance, bias_deception, alethiology), built-in metrics (`hallucination`, `safety`), and custom ADK judge mappings (`claim_recall`, `perspective_faithfulness`, `alethiology_neutrality`).
  - The config schema is tested in `backend/tests/test_eval_cli.py::TestEvalConfigYamlValidation`.

---

## 6. Antigravity 2.0 CLI-First Architecture & Downstream Agent Invariants

* **MCP Scope & Stateful Boundaries**:
  - **Reserved Tier (Stateful & Daemon Integrations Only)**: `codebase-memory-mcp` (AST knowledge graph), `context7` (external library docs), `chrome-devtools` (live CDP browser sessions), `axe-core-mcp` (DOM accessibility scans), and `greptile` (PR review gateway).
  - **CLI Tier (Stateless Operations)**: Native CLI tools (`gh`, `git`, `gcloud`, `aws`, `docker`, `cargo`, `npm`, `pytest`) paired with companion skills for all version control, PR reviews, cloud deployments, container management, and build tasks.
  - **Stateless MCP Deny List**: Strictly reject adding stateless MCP servers (e.g. GitHub MCP, Git MCP, Jira MCP, Slack MCP, Linear, sequential-thinking).
* **CLI Output Hygiene Protocol**:
  - Always project structured outputs: `gh --json ... --limit N`, `gcloud --format=...`, `docker --format=...`.
  - Pipe verbose outputs through Unix stream filters (`jq`, `head -n <N>`, `grep`, `awk`).
  - Buffer test traces exceeding 100 lines to the conversational scratch directory rather than dumping raw streams into context.
* **Architectural Perpetuation & Downstream Agent Invariant**:
  - All future agents, subagents, and automated workflows must:
    1. **Perpetuate the Pattern**: Prioritize CLI binaries paired with lightweight skills rather than introducing new MCP servers.
    2. **Defend the Boundaries**: Strictly reject stateless MCP servers whenever a mature CLI tool or scriptable API exists.
    3. **Propagate to Project Invariants**: Codify this CLI-first discipline when authoring repository-level rules, instructions, or subagent prompts.

