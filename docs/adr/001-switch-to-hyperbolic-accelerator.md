# ADR 001: Switch to Hyperbolic via Tensorblock Gateway

## Status
Accepted

## Context
The *Perspective Prism* extension requires rapid generation of multiple perspectives (Support, Refute, Neutral) in parallel. Users currently experience high latency (3-6s) with the standard OpenAI API.

While switching to a dedicated AI accelerator like **Hyperbolic** (running GPT-OSS 120B) will solve the immediate latency issue (target <200ms TTFT), the AI hardware landscape is evolving rapidly. New providers like **Nebius AI** and **Cerebras** may offer better price/performance in the future.

We need a "future-proof" architecture that allows us to swap underlying inference providers without constantly refactoring our backend code.

## Decision
We will adopt **Tensorblock** as a unified LLM API gateway layer.

1.  **Gateway Architecture**: We will route all LLM requests through Tensorblock (specifically the `Forge` gateway or compatible endpoint).
2.  **Initial Provider**: The gateway will be configured to route requests to **Hyperbolic** (serving **GPT-OSS 120B**) to achieve our immediate latency goals.
3.  **Code Abstraction**: The backend will utilize the standard OpenAI Python SDK, configured with a custom `base_url` pointing to the Tensorblock instance.

### Why Tensorblock?
- **Unified Interface**: Exposes a standard OpenAI-compatible API, meaning our backend code remains provider-agnostic.
- **Provider Agility**: Switching from Hyperbolic to Nebius or Cerebras becomes a configuration change in Tensorblock, not a code deployment.
- **Feature Set**: Offers centralized management for routing, fallbacks, and usage analytics across different providers.

### Why Hyperbolic (Initial Provider)?
- **Model**: GPT-OSS 120B (Mixture-of-Experts) offers the optimal balance of speed (5.1B active params) and reasoning capability.
- **Performance**: <150ms TTFT, >120 t/s throughput on their optimized infrastructure.

## Consequences

### Positive
- **Future-Proofing**: We can migrate to the fastest/cheapest provider (e.g., Cerebras Wafer-Scale Engine) in minutes.
- **Zero Code Changes**: Changing providers is strictly an infrastructure/env-var change.
- **Performance**: We still achieve the 2x-5x speedup immediately via Hyperbolic.

### Negative
- **Infrastructure Dependency**: Introduces a dependency on a running Tensorblock instance (or managed service).
- **Complexity**: Requires managing an additional configuration layer (Tensorblock routing rules).
- **Code Refactor**: Requires updating `AnalysisService` to support customizable `base_url`.
- **Reliability Risks**: A gateway outage could bring down the entire analysis pipeline if not handled correctly.

## Reliability Requirements
To mitigate the risks of adding a gateway layer, the following mechanisms are **mandatory**:

1.  **Fault Tolerance**:
    - `AnalysisService` must detect gateway failures (timeouts, 503s, connection refused).
    - **Circuit Breaker**: Implement a circuit breaker that trips after a configurable threshold of failures, temporarily stopping requests to the gateway.
    
2.  **Fallback Strategy**:
    - **Direct-to-OpenAI Fallback**: If the Tensorblock gateway is unreachable or returns non-2xx errors, the system must automatically fall back to the standard OpenAI API (using `api.openai.com` and a backup `OPENAI_API_KEY`).
    - This requires storing **both** the Tensorblock/Hyperbolic key and a standard OpenAI key in the configuration.

3.  **Observability**:
    - **Health Checks**: Implement a `/health` probe that checks connectivity to the configured LLM provider.
    - **Metrics**: Track gateway latency, error rates, and circuit breaker state.
    - **Alerting**: Trigger alerts if the fallback mode is activated or if error rates exceed 5%.

## Implementation Plan
1.  **Backend Config**: Update `backend/app/core/config.py` to add `OPENAI_BASE_URL` (defaulting to standard OpenAI, but overridable).
2.  **Service Update**: Modify `backend/app/services/analysis_service.py` to initialize `AsyncOpenAI` with the configured `base_url`.
3.  **Deployment**: Configure the production environment variables:
    - `OPENAI_BASE_URL`: `https://your-tensorblock-gateway/v1` (or direct provider if Tensorblock is not yet deployed).
    - `OPENAI_API_KEY`: Tensorblock API key.
4.  **Reliability Implementation**:
    - Implement retry logic with exponential backoff for transient errors.
    - Add circuit breaker pattern to `AnalysisService` interactions.
    - Implement fallback logic: `try Tensorblock -> catch Error -> use OpenAI Backup`.
    - Expose metrics for gateway health.
