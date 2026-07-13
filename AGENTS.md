# AGENTS.md

This file provides guidance to Software Engineering Agents (SEAs) when working with code in this repository.

# Project Overview

Perspective Prism is a system designed to analyze YouTube video transcripts for claims, bias, and deception using a multi-perspective approach. It consists of three main components:

1.  **Backend**: A Python FastAPI application that orchestrates the analysis pipeline.
2.  **Frontend**: A React/TypeScript web application for standalone user interaction.
3.  **Chrome Extension**: A Manifest V3 browser extension that integrates the analysis directly into YouTube watch pages.

# Repository Layout

```
/
├── backend/              # Python FastAPI backend
│   ├── app/
│   │   ├── api/         # API route handlers
│   │   ├── core/        # Configuration (pydantic-settings)
│   │   ├── models/      # Pydantic schemas and data models
│   │   ├── services/    # Business logic (ClaimExtractor, EvidenceRetriever, AnalysisService)
│   │   ├── utils/       # Utility functions (input_sanitizer.py)
│   │   └── main.py      # FastAPI entry point
│   └── tests/           # pytest test suite
├── frontend/            # React + TypeScript + Vite SPA
├── chrome-extension/    # Manifest V3 browser extension
│   └── tests/           # Vitest unit tests + Playwright integration tests
├── docs/
│   └── adr/             # Architecture Decision Records
├── walkthroughs/        # Developer walkthroughs and implementation guides
├── .benchmarks/         # Agent evaluation scripts
└── AGENTS.md            # This file
```

# Backend Development

The backend is located in the `backend/` directory. It uses Python 3.13+ and FastAPI.

## Setup
1.  Navigate to `backend/`.
2.  Create a virtual environment: `python3 -m venv venv`.
3.  Activate it: `source venv/bin/activate`.
4.  Install dependencies: `pip install -r requirements.txt`.
5.  Set up `.env` from `.env.example` (requires OpenAI and Google Search API keys).
6.  **Rust Toolchain Configuration**:
    When compiling the Rust extension (`prism_sanitizer_rs`), if the Rust compiler (`rustc`/`cargo`) is not found on the `PATH`, prepend the local Rustup stable toolchain bin directory to your `PATH` (typically located at `~/.rustup/toolchains/stable-x86_64-apple-darwin/bin` on macOS):
    ```bash
    export PATH="~/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$PATH"
    pip install -e .
    ```


## Common Commands

*   **Run Server**: `uvicorn app.main:app --reload` (starts on port 8000)
*   **Run Tests**: `pytest`
*   **Run Specific Test**: `pytest tests/test_input_sanitizer.py`

## Architecture & Key Files

*   `app/main.py`: FastAPI entry point. Defines the async job API, background task processing, and CORS configuration.
*   `app/services/claim_extractor.py`: Fetches YouTube transcripts and uses the ADK 2.0-wrapped `ExtractorAgent` to extract claims using structured outputs.
*   `app/services/evidence_retriever.py`: Queries Google Custom Search to retrieve evidence per perspective.
*   `app/services/analysis_service.py`: Modernized ADK 2.0-wrapped `AnalysisAgent` logic for perspective, bias, and deception detection. Includes a circuit breaker that tracks transient `google-genai` failures and falls back to `gemini-3.1-flash-lite`.
*   `app/utils/input_sanitizer.py`: **Critical security component.** Integrates a high-performance Rust compiled extension (`prism_sanitizer_rs` via PyO3) for regex patterns and control character sanitization. All user-supplied content must pass through this before being sent to any LLM.
*   `app/core/config.py`: `pydantic-settings` configuration. Key settings include `MAX_CLAIMS_PER_ANALYSIS`, `DECEPTION_THRESHOLD_HIGH`, `DECEPTION_THRESHOLD_MODERATE`, and `CHROME_EXTENSION_IDS`.
*   `pyproject.toml`: Build and test configuration.

## Async Job API

Analysis runs asynchronously. The flow is:

1.  `POST /analyze/jobs` — submits a YouTube URL, returns a `job_id`.
2.  `GET /analyze/jobs/{job_id}` — poll for status (`PENDING` → `PROCESSING` → `COMPLETED` / `FAILED`) and incremental results.

Results are updated incrementally as each perspective completes. Completed jobs are cleaned up after 1 hour by a background task.

## Coding Conventions

*   Use `async`/`await` for all I/O operations.
*   **All user inputs must be sanitized via `input_sanitizer.py` before LLM processing** — no exceptions.
*   Use Pydantic models for all request/response schemas.
*   Use structured logging via the `logging` module; log details server-side and return generic errors to clients.
*   Configuration via `pydantic-settings` and `.env` files — never hardcode secrets.
*   Catch specific exceptions; avoid bare `except` clauses.

# Frontend Development

The frontend is located in the `frontend/` directory. It uses React 19, TypeScript, and Vite.

## Setup
1.  Navigate to `frontend/`.
2.  Install dependencies: `npm install`.
3.  Set up `.env` from `.env.example`.

## Common Commands

*   **Start Dev Server**: `npm run dev` (starts on port 5173)
*   **Build for Production**: `npm run build`
*   **Lint Code**: `npm run lint`
*   **Preview Production Build**: `npm run preview`

## Coding Conventions

*   Functional components with hooks; no class components.
*   TypeScript interfaces for all API response types.
*   Environment variables prefixed with `VITE_`.
*   Error handling with try/catch and user-friendly error messages.

# Chrome Extension

The extension is located in `chrome-extension/`. It uses vanilla JavaScript (ES modules), HTML, and CSS — no build step.

## Setup
1.  Navigate to `chrome-extension/`.
2.  Install dev dependencies: `npm install`.

**To load in Chrome**: open `chrome://extensions`, enable Developer Mode, click "Load unpacked", select the `chrome-extension/` directory.

## Common Commands

*   **Run Unit Tests**: `npm test` (Vitest, single run)
*   **Run Unit Tests (watch)**: `npm run test:watch`
*   **Run Coverage**: `npm run test:coverage`
*   **Run Integration Tests**: `npm run test:integration` (Playwright)

## Key Files

*   `manifest.json`: Extension configuration (Manifest V3).
*   `content.js`: Content script — UI injection and DOM manipulation on YouTube pages.
*   `claim-navigator.js`: Keyboard navigation and accessibility (`ClaimNavigator` class).
*   `background.js`: Service worker for API coordination.
*   `client.js`: Backend API client used by content and popup scripts.
*   `config.js` / `config-script.js`: Extension configuration (module and script variants).
*   `logging-utils.js` / `logging-utils-script.js`: Logging utilities (module and script variants).
*   `popup.html` / `popup.js`: Browser action popup.
*   `options.html` / `options.js`: Extension options page.
*   `welcome.html` / `welcome.js`: Onboarding page.

## Content Script Load Order

Scripts are injected into YouTube pages in this order:
`logging-utils-script.js` → `config-script.js` → `consent.js` → `claim-navigator.js` → `content.js`

## Coding Conventions

*   Vanilla JS with ES module syntax — no framework, no build step.
*   Shared utilities have two variants: a module version (e.g. `config.js`) for import in other modules, and a script version (e.g. `config-script.js`) for direct injection by the manifest.
*   The backend is allowlisted for CORS via the `CHROME_EXTENSION_IDS` setting in the backend config.

# System Architecture

The system follows a pipeline approach:

1.  **Claim Extraction**: Fetches the YouTube transcript and uses the ADK 2.0 `ExtractorAgent` (leveraging Gemini Structured Outputs) to identify key claims with timestamps. The prompt format utilizes context caching by placing raw transcript data at the absolute beginning inside untrusted data delimiters.
2.  **Evidence Retrieval**: For each claim, queries Google Custom Search across four perspectives in parallel: Scientific, Journalistic, Partisan Left, Partisan Right.
3.  **Perspective & Bias Analysis**: Evaluates each claim against the retrieved evidence and context using ADK 2.0 `AnalysisAgent` instances. High-deception ratings short-circuit overall assessment, and moderate-deception ratings downgrade assessments.
4.  **Truth Profile**: Assembles the final result — overall assessment (`Likely True`, `Likely False`, `Mixed`, or `Suspicious/Deceptive`), per-perspective analysis, and bias indicators.

## External Services

*   **YouTube Transcript API**: Fetches video transcript text.
*   **Google Custom Search JSON API**: Evidence retrieval per perspective.
*   **Gemini API (via `google-genai` SDK and `google-adk`)**: Serves all LLM needs. Uses `gemini-3.5-flash` as the primary model and falls back to `gemini-3.1-flash-lite` if the primary service experiences transient failures (429/500/503).
