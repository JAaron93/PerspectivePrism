# Backend Invariants & Development Rules

This document defines the implementation guidelines, security invariants, testing practices, and architecture rules for the Python FastAPI backend (`backend/`).

---

## 1. Environment & Model Invariants

* **Strict Google Gemini & ADK 2.0 Vendor Lock-In**:
  - Exclusively uses **Google ADK 2.0** (`google-adk>=2.4.0`) and the **Google GenAI SDK** (`google-genai>=2.9.0`).
  - Provider & auth mode: Exclusively **GCP Vertex AI Mode** (via `GCP_PROJECT` / `GOOGLE_CLOUD_PROJECT`, `GCP_LOCATION`, and `GEMINI_TIER=paid` with 300+ RPM paid quota). AI Studio API keys and free tier throttles are permanently removed.
  - Allowed models: Gemini 3.x series models only (`gemini-3.5-flash-lite` primary, `gemini-3.1-flash-lite` backup circuit-breaker fallback). Gemini 2.x and non-Google models are prohibited.
  - Forbidden SDKs: `openai`, `AsyncOpenAI`, and legacy `google-generativeai` are permanently forbidden.
* **Strict Non-Blocking Async I/O**:
  - All network I/O operations (LLM generation, Google Custom Search, YouTube transcript fetching) MUST use non-blocking `async`/`await` patterns (`client.aio.models`, `httpx.AsyncClient`, `asyncio.to_thread`).
  - Synchronous blocking network calls inside event loop contexts are strictly prohibited.

---

## 2. Security & Rust Input Sanitization

* **Mandatory Rust Sanitization (`input_sanitizer.py`)**:
  - All user-supplied content (video URLs, search queries, transcript texts) MUST pass through `input_sanitizer.py` before being processed by any agent or LLM call.
  - Integrates high-performance compiled Rust PyO3 extension (`prism_sanitizer_rs`).
* **Rust Toolchain Configuration**:
  - When building the Rust extension, if `rustc` or `cargo` is missing from `PATH`, prepend the local Rustup stable toolchain bin directory:
    ```bash
    export PATH="~/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$PATH"
    pip install -e .
    ```
* **Structured Output Scope**:
  - Pydantic `output_schema` or `response_schema` enforcement applies to model calls returning application business data (claim extraction, perspective & bias analyses). Utility operations (`count_tokens`, health probes) are exempt.

---

## 3. Architecture & Service Components

* `app/main.py`: FastAPI entry point. Defines the async job API, background task processing, and CORS configuration allowlisting `CHROME_EXTENSION_IDS`.
* `app/services/claim_extractor.py`: Fetches YouTube transcripts and uses the ADK 2.0-wrapped `ExtractorAgent` to extract claims using structured outputs.
* `app/services/evidence_retriever.py`: Queries Google Custom Search to retrieve evidence per perspective.
* `app/services/analysis_service.py`: Modernized ADK 2.0-wrapped `AnalysisAgent` logic for perspective, bias, and deception detection with circuit breaker fallback to `gemini-3.1-flash-lite`.
* `app/utils/llm_utils.py`: Shared ADK agent execution utilities (`get_validated_api_key()`, `execute_adk_agent()`).
* `app/utils/prompt_helpers.py`: Shared prompt formatting utility (`build_user_data_prompt()`).
* `app/core/config.py`: `pydantic-settings` configuration.

---

## 4. Coding Conventions & Best Practices

* Use Pydantic models for all request/response schemas.
* Use structured logging via the `logging` module; log details server-side and return generic errors to clients.
* Catch specific exceptions; avoid bare `except` clauses.
* All configuration must pass through `pydantic-settings` and `.env` files — never hardcode secrets.

---

## 5. Backend Testing & Mocking Invariants

* **Local Test Execution**: When running tests locally, always pass dummy environment variables for required credentials:
  ```bash
  GCP_PROJECT=test-project LLM_API_KEY=dummy GOOGLE_API_KEY=dummy GOOGLE_CSE_ID=dummy pytest
  ```
* **Virtual Environment Invocation Path**: Explicitly qualify the path to the virtual environment binary (`backend/venv/bin/python` or `backend/venv/bin/pytest`), rather than using relative `./venv/bin/` paths.
* **Dependency Injection for Settings**: When creating utility classes (e.g. API clients) that require configuration, do not import `app.core.config.settings` directly. Pass `settings` via dependency injection in the constructor (`def __init__(self, settings=None):`).
* **External SDK Mock Safety**: When passing optional `pydantic-settings` fields to external SDKs (like `google.genai.Client`), explicitly type-check values (e.g. `if isinstance(settings.OPTIONAL_URL, str):`) to prevent `TypeError` from `MagicMock` objects.
* **Shared Utility Mock Paths**: ADK `Runner` and `InMemorySessionService` are imported exclusively in `app.utils.llm_utils`. Patch them at `app.utils.llm_utils.Runner` and `app.utils.llm_utils.InMemorySessionService`.
* **Pydantic ClassVar & Defensive Guards**: Constant lookup dictionaries on `BaseSettings` classes MUST be annotated with `typing.ClassVar` (e.g. `TIER_CONCURRENCY_LIMITS: ClassVar[dict[str, int]]`).
* **Comprehensive Provider Environment Cleanup**: Functions configuring provider environment variables (`configure_provider_env()`) MUST pop all stale keys across alternative auth modes (`GCP_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `GCP_LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI`, `GEMINI_API_KEY`, `LLM_API_KEY`).
* **Public Contract & Async Behavioral Testing**: Unit tests verifying concurrency limits MUST assert public attributes (e.g. `service.max_concurrency`) and test actual async acquisition behavior using `asyncio.wait_for`. Never assert private internal attributes like `semaphore._value`.
* **Dynamic Script Settings Instantiation**: Executable scripts and CLI tools (`burst_test.py`, `verify_environment.py`) MUST instantiate `Settings(_env_file=None)` dynamically inside function entrypoints rather than reading top-level cached module imports.
