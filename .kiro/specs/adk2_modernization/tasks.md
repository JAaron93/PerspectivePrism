# Tasks Document: ADK 2.0 & Gemini Interactions API Modernization

## Overview
This document breaks down the modernization effort into actionable, test-driven execution tracks based on `requirements.md`.

## Execution Tracks

### Track 1: Setup & Dependencies
*   **Task 1.1: Dependency Overhaul & Synchronization**
    *   **Description:** Update dependency files to add `google-genai` (`>=2.3.0,<3.0.0`), `google-adk` (`>=2.0.0,<3.0.0`), and `maturin`. 
    *   **Dependency Source of Truth:** `backend/requirements.txt` is the authoritative source for pinned versions to guarantee deterministic builds in CI and container builds. `backend/pyproject.toml` is used for packaging metadata and unpinned project dependencies. 
    *   **Execution:** Update both files to ensure they are synchronized. Local installations MUST use `pip install -r requirements.txt -e .` to link the environment correctly. CI and container builds MUST run off the pinned `requirements.txt`.
    *   **Traceability:** FR-1, NFR-3
    *   **Dependencies:** None

### Track 2: Core Refactoring (ADK 2.0 & Caching)
> [!TIP] PARALLEL EXECUTION
> Tasks 2.1 and 2.2 can be worked on concurrently as they affect separate service files.

*   **Task 2.1: Modernize `claim_extractor.py` (ExtractorAgent)**
    *   **Description:** 
        *   Refactor extraction logic into an explicit ADK 2.0 `Agent` class (`ExtractorAgent`).
        *   **Integration Boundary & Flow:** Configure the `ExtractorAgent` with ADK `output_schema=ClaimsOutput`. Under the hood, pass the `ClaimsOutput` JSON schema through `client.interactions.create` using `response_format` (with `mime_type="application/json"`) for the wire request. Keep the validation at this agent level, while FastAPI validates only the final `response_model` returned to the API client.
        *   Implement validation using `ClaimsOutput.model_validate_json(...)` or ADK's native Pydantic marshaller.
        *   **Error / Parity Handling:** If the LLM output is malformed, incomplete, or schema-invalid, log the failure and implement a single retry with a corrected instruction payload before failing structured execution.
        *   Reorder the prompt string so that `formatted_transcript` is at the absolute beginning of the prompt, enclosed in untrusted data delimiters (`===USER DATA START===` ... `===USER DATA END===`), followed by instructions.
        *   **Data Privacy, Governance & Logging:** Explicitly configure `client.interactions.create` with security boundaries. No raw transcript text or user metadata is logged to backend standard outputs. Any logging of retry attempts or diagnostics MUST be aggregate-only (e.g. token counts) or redacted. Raw stack traces containing prompts must be treated as non-persistent, console-only debug output and excluded from backend persistent logs. Note that `store=false` (disabling session persistence) will be used to protect user data privacy, but implicit caching will remain fully functional.
    *   **Traceability:** FR-2, FR-3, FR-4, FR-5, US-2
    *   **Dependencies:** Task 1.1

*   **Task 2.2: Modernize `analysis_service.py` (AnalysisAgent)**
    *   **Description:**
        *   Refactor analysis logic into explicit ADK 2.0 `Agent` classes (`AnalysisAgent`).
        *   **Integration Boundary & Flow:** Configure `AnalysisAgent` with `output_schema` mapping to `PerspectiveAnalysis` and `BiasAnalysis`. Under the hood, pass the corresponding JSON schemas through `client.interactions.create` via `response_format`. FastAPI will validate only the final `response_model`.
        *   Use `PerspectiveAnalysis.model_validate_json(...)` and `BiasAnalysis.model_validate_json(...)` to parse results.
        *   **Error / Parity Handling:** Handle schema-invalid responses by logging the raw trace and executing a single retry.
        *   Reorder the prompt string so that retrieved evidence and claim contexts are at the absolute beginning of the prompt, enclosed in untrusted data delimiters, followed by instructions.
        *   **Data Privacy, Governance & Logging:** Enforce aggregate-only logging (token counts and latency metrics). Transcripts and parsed evidence must never be persisted in long-term application logs. Raw traces must be treated as non-persistent, console-only debug output.
    *   **Traceability:** FR-2, FR-3, FR-4, FR-5, US-2
    *   **Dependencies:** Task 1.1

### Track 3: Resilience & Fallback
*   **Task 3.1: Circuit Breaker Updates**
    *   **Description:** Refactor the circuit breaker logic in `analysis_service.py` to catch `google-genai` exceptions instead of OpenAI exceptions.
    *   **Description:** Handle ONLY transient exceptions (e.g., rate limits/429, temporary server errors/500/503). Explicitly EXCLUDE authentication (401), configuration (400), invalid-request (400), and content-safety/moderation failures.
    *   **Description:** Trip the circuit breaker after 3 consecutive failures. Define a reset window of 60 seconds.
    *   **Description:** Ensure the fallback logic correctly targets the `gemini-3.1-flash-lite` model when the primary model fails.
    *   **Description:** If the backup model ALSO fails, raise a dedicated `AnalysisServiceError` and log the failures.
    *   **Traceability:** FR-6
    *   **Dependencies:** Task 2.2

### Track 4: Rust Sanitization (PyO3)
*   **Task 4.1: Initialize Rust Extension**
    *   **Description:** Run `maturin init` in the backend to create a `prism_sanitizer_rs` crate. Update PyProject/Cargo to configure PyO3 bindings.
    *   **Traceability:** FR-7, NFR-3
    *   **Dependencies:** Task 1.1
*   **Task 4.2: Port Sanitization Logic**
    *   **Description:** Implement `contains_control_characters`, `contains_suspicious_patterns`, and `escape_special_characters` in Rust using the `regex` crate for maximum speed.
    *   **Description:** **Rejection Path PyO3 Mapping:** Ensure that inputs violating control character checks or matching suspicious injection patterns trigger a PyO3 python exception mapping directly to Python's `SanitizationError` with identical message texts matching the legacy Python implementation (preserving phrases like "control character" and specific pattern warnings).
    *   **Description:** For accepted inputs, ensure the Rust implementation of `escape_special_characters` produces identical character replacement output matching the Python logic.
    *   **Traceability:** FR-7
    *   **Dependencies:** Task 4.1
*   **Task 4.3: Integrate with Python**
    *   **Description:** Update `app/utils/input_sanitizer.py` to import and call the Rust module. Ensure the Python tests for sanitization still pass seamlessly.
    *   **Traceability:** FR-7, BDD-3
    *   **Dependencies:** Task 4.2

### Track 5: Verification & TDD/BDD
*   **Task 5.1: Automated Test Verification**
    *   **Description:** Run the existing test suite (`pytest`) to ensure no regressions occur.
    *   **Description:** Add an end-to-end integration test covering both the outbound schema registration and the returned payload shape.
    *   **Description:** Specifically verify that input sanitization logic still protects all LLM calls (via the new Rust layer).
    *   **Traceability:** FR-4, NFR-1, BDD-3
    *   **Dependencies:** Task 2.1, Task 2.2, Task 3.1, Task 4.3
*   **Task 5.2: End-to-End & Caching Validation**
    *   **Description:** Run the backend server locally and submit a large YouTube transcript via the Chrome Extension.
    *   **Description:** Validate caching via an opt-in live smoke test using `usage.total_cached_tokens` telemetry when available. Core CI runs must use mocked telemetry.
    *   **Transcript Tokenization Validation:** The live smoke test MUST calculate the exact token length of the YouTube transcript fixture using the target model's tokenizer (or local count approximation via `google-genai` SDK's count_tokens API) and assert it exceeds 4096 tokens before running the cache-hit test. Reject the test run with a descriptive error if the fixture is under 4096 tokens.
    *   **Measurable Validation Metrics (Live Smoke Test):**
        *   **Baseline:** Execute a cold run on a 20,000-character transcript (zero cache). Note overall latency (Expected: ~8-12 seconds).
        *   **Warm-up:** Run the same transcript again within a 5-minute window to trigger implicit caching.
        *   **Sample Size:** Run 5 distinct tests to collect p50 and p95 latency targets.
        *   **Targets:** 
            *   p50 Latency (Cached): < 3.0 seconds (vs. cold baseline).
            *   p95 Latency (Cached): < 4.5 seconds.
            *   Minimum Cache-Hit Threshold: `usage.total_cached_tokens` must represent >= 90% of the input prompt tokens.
    *   **Traceability:** BDD-1, BDD-2, US-3
    *   **Dependencies:** Task 5.1
