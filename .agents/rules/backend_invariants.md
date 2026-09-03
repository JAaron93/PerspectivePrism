# Backend Invariants & Development Rules

This document defines the implementation guidelines, security invariants, testing practices, and architecture rules for the Python FastAPI backend (`backend/`).

---

## 1. Environment & Model Invariants

* **Strict Google Gemini & ADK 2.0 Vendor Lock-In**:
  - Exclusively uses **Google ADK 2.0** (`google-adk>=2.4.0`) and the **Google GenAI SDK** (`google-genai>=2.9.0`).
  - Provider & auth mode: Exclusively **GCP Vertex AI Mode** (via `GCP_PROJECT` / `GOOGLE_CLOUD_PROJECT`, `GCP_LOCATION`, and `GEMINI_TIER=paid` with 300+ RPM paid quota). AI Studio API keys and free tier throttles are permanently removed.
  - Allowed models: Gemini 3.x series models only (`gemini-3.8-flash` primary, `gemini-3.1-flash-lite` backup circuit-breaker fallback). Gemini 2.x and non-Google models are prohibited.
  - Forbidden SDKs: `openai`, `AsyncOpenAI`, and legacy `google-generativeai` are permanently forbidden.
* **Strict Non-Blocking Async I/O**:
  - All network I/O operations (LLM generation, Google Custom Search, YouTube transcript fetching) MUST use non-blocking `async`/`await` patterns (`client.aio.models`, `httpx.AsyncClient`, `asyncio.to_thread`).
  - Synchronous blocking network calls inside event loop contexts are strictly prohibited.
* **Zero-Throttling Capability Standards (ADR 006)**:
  - **Mandatory Generation Config Factory**: Every ADK 2.0 `Agent` instance MUST attach a `generate_content_config` created via `build_agent_generation_config(model=..., task_type=..., settings=...)`. Raw `Agent(...)` instantiations without generation configs are strictly prohibited.
  - **Task-Aware Dynamic `thinking_level` Standards**:
    - Deep analytical / extraction / evaluation agents (`extractor`, `analysis`, `alethiology`, `judge`): Must resolve to `thinking_level="HIGH"` (`types.ThinkingLevel.HIGH`) to exploit Gemini 3.8 Flash's native recursive reasoning loops.
    - Micro-tasks / guardrail classifiers (`router`, `classifier`): Must resolve to `thinking_level="LOW"` (`types.ThinkingLevel.LOW`) and `max_output_tokens=2048` to preserve sub-second latency and avoid token inflation.
  - **Output Ceilings & HTTP Timeout Runway**:
    - Analytical agents must configure `max_output_tokens=65536` (64K ceiling).
    - Request HTTP options must configure `timeout=120.0` (`types.HttpOptions(timeout=120.0)` via `Settings.GEMINI_HTTP_TIMEOUT`) to prevent premature cancellation of multi-step internal reasoning trajectories.
  - **Thought Signature & Thinking Preservation**:
    - Telemetry processors, audit loggers, and trace sanitizers must exempt keys in `EXCLUDED_TELEMETRY_KEYS` (`thought`, `thoughts`, `thought_tokens`, `thought_signature`, `think`, `reasoning`) from redaction or deletion.
  - **Lean Prompt Scaffolding**:
    - Prohibit defensive chain-of-thought instructions ("think step-by-step", forced XML reflection blocks) that duplicate native model reasoning tokens. Agent system prompts must remain strictly focused on their role directives and Pydantic schema constraints.

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
* **Red-Team Suite Execution**: Run `pytest -m redteam` from `backend/` to execute the offline prompt-injection corpus validation and sanitizer probe with zero network calls and deterministic fixtures.
* **Live Red-Team Probe & Budget Accounting**: Live injection probe runs (`run_live_probe_payload`, `run_live_probe_corpus`) MUST enforce atomic budget token consumption on *every* individual provider request (primary agents, `AnalysisService` backup model fallbacks, and Tier 3 Agent-as-a-Judge calls) using a `ContextVar`-scoped `BudgetCounter`. Service fallback paths MUST halt without issuing unbudgeted secondary calls when the cap is exhausted.
* **Single-Attempt Probe Scoping**: Live probe execution MUST scope single-attempt constraints (`max_attempts=1`) strictly to active probe budget contexts, preserving standard retry configurations (`max_attempts=2`) for normal non-probe application traffic.
* **Canary Attribution & Agent Isolation**: Live probe runs MUST inject per-task canary tokens via cloned `Agent` instances (`_clone_agent_with_canary`) rather than mutating shared service instances in-place, preventing canary accumulation and attribution cross-contamination across sequential or concurrent executions.
* **Agent-as-a-Judge Adversarial Isolation**: When using `gemini-3.8-flash` as a Tier 3 Agent-as-a-Judge evaluator, candidate attack text and output MUST be sanitized, delimiter markers escaped, wrapped in per-request random nonce delimiters (`===JUDGE DATA <nonce> START/END===`), and the judge system instruction MUST explicitly bind the specific nonce and declare candidate directives strictly inert.
* **Dynamic Nonce Prompt Delimiters**: `build_user_data_prompt()` and `wrap_user_data()` MUST wrap untrusted user data in per-request cryptographic random nonces (`===USER DATA <nonce> START===` / `===USER DATA <nonce> END===`), rendering embedded static delimiter forgeries inert and preventing prompt breakouts.
* **Unicode NFKC Normalization**: `sanitize_input()` MUST apply `unicodedata.normalize("NFKC", text)` prior to regex pattern and control character matching to collapse full-width Latin, circled/enclosed characters, and compatibility homoglyphs to ASCII before denylist evaluation.
* **Red-Team Report Confidentiality & Baseline Omission Tracking**: Red-team reports (`redteam-report.json`, `redteam-report.md`) MUST reference corpus-relative payload IDs only with zero raw payload text. Baseline diff comparisons (`diff_against_baseline`) MUST treat removed/omitted baselined payloads as regressions to prevent silent security test coverage loss. Baseline updates MUST be strictly explicit (`--update-baseline`).
* **Circuit Breaker Half-Open Probe Isolation**: In circuit breaker implementations with half-open probing (`cb_half_open`, `cb_probing`), single-probe ownership must be assigned exclusively to the initiating request (`is_probe = True`) within the lock. In-flight non-probe requests completing while `cb_half_open == True` must NEVER transition the breaker or mutate `cb_half_open`/`cb_probing`/`cb_failures`. Only the designated probe caller (`if is_probe:`) is authorized to close or reopen the circuit breaker upon completion.

---

## 6. Pre-Classification Guardrail Gate Invariants

* **Mandatory Metadata Sanitization**: All client-extracted video metadata (`title`, `channel_name`, `tags`, `description_snippet`) MUST pass through `input_sanitizer.py` (`prism_sanitizer_rs`) before being processed by `PreClassifierService` or any LLM agent.
* **Deterministic Fast-Path Preconditions**: Zero-token early exits (`is_analysable = False`, `confidence = 1.0`) MUST verify:
  1. The transcript is absent or empty (`transcript is None or transcript.strip() == ""`),
  2. The YouTube category is strictly non-analytical (`Music`, `Gaming`), AND
  3. Video metadata (`title`, `channel_name`, `tags`, `description_snippet`) contains NO political, electoral, policy, or socio-economic keywords.
* **Conservative Ambiguity Fallback**: If the `PreClassifierAgent` returns `is_analysable == False` but `confidence_score < 0.70`, the backend MUST automatically default to allowing analysis (`is_analysable = True`).
* **Force Override Bypass**: When `VideoRequest.force_override == True`, the Pre-Classification Gate MUST be completely bypassed.
* **Unicode NFKC Keyword Normalization**: Prior to evaluating any deterministic fast-path keyword filter or metadata regex denylist, all metadata fields (`title`, `channel_name`, `description_snippet`, `tags`) and category strings MUST undergo Unicode NFKC normalization (`unicodedata.normalize("NFKC", text)`) to collapse full-width Latin (e.g. `Ｅｌｅｃｔｉｏｎ`), circled characters, and compatibility homoglyphs before regex scanning.
* **Transcript Retrieval Error Isolation (No Caption Absence Masking)**: In background job processing and pre-classification orchestration, pipelines MUST strictly differentiate genuine caption unavailability (`TranscriptsDisabled`, `NoTranscriptFound`, `TranscriptUnavailableError`) from transient network, rate-limit, or provider retrieval failures (`TranscriptRetrievalError`, `HTTPError`, `RequestBlocked`). Transient errors MUST fail the job with the underlying error cause and MUST NEVER be masked as empty transcripts triggering non-speech deterministic early-exit disclaimers.

---

## 7. Alethiology Specialist Agent Invariants

* **6 Canonical Truth Frameworks**: Truth theory classifications must strictly adhere to the 6 defined types: `Correspondence (Empirical)`, `Coherence (Systemic Narrative)`, `Pragmatic (Practical Utility)`, `Perspectivism (Lived Experience)`, `Consensus (Institutional Agreement)`, and `Deflationary (Rhetorical Endorsement)`.
* **Strict Descriptive Neutrality (CRITICAL)**: The agent MUST remain strictly descriptive and neutral. It is strictly prohibited from evaluating whether a truth theory is "better", "more rational", or "sound", and must never accuse speakers of fallacies or falsehoods.
* **Unified Single-Phase Concurrency**: Perspective analyses, bias & deception analysis, and alethiology analysis MUST be dispatched concurrently in a single unified `asyncio.gather(*analysis_tasks, analysis_service.analyze_bias_and_deception(claim), analysis_service.analyze_alethiology(claim))` phase, eliminating sequential stage latency.
* **Failure State Fidelity (No Default Theory Fabrication)**: When input sanitization or non-budget model calls fail, `analyze_alethiology()` MUST return `None` (or an explicit unavailable state). Services and pipelines are strictly prohibited from fabricating a default valid classification (e.g. `Correspondence (Empirical)`).
