# Requirements Document: ADK 2.0 & Gemini Interactions API Modernization

## 1. Functional Requirements (FR)

*   **FR-1: SDK Migration**
    *   The backend MUST use `google-genai` (>=2.3.0) and `google-adk` (>=2.0.0).
    *   The `openai` and `google-generativeai` packages MUST be uninstalled and completely removed from the codebase.
*   **FR-2: ADK 2.0 Agent Wrapping**
    *   The core logic for claim extraction MUST be wrapped in an explicit ADK 2.0 `Agent` class (e.g., `ExtractorAgent`).
    *   The core logic for perspective and bias analysis MUST be wrapped in explicit ADK 2.0 `Agent` classes (e.g., `AnalysisAgent`).
*   **FR-3: Interactions API Adoption**
    *   All LLM calls MUST be routed through the `client.interactions.create` endpoint (either directly or abstracted via ADK model wrappers).
    *   The primary model for all backend operations MUST be `gemini-3.5-flash`.
*   **FR-4: Structured Outputs Integration**
    *   The ADK `ExtractorAgent` MUST extract a list of claims adhering to a strict JSON structure derived from a Pydantic schema using the `response_format` attribute.
    *   The ADK `AnalysisAgent` MUST return `PerspectiveAnalysis` and `BiasAnalysis` strictly conforming to Pydantic schemas via the `response_format` attribute, bypassing manual JSON validation.
*   **FR-5: Implicit Context Caching Optimization**
    *   In `claim_extractor.py`, the large video transcript MUST be positioned at the absolute start of the prompt.
    *   In `analysis_service.py`, retrieved evidence and claim contexts MUST be positioned at the absolute start of the prompt.
*   **FR-6: Circuit Breaker Fallback**
    *   The circuit breaker MUST catch `google-genai` SDK specific exceptions.
    *   When the circuit breaker is tripped, the system MUST fallback to the backup model: `gemini-3.1-flash-lite`.

## 2. Non-Functional Requirements (NFR)

*   **NFR-1: Backward Compatibility**
    *   The modifications MUST NOT alter the JSON response schema exposed by the FastAPI endpoints. The Chrome Extension and Frontend MUST continue to function without any changes to their client code.
*   **NFR-2: Performance & Cost**
    *   The system MUST run efficiently on both the Free and Paid tiers of the Gemini API. For paid tier users, the prompt restructuring MUST maximize implicit cache hits for transcripts and evidence.

## 3. User Stories (US)

*   **US-1:** As a developer running on the free tier, I want the extension to function correctly using the new Interactions API without requiring explicit cache management, even if the processing time is standard.
*   **US-2:** As a power user on the paid tier, I want the extension to automatically leverage context caching for large video transcripts to significantly lower API costs and speed up claim extraction and analysis.

## 4. TDD / BDD Constraints

*   **BDD-1:** 
    *   `Given` a large YouTube transcript (> 4096 tokens),
    *   `When` processed by the Extractor Agent in successive calls,
    *   `Then` the usage logs should reflect cache hits (`cached_content_token_count` > 0).
*   **BDD-2:**
    *   `Given` a claim analysis request,
    *   `When` the Gemini API responds,
    *   `Then` the output must be automatically marshaled into a valid Pydantic model without manual JSON parsing errors.
