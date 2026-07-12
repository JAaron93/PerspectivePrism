# Tasks Document: ADK 2.0 & Gemini Interactions API Modernization

## Overview
This document breaks down the modernization effort into actionable, test-driven execution tracks based on `requirements.md`.

## Execution Tracks

### Track 1: Setup & Dependencies
*   **Task 1.1: Dependency Overhaul**
    *   **Description:** Update `requirements.txt`. Uninstall `openai` and `google-generativeai`. Install `google-genai`, `google-adk`, and `maturin`.
    *   **Traceability:** FR-1, NFR-3
    *   **Dependencies:** None

### Track 2: Core Refactoring (ADK 2.0 & Caching)
> [!TIP] PARALLEL EXECUTION
> Tasks 2.1 and 2.2 can be worked on concurrently as they affect separate service files.

*   **Task 2.1: Modernize `claim_extractor.py` (ExtractorAgent)**
    *   **Description:** 
        *   Refactor extraction logic into an explicit ADK 2.0 `Agent` class (`ExtractorAgent`).
        *   **Integration Boundary:** The `ExtractorAgent` owns prompt assembly, schema injection (via the `output_schema` attribute), and parsing validation. The ADK runtime layer wraps the model calls and is configured with standard retry policies for transient network errors.
        *   Configure the structured output to target `ClaimsOutput` with `application/json` format.
        *   Implement validation using `ClaimsOutput.model_validate_json(...)` or ADK's native Pydantic marshaller.
        *   **Error / Parity Handling:** If the LLM output is malformed, incomplete, or schema-invalid, log the failure and implement a single retry with a corrected instruction payload before failing structured execution.
        *   Reorder the prompt string so that `formatted_transcript` is at the absolute beginning of the prompt, enclosed in untrusted data delimiters (`===USER DATA START===` ... `===USER DATA END===`), followed by instructions.
        *   **Data Privacy & Governance:** Explicitly configure `client.interactions.create` with security boundaries. Ensure no transcript text or user metadata is logged to backend standard outputs. Verify that any logging is aggregate-only (e.g. token counts). Note that `store=false` (disabling session persistence) will be used to protect user data privacy, but implicit caching will remain fully functional.
    *   **Traceability:** FR-2, FR-3, FR-4, FR-5, US-2
    *   **Dependencies:** Task 1.1

*   **Task 2.2: Modernize `analysis_service.py` (AnalysisAgent)**
    *   **Description:**
        *   Refactor analysis logic into explicit ADK 2.0 `Agent` classes (`AnalysisAgent`).
        *   **Integration Boundary:** The `AnalysisAgent` owns prompt assembly, schema injection (via `output_schema` mapping to `PerspectiveAnalysis` and `BiasAnalysis`), and error parsing. The low-level API call routes through `genai.Client.interactions.create` wrapped by the ADK agent runtime.
        *   Use `PerspectiveAnalysis.model_validate_json(...)` and `BiasAnalysis.model_validate_json(...)` to parse results.
        *   **Error / Parity Handling:** Handle schema-invalid responses by logging the raw trace and executing a single retry.
        *   Reorder the prompt string so that retrieved evidence and claim contexts are at the absolute beginning of the prompt, enclosed in untrusted data delimiters, followed by instructions.
        *   **Data Privacy & Governance:** Enforce aggregate-only logging (token counts and latency metrics). Transcripts and parsed evidence must never be persisted in long-term application logs.
    *   **Traceability:** FR-2, FR-3, FR-4, FR-5, US-2
    *   **Dependencies:** Task 1.1

### Track 3: Resilience & Fallback
*   **Task 3.1: Circuit Breaker Updates**
    *   **Description:** Refactor the circuit breaker logic in `analysis_service.py` to catch `google-genai` exceptions instead of OpenAI exceptions.
    *   **Description:** Ensure the fallback logic correctly targets the `gemini-3.1-flash-lite` model when the primary model fails.
    *   **Traceability:** FR-6
    *   **Dependencies:** Task 2.2

### Track 4: Rust Sanitization (PyO3)
*   **Task 4.1: Initialize Rust Extension**
    *   **Description:** Run `maturin init` in the backend to create a `prism_sanitizer_rs` crate. Update PyProject/Cargo to configure PyO3 bindings.
    *   **Traceability:** FR-7, NFR-3
    *   **Dependencies:** Task 1.1
*   **Task 4.2: Port Sanitization Logic**
    *   **Description:** Implement `contains_control_characters`, `contains_suspicious_patterns`, and `escape_special_characters` in Rust using the `regex` crate for maximum speed. Ensure replacement parity for escaped characters.
    *   **Traceability:** FR-7
    *   **Dependencies:** Task 4.1
*   **Task 4.3: Integrate with Python**
    *   **Description:** Update `app/utils/input_sanitizer.py` to import and call the Rust module. Ensure the Python tests for sanitization still pass seamlessly.
    *   **Traceability:** FR-7, BDD-3
    *   **Dependencies:** Task 4.2

### Track 5: Verification & TDD/BDD
*   **Task 5.1: Automated Test Verification**
    *   **Description:** Run the existing test suite (`pytest`) to ensure no regressions occur.
    *   **Description:** Specifically verify that input sanitization logic still protects all LLM calls (via the new Rust layer).
    *   **Traceability:** NFR-1, BDD-3
    *   **Dependencies:** Task 2.1, Task 2.2, Task 3.1, Task 4.3
*   **Task 5.2: End-to-End & Caching Validation**
    *   **Description:** Run the backend server locally and submit a large YouTube transcript via the Chrome Extension.
    *   **Description:** Validate caching by inspecting Interactions API responses and verifying `usage.total_cached_tokens` > 0.
    *   **Measurable Validation Metrics:**
        *   **Baseline:** Execute a cold run on a 20,000-character transcript (zero cache). Note overall latency (Expected: ~8-12 seconds).
        *   **Warm-up:** Run the same transcript again within a 5-minute window to trigger implicit caching.
        *   **Sample Size:** Run 5 distinct tests to collect p50 and p95 latency targets.
        *   **Targets:** 
            *   p50 Latency (Cached): < 3.0 seconds (vs. cold baseline).
            *   p95 Latency (Cached): < 4.5 seconds.
            *   Minimum Cache-Hit Threshold: `usage.total_cached_tokens` must represent >= 90% of the input prompt tokens.
    *   **Traceability:** BDD-1, BDD-2, US-3
    *   **Dependencies:** Task 5.1
