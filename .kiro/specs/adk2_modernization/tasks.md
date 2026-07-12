# Tasks Document: ADK 2.0 & Gemini Interactions API Modernization

## Overview
This document breaks down the modernization effort into actionable, test-driven execution tracks based on `requirements.md`.

## Execution Tracks

### Track 1: Setup & Dependencies
*   **Task 1.1: Dependency Overhaul**
    *   **Description:** Update `requirements.txt`. Uninstall `openai` and `google-generativeai`. Install `google-genai`, `google-adk`, and `maturin`.
    *   **Traceability:** FR-1, NFR-3
    *   **Dependencies:** None

### Track 2: Core Refactoring
> [!TIP] PARALLEL EXECUTION
> Tasks 2.1 and 2.2 can be worked on concurrently as they affect separate service files.

*   **Task 2.1: Modernize `claim_extractor.py` (ADK Agent)**
    *   **Description:** 
        *   Refactor the extraction logic into an explicit ADK 2.0 `Agent` class (e.g., `ExtractorAgent`).
        *   Replace `AsyncOpenAI` instantiation with `genai.Client`.
        *   Implement `client.interactions.create` targeting `gemini-3.5-flash`.
        *   Inject a Pydantic schema for `ClaimsOutput` in `response_format`.
        *   Reorder the prompt string so that `formatted_transcript` is at the absolute beginning of the string to optimize for implicit caching.
    *   **Traceability:** FR-2, FR-3, FR-4, FR-5, US-2
    *   **Dependencies:** Task 1.1

*   **Task 2.2: Modernize `analysis_service.py` (ADK Agent)**
    *   **Description:**
        *   Refactor the analysis logic into explicit ADK 2.0 `Agent` classes (e.g., `AnalysisAgent`).
        *   Replace `AsyncOpenAI` instantiation with `genai.Client`.
        *   Implement `client.interactions.create` targeting `gemini-3.5-flash`.
        *   Inject Pydantic schemas for `PerspectiveAnalysis` and `BiasAnalysis` in `response_format`.
        *   Reorder the prompt string so that evidence text and claim context are at the absolute beginning of the string.
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
    *   **Description:** Implement `contains_control_characters`, `contains_suspicious_patterns`, and `escape_special_characters` in Rust using the `regex` crate for maximum speed.
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
    *   **Description:** Monitor the backend logs to confirm `usage_metadata` reports implicit cache hits, and note the reduced latency.
    *   **Traceability:** BDD-1, BDD-2, US-3
    *   **Dependencies:** Task 5.1
