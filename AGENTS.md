# AGENTS.md

This document serves as the **Supreme Behavioral & Architectural Constitution** for Software Engineering Agents (SEAs) and Greptile Review Agents working in this repository.

> [!IMPORTANT]
> **Active Specification & Review Guidelines**: PR code reviews and quality gates are governed by **[`.greptile/rules.md`](.greptile/rules.md)** and configured via **[`.greptile/config.json`](.greptile/config.json)**. Architectural decisions are documented in **[`docs/adr/`](docs/adr/)**. Domain-specific implementation guardrails are maintained under **[`.agents/rules/`](.agents/rules/)**.

---

# Project Overview

Perspective Prism analyzes YouTube video transcripts for claims, bias, and deception using a multi-perspective approach:
1. **Backend**: Python 3.10+ FastAPI application orchestrating the claim extraction and analysis pipeline.
2. **Frontend**: React 19 + TypeScript 7.0 Single Page Application for standalone interaction.
3. **Chrome Extension**: Manifest V3 browser extension integrating analysis directly into YouTube watch pages.

---

# Supreme Architecture & Model Invariants

> [!IMPORTANT]
> **Strict Google Gemini & ADK 2.0 Vendor Lock-In**:
> - **Framework & SDK**: Exclusively uses **Google ADK 2.0** (`google-adk>=2.4.0`) and the **Google GenAI SDK** (`google-genai>=2.9.0`).
> - **Provider & Authentication Mode**: Exclusively **GCP Vertex AI Mode** (via `GCP_PROJECT` / `GOOGLE_CLOUD_PROJECT`, `GCP_LOCATION`, and `GEMINI_TIER=paid` with 300+ RPM high-throughput quota). AI Studio API keys and free tier rate-limit throttles are permanently removed.
> - **Primary & Backup Models**: Gemini 3.x series models only (`gemini-3.8-flash` primary, `gemini-3.1-flash-lite` backup circuit-breaker fallback). Gemini 2.x and non-Google models are prohibited.
> - **Zero-Throttling Generation Standards (ADR 007)**: Primary analytical agents (`ClaimExtractor`, `AnalysisService`, `AlethiologyService`, red-team `judge`) use `thinking_level="HIGH"`, `max_output_tokens=65536` (64K ceiling), and 120s HTTP timeouts (`GEMINI_HTTP_TIMEOUT=120.0`). Screening micro-tasks (`PreClassifierService`) use `thinking_level="LOW"` and `max_output_tokens=2048`. Thought signatures and thinking tokens are strictly preserved (`EXCLUDED_TELEMETRY_KEYS`).
> - **Forbidden SDKs**: `openai`, `AsyncOpenAI`, and legacy `google-generativeai` are permanently removed.
> - **Strict Async I/O & Non-Blocking Event Loop**: All network I/O operations (LLM model calls, web search, transcript retrieval) MUST use non-blocking `async`/`await` patterns (`client.aio.models`, `httpx.AsyncClient`, `asyncio.to_thread`).
> - **Code Inspection Requirement**: Inspect actual source files (`backend/app/services/claim_extractor.py`, `backend/app/services/analysis_service.py`, `backend/app/core/config.py`) before making statements or planning refactors.

---

# Antigravity 2.0 CLI-First Architecture & Tool Governance

> [!NOTE]
> **Developer Tooling Scope vs. Runtime Application Architecture**:
> This CLI-first doctrine governs **Software Engineering Agents (SEAs), coding assistants, and developer workflows** (version control, PR management, testing, builds, containers, and environment inspection). The **runtime application itself** (`backend/app/`) runs purely in-process via Google ADK 2.0 and the Google GenAI SDK in GCP Vertex AI mode; the backend does **not** shell out to CLI binaries for domain analysis, claim extraction, or perspective scoring.

### 1. MCP Scope & Stateful Boundaries
Perspective Prism development workflows operate strictly on an **Antigravity 2.0 CLI-first, stateful-MCP-sparing architecture**:
* **MCP Reserved Tier (Stateful & Daemon Integrations Only)**:
  - **AST Knowledge Graph**: `codebase-memory-mcp` maintains the persistent SQLite Abstract Syntax Tree graph for codebase navigation, symbol lookup, and call-graph tracing.
  - **External Library Documentation**: `context7` resolves third-party package syntax and API definitions.
  - **Live Browser Sessions**: `chrome-devtools` and `axe-core` manage interactive Chrome DevTools Protocol (CDP) sessions and accessibility validation.
  - **Automated Review Agent Gateways**: `greptile` triggers and manages PR code reviews.
* **CLI Tier (Stateless Operations)**:
  - All version control, pull requests, issues, cloud infrastructure, container management, and build tasks MUST execute through native CLI tools (`gh`, `git`, `gcloud`, `aws`, `docker`, `cargo`, `npm`, etc.) paired with lightweight companion skills rather than stateless MCP servers.
  - **Stateless MCP Deny List**: Strictly reject the introduction or usage of stateless MCP servers (e.g. GitHub MCP, Git MCP, Jira MCP, Slack MCP, Linear, sequential-thinking).

### 2. GitHub CLI (`gh`) & Git Operational Guardrails
1. **Feature Branches Only**: All code modifications must occur within an isolated git worktree and be pushed to a dedicated feature branch. Direct commits or pushes to `main` and `master` are strictly prohibited.
2. **No Autonomous Merging**: You may create Pull Requests via `gh pr create` and inspect reviews via `gh pr view`, but you are strictly forbidden from merging Pull Requests via the terminal (`gh pr merge` is prohibited) or any API. A human developer must review and merge all code.
3. **Remote & Exfiltration Protection**: Never execute `git remote add*`, `git remote set-url*`, or `git remote remove*`. Never execute `git submodule add*` or `git submodule update --init*`.
4. **Output Token Hygiene for `gh` Queries**: Never execute bare `gh` commands that dump unbounded JSON or table rows. Always constrain queries using `--json <fields>`, `--limit <N>`, or pipe through `jq` (e.g., `gh pr list --limit 10 --json number,title,author,headRefName,state`).
5. **No Destructive API / CLI Actions**: Repository deletion, branch protection tampering, and visibility modifications are blocked at the token level and strictly prohibited by rule.
6. **Pre-Commit Hygiene**: Before staging files via `git add`, verify that no `.env` files, API keys, credentials, or `.sqlite` WAL files are included in the commit payload.

### 3. CLI Output Hygiene & Token Conservation Protocol
To maintain strict token economy across long-running sessions, agents must adhere to output-limiting practices whenever running terminal CLI tools:
* **Mandatory Projection Flags**: On tools with structured output support (`gh`, `gcloud`, `aws`, `docker`), always specify output projections:
  - `gh`: Use `--json <field1,field2>` and `--limit <N>` (or `--template`)
  - `gcloud`: Use `--format="value(field)"` or `--format="table(field1,field2)"`
  - `docker`: Use `--format "{{.ID}}: {{.Names}} ({{.Status}})"`
* **Unix Pipeline Filtering**: Filter raw text streams before they reach the model context. Pipe through `jq`, `head -n <N>`, `grep`, `awk`, or `cut` (e.g., `gh run view <id> --log-failed | head -n 50`).
* **Scratch File Buffering for Large Outputs**: If a diagnostic command or test run generates more than 100 lines of logs, redirect or tee it to the conversation scratch directory and inspect targeted segments with `grep` or `head` rather than dumping the full trace into context.
* **Atomic Pipelines Over Chatty Turns**: Prefer chaining commands in a single shell invocation using `&&` or pipelines (`|`) rather than executing separate single-command tool calls across multiple conversational turns.

### 4. Architectural Perpetuation & Downstream Agent Invariant
This CLI-first, MCP-sparing doctrine is a permanent, indefinite architectural standard. All future agents, subagents, and automated workflows governed by this constitution must:
1. **Perpetuate the Pattern**: When recommending, designing, or scaffolding new tools, integrations, or workflows, agents must prioritize CLI binaries paired with lightweight skills rather than introducing new MCP servers.
2. **Defend the Boundaries**: Strictly reject the addition of stateless MCP servers (e.g. for Jira, Slack, Linear, Stripe, or cloud providers) whenever a mature CLI tool or scriptable API exists. Reserve MCP exclusively for persistent stateful daemons, database connections, and AST memory graphs.
3. **Propagate to Project Invariants**: When authoring repository-level `AGENTS.md`, `.cursor/rules/`, or subagent system prompts, agents must explicitly codify this CLI-first discipline to ensure child agents and subagents inherit identical token hygiene.

---

# Review Governance & Security Invariants

* **Greptile Review Agent Standard**: All PR reviews and automated quality gates are governed by `.greptile/rules.md` and `.greptile/config.json`. Do not create or reference `.macroscope/` or legacy Qodo files.
* **BYOK Storage Isolation**: User credentials and sensitive settings MUST be stored exclusively in `chrome.storage.local` across both module (`config.js`) and script (`config-script.js`) variants. `chrome.storage.sync` is prohibited for secrets.
* **IPC Origin Verification**: Service worker `background.js` MUST validate `sender.id === chrome.runtime.id` for all `chrome.runtime.onMessage` listeners, returning structured error objects `{ success: false, error: "...", code: "UNAUTHORIZED" }`.
* **Structured Output Scope**: Pydantic `output_schema` or `response_schema` enforcement applies to model calls returning application business data (claim extraction, perspective & bias analyses). Utility operations (`count_tokens`, health probes) are exempt.

---

# Repository Layout

```
/
├── .agents/
│   └── rules/            # Modular domain rulebooks (backend, frontend, extension, testing)
├── .greptile/            # Greptile automated review rules and configuration
├── backend/              # Python FastAPI backend (ADK 2.0, Vertex AI, Rust PyO3 Sanitizer)
│   ├── app/             # API routes, core settings, models, and services
│   └── tests/           # pytest test suite
├── frontend/            # React 19 + TypeScript 7.0 + Vite SPA
├── chrome-extension/    # Manifest V3 browser extension (Zero-build vanilla JS + Side Panel)
│   └── tests/           # Vitest unit tests + Playwright integration tests
├── docs/
│   └── adr/             # Architecture Decision Records (ADR 001 - 007)
├── walkthroughs/        # Developer walkthroughs and implementation guides
└── AGENTS.md            # This Constitution & Rules Index
```

---

# System Architecture Pipeline

The analysis pipeline follows four core stages:
1. **Claim Extraction**: Fetches YouTube transcript and uses ADK 2.0 `ExtractorAgent` (Gemini Structured Outputs) to identify verifiable claims with timestamps.
2. **Evidence Retrieval**: Queries Google Custom Search across four perspectives in parallel: Scientific, Journalistic, Partisan Left, Partisan Right.
3. **Perspective & Bias Analysis**: Evaluates claims against retrieved evidence and context using ADK 2.0 `AnalysisAgent` instances, applying deception threshold filters.
4. **Truth Profile**: Assembles the overall assessment (`Likely True`, `Likely False`, `Mixed`, `Suspicious/Deceptive`), per-perspective confidence ratings, and bias indicators.

---

# Tier Summaries & Quick Commands

### 1. Backend (`backend/`)
* **Stack**: Python 3.10+, FastAPI, Google ADK 2.0, `google-genai` (Vertex AI mode), PyO3 Rust extension (`prism_sanitizer_rs`).
* **Run Server**: `uvicorn app.main:app --reload` (port 8000)
* **Run Tests**: `source backend/venv/bin/activate && cd backend && GCP_PROJECT=test-project LLM_API_KEY=dummy GOOGLE_API_KEY=dummy GOOGLE_CSE_ID=dummy pytest`

### 2. Frontend (`frontend/`)
* **Stack**: React 19, TypeScript 7.0 (native Go compiler engine via ADR 004), Vite, plain custom CSS.
* **Dev Server**: `npm run dev` (port 5173)
* **Build**: `npm run build` (sub-second compile via `tsc -b && vite build`)
* **Lint**: `npm run lint`

### 3. Chrome Extension (`chrome-extension/`)
* **Stack**: Manifest V3, zero-build vanilla JS (ADR 004), Native Side Panel API, JSDoc static semantic type checking (`checkJs: true`).
* **Typecheck**: `npm run typecheck` (`tsc --noEmit`)
* **Lint**: `npm run lint`
* **Unit Tests**: `npm test` (Vitest)
* **Integration Tests**: `npm run test:integration` (Playwright persistent context)

---

## Constitution & Rule Maintenance Protocol

Future AI agents, pair programmers, and automated tooling must adhere to this rule governance protocol:

1. **Root `AGENTS.md` Scope**:
   * Reserved strictly for core project identity, primary architectural invariants, vendor lock-in standards, review directives, and the rule index.
   * **Do NOT** append granular function signatures, component rules, or test mocking specifics directly to this root file.
2. **`.agents/rules/` Modular Scope**:
   * Detailed implementation guardrails, DB/storage mechanics, logging privacy, BDD/test patterns, and hygiene MUST be added to or updated within the appropriate domain file under `.agents/rules/`.
3. **Proposal Workflow**:
   * Before modifying project rules or adding new constraints (e.g. during `/learn` or code review resolutions), agents MUST draft a proposal/plan outlining the classification, rationale, and diffs, and obtain explicit user approval before writing changes to disk.

---

## Modular Domain Rules Index

Detailed engineering invariants and implementation guidelines are maintained in the following modular rulebooks:

* **[Backend Invariants](file:///.agents/rules/backend_invariants.md)**: Python FastAPI rules, ADK 2.0 patterns, Rust PyO3 input sanitizer compilation, `pydantic-settings` dependency injection, SDK mock safety, and concurrency testing.
* **[Frontend Invariants](file:///.agents/rules/frontend_invariants.md)**: React 19 standards, TypeScript 7.0 Go native compiler architecture (ADR 004), `@typescript/typescript6` ESLint bridge, custom CSS conventions, and API schema interfaces.
* **[Chrome Extension Invariants](file:///.agents/rules/chrome_extension_invariants.md)**: Manifest V3 zero-build vanilla JS architecture (ADR 004), `checkJs: true` semantic typechecking, ambient `globals.d.ts`, content script load order, BYOK storage isolation (`chrome.storage.local`), IPC origin verification, native Side Panel UI, and cache key content hashing.
* **[Testing & Hygiene Invariants](file:///.agents/rules/testing_and_hygiene.md)**: Playwright persistent context integration test harness, domain-relevant news fixtures, MSW v2 mocking, Vitest script execution, accessibility scanning (axe-core vs a11y-debugging), git merge 2-parent verification, GitHub CLI (`gh`) guardrails, and Antigravity 2.0 CLI-first architecture.
