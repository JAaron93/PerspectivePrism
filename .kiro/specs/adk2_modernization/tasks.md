# Tasks Document: ADK 2.0 & Gemini Interactions API Modernization

## Overview
This document breaks down the modernization effort into actionable, test-driven execution tracks based on `requirements.md`.

## Execution Tracks

### Track 1: Setup & Dependencies
*   **Task 1.1: Dependency Overhaul**
    *   **Description:** Update `requirements.txt`. Uninstall `openai` and `google-generativeai`. Install `google-genai` and `google-adk`.
    *   **Traceability:** FR-1
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

### Track 4: Verification & TDD/BDD
*   **Task 4.1: Automated Test Verification**
    *   **Description:** Run the existing test suite (`pytest`) to ensure no regressions occur.
    *   **Description:** Specifically verify that input sanitization logic still protects all LLM calls.
    *   **Traceability:** NFR-1
    *   **Dependencies:** Task 2.1, Task 2.2, Task 3.1
*   **Task 4.2: End-to-End & Caching Validation**
    *   **Description:** Run the backend server locally and submit a large YouTube transcript via the Chrome Extension.
    *   **Description:** Monitor the backend logs to confirm `usage_metadata` reports implicit cache hits.
    *   **Traceability:** BDD-1, BDD-2
    *   **Dependencies:** Task 4.1
