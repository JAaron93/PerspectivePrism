# Perspective Prism — Greptile Review Rules & Architectural Invariants

This rulebook defines the core architectural invariants, security boundaries, and code quality standards for the Perspective Prism repository. Greptile must enforce these standards during all Pull Request reviews.

---

## 1. Global Architectural Boundaries & Scope Restrictions

* **No Over-Engineering**: Do NOT suggest enterprise architecture patterns, including microservices, distributed message queues (Celery/RabbitMQ), ORMs/database migrations, role-based access control (RBAC), multi-tenancy, external logging/telemetry platforms (Datadog, Sentry, ELK), container orchestration (Docker/K8s in development), or heavy CI/CD deployment pipelines.
* **Focus Areas**: Focus reviews strictly on **code correctness, logic bugs, solo-developer maintainability, LLM integration security, non-blocking I/O performance, and missing exception handling** on critical execution paths.
* **Review Strictness**: Target P0 (critical bugs/security vulnerabilities) and P1 (functional defects, performance regressions) issues. Avoid noisy comments on purely subjective formatting.

---

## 2. Frontend Architecture (React 19 + TypeScript 7.0 + Vite)

* **TypeScript 7.0 Standard (ADR 004)**:
  - Frontend development uses TypeScript 7.0 (`typescript-7: npm:typescript@^7.0.2`) with Go-based compiler backend for sub-second build times (`tsc -b && vite build`).
  - ESLint AST analysis is bridged via Microsoft's `@typescript/typescript6` compatibility package until TS 7.1 exposes the stable programmatic compiler API. Do NOT flag the side-by-side `@typescript/typescript6` dependency as redundant.
* **UI & State Simplicity**:
  * Do NOT suggest third-party state management libraries (Redux, Zustand, MobX) or external UI component frameworks (Tailwind, Material UI, CSS-in-JS). Plain custom CSS is intentionally maintained.
  * Functional React components with hooks only; no class components.
* **Type Safety & Contracts**:
  * All API response shapes and job payloads must be explicitly typed using TypeScript interfaces; flag any usage of `any`.
  * All frontend environment variables must be strictly prefixed with `VITE_`.
  * Ensure async job polling logic (`POST /analyze/jobs` ➔ `GET /analyze/jobs/{job_id}`) includes proper loading states, timeout handling, and user-friendly error messages.
* **State Management & Override Invariants**:
  * On any new URL submission, `setResults(null)` must be called unconditionally; flag any implementation where previous results or disclaimers persist during new job creation.
  * When implementing "Analyze Anyway" force-override actions, verify that the handler submits the exact URL associated with the displayed disclaimer (`analyzedUrl`), not the live mutable input field value (`url`).
* **Test Scope Isolation**:
  * Verify that `tsconfig.app.json` excludes test files (`src/**/__tests__/*`) so Node built-in types (`node:test`, `node:assert`) do not pollute the client browser compilation target.

---

## 3. Chrome Extension Architecture (Manifest V3 + Zero-Build Vanilla JS)

* **Zero-Build Vanilla JS Runtime (ADR 004)**:
  * The Chrome Extension runtime is intentionally built with **vanilla JavaScript (ES modules for service worker/popup/options, and classic injection scripts for YouTube DOM manipulation)** with **zero build steps** during daily development.
  * Developers load the extension unpacked directly from source (`chrome://extensions`) with 0ms reload latency.
  * Do NOT suggest converting the Chrome Extension source code to TypeScript or introducing Webpack/Rollup bundlers into the development workflow.
  * Type safety is enforced via JSDoc annotations (`/** @type {...} */`), ambient globals (`globals.d.ts`), and a non-emitting `tsconfig.json` (`"noEmit": true`, `"checkJs": true`, `"useUnknownInCatchVariables": false`, and `@types/chrome`).
  * Third-party vendor bundles in `chrome-extension/vendor/` MUST include `// @ts-nocheck` and be excluded from `tsconfig.json`. DOM element attribute setters must cast numbers/booleans via `String(...)` to ensure strict type compliance.
* **Security & Credential Isolation**:
  * **Storage Isolation**: User API keys and sensitive tokens must be stored strictly in `chrome.storage.local` (NEVER `chrome.storage.sync`).
  * **IPC Origin Verification**: `background.js` must validate `sender.id === chrome.runtime.id` for all `chrome.runtime.onMessage` handlers.
  * **Production Manifest Hygiene**: Production `manifest.json` must be free of `http://localhost` or `http://127.0.0.1` host permissions and configure an explicit MV3 CSP (`extension_pages`).
  * **DOM Sanitization**: Dynamic AI outputs rendered in `sidepanel.js` or popup DOM must be sanitized via `textContent` or DOMPurify before DOM insertion to prevent XSS.
* **Content Script Load Order & Script Invariants**:
  * Content scripts are injected into YouTube pages in this strict sequence:
    `logging-utils-script.js` ➔ `config-script.js` ➔ `video-utils-script.js` ➔ `consent.js` ➔ `claim-navigator.js` ➔ `timeline-utils-script.js` ➔ `content-markers-script.js` ➔ `content.js`.
  * **Dual Script/Module Invariant**: Shared utilities must maintain both a module version (`*.js`) for imports and a standalone script version (`*-script.js`) for direct manifest script injection.
* **SPA Navigation & Lifecycle Resilience**:
  * YouTube is a Single Page Application (SPA). `content.js` must clean up DOM observers, video listeners, and timeline markers on `yt-navigate-start` to prevent memory leaks and state corruption across video navigations.
  * When guarding against delayed API responses, never bypass the stale-response guard if `currentVideoId` is `null`. Always strictly check `analysisVideoId !== currentVideoId`.
  * `background.js` must strictly adhere to event-driven Service Worker lifecycles without assuming persistent in-memory global state.
* **Accessibility (WCAG 2.1 AA)**:
  * `claim-navigator.js` must maintain proper keyboard focus management, ARIA live regions, and avoid keyboard focus traps (`Tab`/`Shift+Tab` cycling).
* **Pre-Classification & Epistemic Lens UI**:
  * The Side Panel must render the `#state-ineligible` disclaimer with category tags, confidence meter, and `[⚡ Analyze Anyway]` force-override action.
  * Epistemic Lens cards in `#state-results` must sanitize all quote evidences and epistemic summary text before DOM injection.
* **Analysis Concurrency & Override Lifecycle**:
  * When `forceOverride` replaces an in-flight or recovered request, `client.js` must abort running controllers, clear scheduled retry alarms, track the override in `activeOverrideVideoIds`, and await promise settlement before starting.
  * Alarm listeners must pre-register `pendingRequests` and `AbortController` instances synchronously before yielding to asynchronous persistence in `executeAnalysisRequest`.
  * `background.js` must assign non-null `requestId` values and adopt existing in-progress IDs for concurrent non-forced callers to prevent ownership theft.
  * `background.js` state transitions must enforce strict `currentState.requestId === requestId` matching without `!currentState.requestId` loopholes.
  * `background.js` must verify `message.requestId === preCancelState.requestId` before aborting active controllers on cancel requests.
  * `sidepanel.js` must track `supersededRequestIds`, `completedRequestIds`, and `lastCompletedAnalyzedAt` to reject stale completions after `activeRequestId` has been cleared.
  * `sidepanel.js` must clear `activeRequestId` synchronously upon receiving `complete` events to ensure newer externally initiated analyses are admitted immediately. Cache lookup staleness must be guarded via `pendingCheckCacheToken` rather than retaining completed request ownership across asynchronous lookups.
  * In `client.js`, callers joining in-flight retries (`isRetry: true`) must attach to `pendingResolvers` to await terminal completion.
* **Anti-Oscillation & Review Stability Directive**:
  * AI Reviewers must not enter recursive micro-edge-case spirals. When a PR diff fulfills a previously requested concurrency or lifecycle guard, do not invent secondary speculative edge cases regarding intermediate retry returns or hypothetical timing gaps that are already governed by timeout and resolver fallbacks.

---

## 4. Backend Architecture & Security (FastAPI + Python 3.10+ / ADK 2.0 / Vertex AI)

* **Mandatory LLM Input Sanitization Guardrail (CRITICAL)**:
  * **All user-supplied inputs must pass through `app/utils/input_sanitizer.py` before being forwarded to any LLM model** — no exceptions.
  * Input sanitization is accelerated by the compiled PyO3 Rust extension (`prism_sanitizer_rs`, ADR 001). Flag any execution path or helper that bypasses sanitization.
  * Inspect `input_sanitizer.py` strictly for prompt injection vectors, Unicode edge cases, encoding tricks, or weakening of sanitization rules.
* **Pre-Classification Guardrail Invariants**:
  * All client-extracted video metadata (`title`, `channel_name`, `tags`, `description_snippet`) MUST be sanitized through `input_sanitizer.py` before being passed to `PreClassifierService` or any LLM agent.
  * Deterministic fast-path zero-token early exits MUST verify that the transcript is absent, the category is non-analytical (`Music`, `Gaming`), AND metadata contains no socio-political keywords.
  * Prior to deterministic fast-path evaluation, all metadata fields MUST undergo Unicode NFKC normalization to ensure compatibility homoglyphs and full-width characters cannot bypass keyword pattern matching.
  * The pipeline MUST distinguish between genuine caption absence (`TranscriptsDisabled`, `NoTranscriptFound`, `TranscriptUnavailableError`) and transient retrieval/network failures (`TranscriptRetrievalError`). Transient errors must fail the job and never be masked as empty captions triggering premature early exit disclaimers.
  * Ambiguity rule: If `is_analysable == False` but `confidence_score < 0.70`, the pipeline MUST default to allowing analysis (`is_analysable = True`).
  * `force_override: bool = True` must cleanly bypass the pre-classifier and proceed to full claim analysis.
* **Alethiology Specialist Agent Invariants**:
  * Truth framework classifications must strictly adhere to the 6 canonical theories: `Correspondence (Empirical)`, `Coherence (Systemic Narrative)`, `Pragmatic (Practical Utility)`, `Perspectivism (Lived Experience)`, `Consensus (Institutional Agreement)`, and `Deflationary (Rhetorical Endorsement)`.
  * **Strict Descriptive Neutrality (CRITICAL)**: Flag any prompt, output schema, or code that passes normative value judgments, ranks truth theories as "better" or "sounder," or pejoratively labels speakers with fallacies or falsehoods.
  * Alethiology analysis must execute concurrently (`asyncio.gather`) with perspective and bias analyses to prevent sequential latency regression.
* **Mandatory 100% GCP Vertex AI Mode (Paid Tier)**:
  * Backend LLM initialization must exclusively use GCP Vertex AI Mode via `configure_provider_env` (requiring `GCP_PROJECT` or `GOOGLE_CLOUD_PROJECT`).
  * Google AI Studio API key mode (`GEMINI_API_KEY`, `LLM_API_KEY`) and free-tier rate-limit throttling are permanently removed. Flag any PR introducing AI Studio key fallbacks or free-tier rate-limiting.
  * `.env.example` must contain `GCP_PROJECT=` with clear GCP billing usage comments and no committed AI Studio keys.
* **Primary & Backup Models**:
  * Exclusively use Gemini 3.x series models: **`gemini-3.8-flash`** (primary) and **`gemini-3.1-flash-lite`** (backup). Gemini 2.x and non-Google models are prohibited.
  * Exclusively use **Google ADK 2.0** (`google-adk>=2.4.0`) and the **Google GenAI SDK** (`google-genai>=2.9.0`). Deprecated SDKs (`openai`, `AsyncOpenAI`, legacy `google-generativeai`) are prohibited.
* **Gemini 3.8 Flash Model Optimization & Zero-Throttling Invariants (ADR 006)**:
  * **Mandatory Generation Config Factory**: Flag any ADK 2.0 `Agent(...)` instantiation that fails to attach `generate_content_config` built via `build_agent_generation_config(model=..., task_type=..., settings=...)`.
  * **Task-Aware Thinking Level Resolution**: Verify that analytical agents (`ClaimExtractor`, `AnalysisService`, `AlethiologyService`, red-team `judge`) configure `thinking_level="HIGH"`, while lightweight guardrail routers (`PreClassifierService`) configure `thinking_level="LOW"` and `max_output_tokens=2048`.
  * **Output Ceilings & HTTP Timeout Runway**: Analytical agents must enforce `max_output_tokens=65536` (64K ceiling) and `timeout=120.0` HTTP options (`types.HttpOptions(timeout=120.0)` via `GEMINI_HTTP_TIMEOUT`). Flag any hardcoded output limits below 64K or aggressive timeouts (<120s) on reasoning loops.
  * **Thought Signature & Thinking Preservation**: Flag any code, sanitizer, serializer, or logger that strips, redacts, or drops keys in `EXCLUDED_TELEMETRY_KEYS` (`thought`, `thoughts`, `thought_tokens`, `thought_signature`, `think`, `reasoning`).
  * **Lean Prompt Scaffolding**: Flag artificial chain-of-thought directives ("think step-by-step", forced XML reflection blocks) that duplicate internal model reasoning tokens.
* **Strict Async Non-Blocking I/O**:
  * All network operations (LLM model calls, Google Custom Search, transcript retrieval) must use non-blocking `async`/`await`.
  * LLM calls must use `client.aio` and I/O tasks must use `async def` or `asyncio.to_thread`.
* **Four Canonical Perspectives**:
  * Analysis perspective references must strictly use the four canonical backend categories: `Scientific`, `Journalistic`, `Partisan (Left)`, and `Partisan (Right)`. Flag any string literals that deviate.
* **In-Memory Job Store & Stateless Backend**:
  * Do NOT suggest replacing the in-memory job store (`POST /analyze/jobs` ➔ `GET /analyze/jobs/{job_id}`) with Redis, Celery, or SQL databases. Completed jobs are cleaned up after 1 hour by a background task.
  * Preserve the circuit breaker pattern (`cb_open`, `cb_failures`, `backup_client`) in `AnalysisService`.
  * Configuration must strictly rely on `pydantic-settings` (`app/core/config.py`).

---

## 5. Testing & Quality Standards

* **Meaningful Assertions**: Tests must assert meaningful behavior, error handling, and state transitions rather than mere execution coverage.
* **Backend Tests (Pytest)**: Async tests must correctly use `pytest-asyncio` fixtures and mock credentials via dummy environment variables (`LLM_API_KEY=dummy GOOGLE_API_KEY=dummy GOOGLE_CSE_ID=dummy pytest`).
* **Extension Tests (Vitest & Playwright)**:
  * Vitest unit tests in JSDOM must properly mock Chrome Extension APIs (`chrome.storage.local`, `chrome.runtime`).
  * Playwright integration tests (`chrome-extension/tests/integration/`) must use realistic domain fixtures and persistent extension contexts loading directly from the unpacked source root.
* **Benchmark & Documentation Integrity**: `.benchmarks/**/*` and documentation (`*.md`) must be checked for factual accuracy against the codebase state.
