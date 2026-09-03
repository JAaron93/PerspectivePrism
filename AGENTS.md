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
> - **Forbidden SDKs**: `openai`, `AsyncOpenAI`, and legacy `google-generativeai` are permanently removed.
> - **Strict Async I/O & Non-Blocking Event Loop**: All network I/O operations (LLM model calls, web search, transcript retrieval) MUST use non-blocking `async`/`await` patterns (`client.aio.models`, `httpx.AsyncClient`, `asyncio.to_thread`).
> - **Code Inspection Requirement**: Inspect actual source files (`app/services/claim_extractor.py`, `app/services/analysis_service.py`, `app/core/config.py`) before making statements or planning refactors.

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
│   └── adr/             # Architecture Decision Records (ADR 001 - 004)
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
* **[Testing & Hygiene Invariants](file:///.agents/rules/testing_and_hygiene.md)**: Playwright persistent context integration test harness, domain-relevant news fixtures, MSW v2 mocking, Vitest script execution, accessibility scanning (axe-core vs a11y-debugging), git merge 2-parent verification, and documentation hygiene.
