# ADR 005: Pre-Classification Guardrail Gate and Alethiology Agent Architecture

## Status
Accepted (Synchronized with Rust Native Core Engine ADR 006 & Gemini 3.8 ADR 007)

## Context
Perspective Prism was initially designed to run full claim extraction, multi-perspective Google Custom Search queries, and bias analyses on any submitted YouTube video transcript. However, real-world deployment revealed two critical limitations:

1. **Quota Drain on Non-Factual Content**: A large volume of YouTube content (music videos, gaming clips, comedy sketches, vlogs) contains no verifiable factual claims. Processing these videos through the full pipeline drained Gemini LLM tokens and Google Custom Search API quotas while delivering noisy or meaningless truth profiles.
2. **Binary Truth Oversimplification**: Traditional fact-checkers reduce complex statements to binary true/false verdicts. In philosophical epistemology (*alethiology*), truth is multifaceted. A claim may be empirically unproven yet coherent within a specific framework, practically useful, or accepted by communal consensus.

To resolve these issues, we designed a dual-tier pre-classification guardrail gate and an epistemic truth-theory analysis agent.

---

## Decision

We have decided to integrate a **Pre-Classification Guardrail Gate** and an **Alethiology Analysis Agent** across the backend pipeline, Chrome Extension native Side Panel, and React frontend SPA:

### 1. Two-Tier Content Eligibility Classifier (`PreClassifierService`)
Before claim extraction begins, the backend evaluates the video's transcript and metadata:
* **Tier 1 (Deterministic Fast-Path via Rust Aho-Corasick DFA)**:
  Under [ADR 006](006-rust-native-core-engine.md) (Candidate B), video title, channel name, tags, and description snippet are evaluated using compiled Aho-Corasick DFA pattern matching (`contains_political_keywords` via `prism_sanitizer_rs`). It scans 65+ political, electoral, and socio-economic keywords simultaneously across raw UTF-8 bytes in linear time $O(N)$ with zero backtracking in **<50µs** (8.7x speedup over Python regex). If captions are absent, category is explicitly `Music` or `Gaming`, and no political keywords are detected, the pipeline short-circuits with zero token consumption.
* **Tier 2 (Vertex AI ADK 2.0 Classifier Agent)**:
  If the deterministic check is inconclusive, a lightweight agent (`gemini-3.8-flash`, with circuit-breaker fallback to `gemini-3.1-flash-lite`) classifies content eligibility into a structured `ContentEligibilityResult`:
  * `is_analysable`: Boolean flag indicating whether the video contains verifiable claims.
  * `confidence_score`: Float between 0.0 and 1.0.
  * `detected_category`: Classified genre (`News & Politics`, `Science & Technology`, `Music`, `Gaming`, `Entertainment`, `Vlog`, etc.).
  * `disclaimer_title` and `disclaimer_message`: User-facing explanatory text.
  * **Capability Standard (ADR 007)**: Runs under `thinking_level="LOW"` and `max_output_tokens=2048` to preserve sub-second short-circuit latency.

If `is_analysable` is `false` and `force_override` is `false`, the pipeline terminates early, returning the eligibility result without initiating claim extraction or search queries.

### 2. User-Driven Force Override ("Analyze Anyway")
To prevent false-positive censorship or classifier errors, users have full agency to bypass the pre-classifier:
* The client sends `force_override: true` in `POST /analyze/jobs`.
* When `force_override` is active, the pre-classification check is bypassed, and the full pipeline runs unconditionally.
* In the Chrome extension client, `forceOverride` is pinned across all retry sequences and clears cached ineligibility disclaimers. In the React frontend, override handlers pin against the immutable `analyzedUrl` that produced the disclaimer.

### 3. Alethiology Agent & Epistemic Lens (`AlethiologyService`)
For eligible claims, an ADK 2.0 `AlethiologyService` analyzes the epistemological grounding of each claim across six canonical theories of truth:
1. **Correspondence (Empirical)**: Does the claim correspond directly to observable empirical facts, physical evidence, or scientific measurements?
2. **Coherence (Systemic Narrative)**: Does the claim fit logically and consistently within an established systemic or theoretical framework?
3. **Pragmatic (Practical Utility)**: Is the claim useful, actionable, or demonstrably effective in practical application?
4. **Perspectivism (Lived Experience)**: Is the claim grounded in situated personal perspective, phenomenological standpoint, or subjective lived experience?
5. **Consensus (Institutional Agreement)**: Is the claim supported by intersubjective agreement among relevant communities, peer-reviewed experts, or institutional consensus?
6. **Deflationary (Rhetorical Endorsement)**: Does the claim treat truth purely as a device of rhetorical emphasis, agreement, or semantic ascent without substantive ontological commitments?

The agent outputs a structured `AlethiologyAnalysis` object containing:
* `primary_theory`: Dominant epistemological framework from `TruthTheoryType`.
* `secondary_theory`: Optional supporting framework from `TruthTheoryType`.
* `epistemic_summary`: Strictly neutral 2-3 sentence synthesis of how the speaker builds their case.
* `quote_evidences`: Exact transcript quotes where the speaker demonstrates their truth assumptions.
* **Capability Standard (ADR 007)**: Analytical execution enforces `thinking_level="HIGH"`, `max_output_tokens=65536` (64K ceiling), and 120s HTTP timeout.

### 4. Prompt Nonce & Delimiter Isolation Guard (ADR 006 Candidate D)
Both `PreClassifierService` and `AlethiologyService` enforce native prompt wrapping and delimiter protection:
* User data (metadata, snippets, claims, context, and quote evidences) are interpolated using `prism_sanitizer_rs.build_user_data_prompt` with dynamic per-request cryptographic nonces (`===USER DATA <nonce> START===` / `===USER DATA <nonce> END===`).
* Inlines high-speed delimiter forgery detection (`contains_delimiter_forgery`) to neutralize adversarial delimiter injection while optimizing Gemini implicit context caching.

### 5. Client Presentation Parity & Concurrency Hardening
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
   Both `PreClassifierService` and `AlethiologyService` strictly use `google-genai` and `google-adk` in GCP Vertex AI mode (`GCP_PROJECT`, `GEMINI_TIER=paid`, `gemini-3.8-flash` primary model).
2. **Rust Native Core Engine Integration (ADR 006)**:
   Deterministic screening leverages compiled Aho-Corasick DFA (`contains_political_keywords`) and dynamic prompt nonce guards (`build_user_data_prompt`), with pure-Python fallbacks ensuring 100% test parity.
3. **Zero-Throttling Capability Standards (ADR 007)**:
   Pre-classification micro-tasks run with `thinking_level="LOW"` and `max_output_tokens=2048`, while deep alethiology analysis enforces `thinking_level="HIGH"`, `max_output_tokens=65536`, and 120s HTTP timeout.
4. **Strict Async I/O**:
   All model invocations and network requests utilize non-blocking `client.aio.models` or `asyncio.to_thread`.
5. **Zero-Build Vanilla JavaScript Invariant (ADR 004)**:
   The Chrome Extension implements the pre-classifier disclaimer and epistemic lens in vanilla JavaScript and native CSS, typed via ambient JSDoc declarations in `globals.d.ts` without introducing a bundler.
6. **Clean Concurrency Lifecycle**:
   Service worker request ownership tracks distinct `requestId` values to prevent race conditions during rapid user overrides and background retries.

---

## Consequences

### Positive
* **Cost & Quota Efficiency**: Avoids running heavy LLM extraction and Google Custom Search API calls on non-factual videos (music, gaming, entertainment).
* **Microsecond Fast-Path Performance**: The Rust Aho-Corasick DFA evaluates non-analytical metadata in **<50µs** with zero token overhead.
* **Adversarial Delimiter Isolation**: Cryptographic nonces neutralize prompt injection delimiter forgery attempts across classification and alethiology pipelines.
* **Epistemic Depth**: Surfaces nuanced philosophical truth evaluations, moving beyond simplistic binary verdicts.
* **User Agency**: The `[⚡ Analyze Anyway]` force-override button ensures users are never locked out of analyzing content they deem factual.
* **Resilient Concurrency**: The extension client and background service worker gracefully handle retries, stale cancellations, and external analysis broadcasts.

### Negative
* **Two Classifier Hops for Factual Videos**: Factual videos incur an initial lightweight classification check (~300–600ms) before claim extraction begins.
* **Increased UI Complexity**: The Truth Profile card renders additional epistemic badges and collapsible quote drawers, requiring careful CSS contrast and accessibility handling.
