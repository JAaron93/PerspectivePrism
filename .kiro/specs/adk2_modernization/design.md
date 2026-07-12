# Design Document: ADK 2.0 & Gemini Interactions API Modernization

## 1. Overview
PerspectivePrism currently utilizes an older OpenAI-compatible shim and deprecated Generative AI SDKs to power its LLM features. This project modernizes the backend architecture by adopting the new `google-genai` SDK (Interactions API), `google-adk` 2.0, and `gemini-3.5-flash`. The upgrade aims to natively support Structured Outputs and leverage implicit Context Caching to improve speed and reduce costs for users on the paid tier. Furthermore, the services will be refactored into explicit ADK 2.0 `Agent` classes to align with modern multi-agent patterns.

## 2. Architecture Changes
*   **SDK Replacement:** Completely remove `openai` and `google-generativeai` from the stack. Introduce `google-genai>=2.3.0` and `google-adk>=2.0.0`.
*   **Implicit Context Caching:** The Interactions API provides implicit context caching (minimum 4096 tokens for Gemini 3.5 Flash). To optimize for this, all prompt structures in the backend must be refactored to place large, static data (like the video transcript or retrieved evidence context) at the very beginning of the prompt payload.
*   **Structured Outputs:** Remove manual JSON parsing, regex matching, and validation logic. Utilize the Interactions API's native Pydantic schema injection via the `response_format` configuration.
*   **ADK 2.0 Multi-Agent Pattern:** The core extraction and analysis logic will be wrapped in formal `google.adk.agents.Agent` implementations. This lays the groundwork for more complex workflow orchestrations (e.g., ADK graphs) in the future.

## 3. Component Design

### 3.1 Claim Extractor Agent (`claim_extractor.py`)
*   **Current State:** Uses `AsyncOpenAI` with `response_format={"type": "json_object"}` inside a service class.
*   **Future State:** Will be refactored into an explicit ADK `ExtractorAgent`. It will use `client.interactions.create` under the hood (or via ADK model bindings) targeting `gemini-3.5-flash`. It will inject a Pydantic model (`ClaimsOutput`) to enforce the schema. The `formatted_transcript` will be moved to the absolute beginning of the `input` to ensure it hits the implicit cache when processed iteratively.

### 3.2 Perspective & Bias Analysis Agent (`analysis_service.py`)
*   **Current State:** Uses `AsyncOpenAI` for both primary and fallback LLMs within a circuit breaker inside a service class.
*   **Future State:** Will be refactored into explicit ADK `AnalysisAgent` instances. Native Structured Outputs will enforce `PerspectiveAnalysis` and `BiasAnalysis` schemas. Evidence text and claim context will be front-loaded in the prompt for caching.
*   **Circuit Breaker:** Will be updated to catch `google-genai` SDK exceptions and gracefully fall back to `gemini-3.1-flash-lite` using the new Interactions API.
