# ADR 005: Pre-Classification Guardrail Gate and Alethiology Agent Architecture

## Status
Accepted

## Context
Perspective Prism was initially designed to run full claim extraction, multi-perspective Google Custom Search queries, and bias analyses on any submitted YouTube video transcript. However, real-world deployment revealed two critical limitations:

1. **Quota Drain on Non-Factual Content**: A large volume of YouTube content (music videos, gaming clips, comedy sketches, vlogs) contains no verifiable factual claims. Processing these videos through the full pipeline drained Gemini LLM tokens and Google Custom Search API quotas while delivering noisy or meaningless truth profiles.
2. **Binary Truth Oversimplification**: Traditional fact-checkers reduce complex statements to binary true/false verdicts. In philosophical epistemology (*alethiology*), truth is multifaceted. A claim may be empirically unproven yet coherent within a specific framework, practically useful, or accepted by communal consensus.

To resolve these issues, we designed a dual-tier pre-classification guardrail gate and an epistemic truth-theory analysis agent.

---

## Decision

We have decided to integrate a **Pre-Classification Guardrail Gate** and an **Alethiology Analysis Agent** across the backend pipeline, Chrome Extension native Side Panel, and React frontend SPA:

### 1. Two-Tier Content Eligibility Classifier (`ContentClassifierService`)
Before claim extraction begins, the backend evaluates the video's transcript and metadata:
* **Tier 1 (Deterministic Fast-Path)**: Evaluates video title, description, and transcript snippet against high-confidence regex patterns for obvious non-factual categories (e.g., official music videos, gameplay walkthroughs) in `<1ms`.
* **Tier 2 (Vertex AI ADK 2.0 Classifier Agent)**: If the deterministic check is inconclusive, a lightweight agent (`gemini-3.5-flash-lite`, with circuit-breaker fallback to `gemini-3.1-flash-lite`) classifies content eligibility into a structured `ContentEligibilityResult`:
  * `is_analysable`: Boolean flag indicating whether the video contains verifiable claims.
  * `confidence_score`: Float between 0.0 and 1.0.
  * `detected_category`: Classified genre (`News & Politics`, `Science & Technology`, `Music`, `Gaming`, `Entertainment`, `Vlog`, etc.).
  * `disclaimer_title` and `disclaimer_message`: User-facing explanatory text.

If `is_analysable` is `false` and `force_override` is `false`, the pipeline terminates early, returning the eligibility result without initiating claim extraction or search queries.

### 2. User-Driven Force Override ("Analyze Anyway")
To prevent false-positive censorship or classifier errors, users have full agency to bypass the pre-classifier:
* The client sends `force_override: true` in `POST /analyze/jobs`.
* When `force_override` is active, the pre-classification check is bypassed, and the full pipeline runs unconditionally.
* In the Chrome extension client, `forceOverride` is pinned across all retry sequences and clears cached ineligibility disclaimers.

### 3. Alethiology Agent & Epistemic Lens (`AlethiologyService`)
For eligible claims, an ADK 2.0 `AlethiologyService` analyzes the epistemological grounding of each claim across four classical theories of truth:
1. **Correspondence Theory**: Does the claim correspond directly to observable empirical facts, physical evidence, or scientific measurements?
2. **Coherence Theory**: Does the claim fit logically and consistently within an established systemic or theoretical framework?
3. **Pragmatic Theory**: Is the claim useful, actionable, or demonstrably effective in practical application?
4. **Consensus Theory**: Is the claim supported by intersubjective agreement among relevant communities, peer-reviewed experts, or institutional consensus?

The agent outputs a structured `AlethiologyAnalysis` object containing:
* `primary_theory` and `secondary_theory` (`correspondence`, `coherence`, `pragmatic`, `consensus`).
* `epistemic_summary`: A concise synthesis explaining how the claim functions under the selected theories.
* `quotes`: Exact supporting quotes extracted from the transcript.
* `confidence_score`: Epistemic confidence between 0.0 and 1.0.

### 4. Client Presentation Parity & Concurrency Hardening
* **Chrome Extension Side Panel**:
  * Implemented `#state-ineligible` container with category tags, confidence meter, and accessible `[⚡ Analyze Anyway]` button.
  * Implemented `.pp-epistemic-lens-card` displaying primary/secondary theory badges, epistemic synthesis summary, and a collapsible quote drawer (`.pp-quote-drawer`).
  * Enforced synchronous `activeRequestId` clearing upon completion, decoupling staleness protection to a monotonic generational token (`pendingCheckCacheToken`).
* **React Frontend SPA**:
  * Created `frontend/src/components/EligibilityDisclaimer.tsx` and `frontend/src/components/EpistemicLensCard.tsx`.
  * Updated `frontend/src/types/index.ts` with ambient TypeScript definitions matching backend Pydantic schemas.

---

## Rationale & Invariants

1. **Strict Google Gemini & ADK 2.0 Vendor Lock-In**:
   Both `ContentClassifierService` and `AlethiologyService` strictly use `google-genai` and `google-adk` in GCP Vertex AI mode (`GCP_PROJECT`, `GEMINI_TIER=paid`, `gemini-3.5-flash-lite` primary model).
2. **Strict Async I/O**:
   All model invocations and network requests utilize non-blocking `client.aio.models` or `asyncio.to_thread`.
3. **Zero-Build Vanilla JavaScript Invariant (ADR 004)**:
   The Chrome Extension implements the pre-classifier disclaimer and epistemic lens in vanilla JavaScript and native CSS, typed via ambient JSDoc declarations in `globals.d.ts` without introducing a bundler.
4. **Clean Concurrency Lifecycle**:
   Service worker request ownership tracks distinct `requestId` values to prevent race conditions during rapid user overrides and background retries.

---

## Consequences

### Positive
* **Cost & Quota Efficiency**: Avoids running heavy LLM extraction and Google Custom Search API calls on non-factual videos (music, gaming, entertainment).
* **Epistemic Depth**: Surfaces nuanced philosophical truth evaluations, moving beyond simplistic binary verdicts.
* **User Agency**: The `[⚡ Analyze Anyway]` force-override button ensures users are never locked out of analyzing content they deem factual.
* **Resilient Concurrency**: The extension client and background service worker gracefully handle retries, stale cancellations, and external analysis broadcasts.

### Negative
* **Two Classifier Hops for Factual Videos**: Factual videos incur an initial lightweight classification check (~300–600ms) before claim extraction begins.
* **Increased UI Complexity**: The Truth Profile card renders additional epistemic badges and collapsible quote drawers, requiring careful CSS contrast and accessibility handling.
