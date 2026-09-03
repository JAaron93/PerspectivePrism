# ADR 007: Gemini 3.8 Flash Capability Optimization and Zero-Throttling Architecture

## Status
Accepted

## Context
Following the upgrade of Perspective Prism's primary model string to **Gemini 3.8 Flash** (`gemini-3.8-flash`), the system was operating under legacy default generation parameters (unspecified thinking levels, implicit output token limits, and standard short HTTP request timeouts).

Gemini 3.8 Flash introduces native recursive reasoning loops, high-fidelity multi-turn agent autonomy, and expanded token output ceilings up to 64K (65,536 tokens). To maximize model capabilities regardless of cost under the enterprise GCP Vertex AI paid tier, we applied the **Zero-Throttling Principle** and the **4 Capability Maximization Pillars** from the `gemini-model-update-optimizer` skill.

---

## Decision

We have implemented the following architectural optimizations across the backend services, agent configurations, and evaluation benchmarks:

### 1. Dynamic `thinking_level` Routing
We implemented centralized thinking level resolution (`get_gemini_thinking_level` and `build_agent_generation_config` in `app/utils/llm_utils.py`) with task-aware routing:
* **Deep Analytical Agents (`extractor`, `analysis`, `alethiology`, `judge`)**: Routed to `thinking_level="HIGH"` (`types.ThinkingLevel.HIGH`). This unlocks Gemini 3.8 Flash's native internal reasoning for decomposing nuanced claims, cross-referencing multi-perspective search evidence, identifying subtle deceptive framings, and executing rigorous red-team evaluations.
* **Micro-Tasks & Guardrail Classifier (`router` / `PreClassifierService`)**: Routed to `thinking_level="LOW"` (`types.ThinkingLevel.LOW`) with `max_output_tokens=2048`. This preserves sub-second short-circuiting for ineligible non-factual videos without incurring unnecessary reasoning token latency or cost.
* **Environment Override**: Configurable via `GEMINI_THINKING_LEVEL=minimal|low|medium|high` in `Settings` and environment variables.

### 2. Flattened & Pruned Defensive Prompt Scaffolding
* Because Gemini 3.8 Flash recursively self-corrects and reasons internally when thinking is enabled, artificial scratchpad directives (e.g. "think step-by-step", forced XML reflection blocks) have been pruned from agent system instructions.
* System instructions maintain strict Pydantic schema contracts (`ClaimsOutput`, `PerspectiveAnalysisLLMOutput`, `BiasAnalysis`, `AlethiologyAnalysis`, `ContentEligibilityResult`, `LLMJudgeOutput`), avoiding duplicate reasoning token costs.

### 3. Thought Signature & Token Preservation in Sanitizers & Telemetry
* Multi-turn thinking models require passing thought parts and thought signatures in context history.
* We established `EXCLUDED_TELEMETRY_KEYS`:
  ```python
  EXCLUDED_TELEMETRY_KEYS = {
      "tokens_used", "input_tokens", "output_tokens", "total_tokens",
      "thought", "thoughts", "thought_tokens", "thought_signature", "think", "reasoning",
  }
  ```
  ensuring that trace sanitizers, red-team harnesses, and telemetry processors never redact, corrupt, or strip internal reasoning parts.

### 4. 64K Output Token Ceilings & 120s HTTP Timeout Runway
* `GEMINI_MAX_OUTPUT_TOKENS: int = 65536` added to `Settings` and configured across analytical agents, preventing truncated JSON generation during long transcripts or multi-claim analyses.
* `GEMINI_HTTP_TIMEOUT: float = 120.0` added to `Settings` and configured via `types.HttpOptions(timeout=120.0)` in all `Agent` `generate_content_config` instances, ensuring deep thinking trajectories have sufficient runtime runway to complete.

### 5. Red-Team Evaluator & Benchmarks Optimization
* `.benchmarks/redteam/judge.py`: Upgraded `create_llm_judge_agent` default model to `gemini-3.8-flash` with `thinking_level="HIGH"`, `max_output_tokens=65536`, and `120s` timeout. The LLM judge now applies deep reasoning to detect obfuscated prompt injections and delimiter forgery.

### 6. Immutable Analytical Floor Enforcement & Test Escape Hatch
* To eliminate the risk of accidental production throttling, `build_agent_generation_config` and `get_gemini_thinking_level` enforce strict architectural floors for all tasks in `ANALYTICAL_TASK_TYPES` (`extractor`, `analysis`, `alethiology`, `judge`, `evaluator`):
  - `max_output_tokens = max(configured_tokens, 65536)`
  - `http_timeout = max(configured_timeout, 120.0)`
  - `thinking_level = "high"`
* Blanket environment variables (`GEMINI_THINKING_LEVEL=low`) and loose settings apply exclusively to non-analytical tasks (`ROUTER_TASK_TYPES`: `router`, `classifier`, `micro_task`).
* An explicit guard flag (`GEMINI_ALLOW_ANALYTICAL_DOWNGRADE: bool = False`) must be set to `True` for specialized test fixtures to intentionally evaluate reduced limits.

---

## Consequences & Invariants

* **Model Invariant**: All primary analytical agents utilize `gemini-3.8-flash` with `thinking_level="HIGH"`, `max_output_tokens=65536`, and `http_timeout=120.0`.
* **Architectural Floor Protection**: Analytical agents cannot be downgraded by general configuration without the explicit `GEMINI_ALLOW_ANALYTICAL_DOWNGRADE` escape hatch.
* **Throughput & Concurrency**: Vertex AI paid tier provides 300+ RPM high-throughput quota. Long thinking calls are non-blocking and managed within existing `tier_max_concurrency` semaphore bounds.
* **Backward Compatibility**: `gemini-3.1-flash-lite` backup circuit-breaker fallbacks remain preserved and receive model-adapted `generate_content_config` instances.
