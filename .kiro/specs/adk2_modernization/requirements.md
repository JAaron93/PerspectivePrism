# Requirements Document: ADK 2.0 & Gemini Interactions API Modernization

## 1. Functional Requirements (FR)

*   **FR-1: SDK Migration & Compatibility Range**
    *   The backend MUST use the `google-genai` SDK within the bounded range `>=2.3.0,<3.0.0`.
    *   The backend MUST use `google-adk` within the bounded range `>=2.0.0,<3.0.0`.
    *   The legacy `openai` and `google-generativeai` packages MUST be uninstalled and completely removed from the codebase.
    *   Dependency resolution MUST be locked in `requirements.txt` and verified in CI to ensure dependencies remain strictly within these supported ranges.
*   **FR-2: ADK 2.0 Agent Wrapping**
    *   The core logic for claim extraction MUST be wrapped in an explicit ADK 2.0 `Agent` class (e.g., `ExtractorAgent`).
    *   The core logic for perspective and bias analysis MUST be wrapped in explicit ADK 2.0 `Agent` classes (e.g., `AnalysisAgent`).
*   **FR-3: Interactions API Adoption**
    *   All LLM calls MUST be routed through the `client.interactions.create` endpoint (either directly or abstracted via ADK model wrappers).
    *   The primary model for all backend operations MUST be `gemini-3.5-flash`.
*   **FR-4: Structured Outputs Integration**
    *   The integration flow MUST adhere to the following mapping:
        1. Configure each ADK agent with a Pydantic schema using the ADK `output_schema` attribute (e.g., `ExtractorAgent(..., output_schema=ClaimsOutput)`).
        2. Pass the corresponding schema through `client.interactions.create` using `response_format` (with `mime_type="application/json"`) for the low-level wire request.
        3. Keep the parsing and raw validation at the agent/client interface level, and let FastAPI validate only the final `response_model` returned to the API client.
    *   The `ExtractorAgent` claims output and `AnalysisAgent` `PerspectiveAnalysis`/`BiasAnalysis` MUST conform to these schemas, eliminating manual JSON string parsing.
    *   We MUST include an end-to-end integration test covering both the outbound schema registration and the returned payload shape.
*   **FR-5: Implicit Context Caching Optimization**
    *   In `claim_extractor.py`, the large video transcript MUST be positioned at the absolute start of the prompt payload, enclosed within clear untrusted data delimiters (e.g., `===USER DATA START===` and `===USER DATA END===`), with the task instructions placed *after* the delimited block.
    *   In `analysis_service.py`, retrieved evidence and claim contexts MUST be positioned at the absolute start of the prompt payload, enclosed within the same clear untrusted data delimiters, with the task instructions placed *after* the delimited block.
*   **FR-6: Circuit Breaker Fallback**
    *   The circuit breaker MUST catch `google-genai` SDK specific exceptions.
    *   The retryable exception set MUST handle ONLY transient exceptions (e.g., rate limits/429, temporary server errors/500/503).
    *   The exception set MUST explicitly EXCLUDE authentication (401), configuration (400), invalid-request (400), and content-safety/moderation failures.
    *   The circuit breaker MUST trip after 3 consecutive transient failures, with a reset window of 60 seconds.
    *   When the circuit breaker is tripped, the system MUST fallback to the backup model: `gemini-3.1-flash-lite`.
    *   If the backup model ALSO fails, the system MUST raise a dedicated service-level exception (`AnalysisServiceError`) and log the diagnostic failures.
*   **FR-7: Rust Sanitization Module & Rejection Parity**
    *   The backend MUST implement the core input sanitization logic as a compiled Rust extension using `PyO3` and `maturin`.
    *   The extension MUST handle control character detection and regex-based suspicious pattern matching to reduce processing latency on large transcripts.
    *   The extension MUST achieve strict rejection-behavior parity with `backend/app/utils/input_sanitizer.py`:
        *   **Regex Parity:** The Rust module MUST use the exact same suspicious-pattern set and case-insensitive regex matching.
        *   **Control Character Parity:** The control character detection MUST utilize the same character whitelist (allowing only tab `\t`, newline `\n`, carriage return `\r`) and reject other control characters.
        *   **Error Outcomes:** Rejection outcomes MUST raise a Python-compatible `SanitizationError` with identical message text (e.g., preserving messages such as `"Claim text contains invalid control characters"` or `"input contains patterns that may indicate a prompt injection attempt"`), covering all existing Python security tests without behavioral divergence.
        *   **Escaping Semantics:** The Rust extension MUST implement `escape_special_characters` with identical replacement semantics as the Python original ONLY for inputs accepted for escaping:
            *   Normalize newlines: `\r\n` -> `\n`, `\r` -> `\n`.
            *   Escape backslashes: `\` -> `\\`.
            *   Escape quotes: `"` -> `\"`, `'` -> `\'`.
            *   Escape curly braces: `{` -> `\{`, `}` -> `\}`.

## 2. Non-Functional Requirements (NFR)

*   **NFR-1: Backward Compatibility**
    *   The modifications MUST NOT alter the JSON response schema exposed by the FastAPI endpoints. The Chrome Extension and Frontend MUST continue to function without any changes to their client code.
*   **NFR-2: Performance & Cost**
    *   The system MUST run efficiently on both the Free and Paid tiers of the Gemini API. For paid tier users, the prompt restructuring MUST maximize implicit cache hits for transcripts and evidence.
    *   The Rust sanitization layer MUST significantly out-perform the legacy pure Python implementation on strings exceeding 10,000 characters.
*   **NFR-3: Build Toolchain**
    *   The project MUST gracefully document the introduction of the Rust toolchain (`cargo`, `rustc`) and `maturin` needed for backend development and deployment.

## 3. User Stories (US)

*   **US-1:** As a developer running on the free tier, I want the extension to function correctly using the new Interactions API without requiring explicit cache management, even if the processing time is standard.
*   **US-2:** As a power user on the paid tier, I want the extension to automatically leverage context caching for large video transcripts to significantly lower API costs and speed up claim extraction and analysis.
*   **US-3:** As a user navigating a YouTube page, I want the backend latency reduced so that the initial claims extraction phase is noticeably faster.

## 4. TDD / BDD Constraints

*   **BDD-1:** 
    *   `Given` a large YouTube transcript (> 4096 tokens) is submitted for analysis,
    *   `When` processed by the Extractor Agent in successive calls (within a short window to simulate a cache warm-up),
    *   `Then` cache hits MUST be validated ONLY by an opt-in live smoke test (not a mandatory CI pass/fail assertion). CI tests MUST use mocked telemetry.
    *   The live smoke test MUST record and assert the cache-hit rate when `usage.total_cached_tokens` telemetry is available from the API.
*   **BDD-2:**
    *   `Given` a claim analysis request,
    *   `When` the Gemini API responds,
    *   `Then` the output must be automatically marshaled into a valid Pydantic model without manual JSON parsing errors.
*   **BDD-3:**
    *   `Given` a 50,000 character transcript containing a prompt injection attempt and control characters,
    *   `When` passed to `sanitize_input` (both before and after the Rust migration),
    *   `Then` the Rust module MUST quickly detect and reject it exactly as the Python version did (raising `SanitizationError` with identical message text), producing identical escaped output for non-rejected payloads and passing all existing `pytest` security cases.
