# Pre-Classification Gate & Alethiology Specialist Agent Requirements

## 1. Glossary & System Conventions

- **Pre-Classification Guardrail Gate**: A lightweight, front-of-pipeline evaluation mechanism that determines if a YouTube video contains verifiable political, socio-economic, or factual discourse suitable for deep multi-perspective analysis.
- **Alethiology**: The philosophical study of the nature of truth and the criteria for establishing what constitutes "truth."
- **Epistemic Truth Framework**: The underlying standard (e.g., empirical correspondence, narrative coherence, pragmatic utility) a speaker implicitly uses to substantiate claims.
- **Force Override ("Analyze Anyway")**: An explicit user-initiated client directive (`force_override: true`) that bypasses the pre-classification gate and forces the backend to run full claim extraction and multi-perspective analysis.
- **Zero-Drift Invariant**: The requirement that specifications, source code, data schemas, ambient types, and unit/integration tests remain in 100% synchronous lockstep.

---

## 2. Functional Requirements (FR)

### Track 1: Pre-Classification Guardrail Gate

- **FR1 - Multi-Signal Ingestion**: The system MUST ingest both client-extracted YouTube metadata (`title`, `channel_name`, `category_id`, `category_name`, `tags`, `description_snippet`) and a transcript preview (first 50–100 lines of spoken captions) as classifier inputs.
- **FR2 - Zero-Token Deterministic Fast Path**: The system MUST implement a zero-token deterministic early exit ONLY when:
  1. The transcript is absent or empty (`transcript is None or transcript.strip() == ""`), AND
  2. The YouTube category is non-analytical (`Music`, `Gaming`), AND
  3. The video metadata (`title`, `channel_name`, `tags`, `description_snippet`) contains NO political, electoral, policy, or socio-economic keywords.
  If the video lacks captions but metadata suggests political discourse (e.g., `"[AMV] Election 2024"` or `"Gaming Stream - Talking Supreme Court"`), the request MUST NOT be fast-path rejected; it MUST proceed to the `PreClassifierAgent` to evaluate metadata and generate a context-aware disclaimer explaining caption absence rather than falsely asserting 1.0 confidence of non-political content.
- **FR3 - ADK 2.0 Guardrail Agent**: The system MUST implement a dedicated ADK 2.0 `PreClassifierAgent` configured with `gemini-3.5-flash-lite` (and `gemini-3.1-flash-lite` circuit-breaker backup) in GCP Vertex AI mode enforcing the `ContentEligibilityResult` structured output schema.
- **FR4 - Conservative Ambiguity Threshold**: If the agent returns `is_analysable == False` but `confidence_score < 0.70`, the backend MUST treat the classification as ambiguous and automatically default to allowing full analysis (`is_analysable = True`).
- **FR5 - Edge-Case Prompt Calibration**: The agent system prompt MUST include few-shot calibration handling:
  - *Political Satire & Parody*: Classified as `is_analysable = True`.
  - *Political AMVs / Meme Audio*: Spoken debate/news audio prioritized over animation visuals $\rightarrow `is_analysable = True`.
  - *Documentaries & Essays in Science/Education*: Real-world policy/geopolitics discussion $\rightarrow `is_analysable = True`.
  - *News-Adjacent Gaming*: Spoken current affairs/election commentary $\rightarrow `is_analysable = True`; mechanical gameplay/speedruns $\rightarrow `is_analysable = False`.
- **FR6 - Force Override Parameter**: The backend `/analyze/jobs` endpoint and `VideoRequest` schema MUST accept `force_override: bool = False`. When `force_override == True`, the Pre-Classification Gate MUST be completely bypassed.

---

### Track 2: Alethiology Specialist Agent

- **FR7 - Epistemological Taxonomy Support**: The system MUST classify truth assertions against the 6 core philosophical frameworks:
  1. `Correspondence (Empirical)`
  2. `Coherence (Systemic Narrative)`
  3. `Pragmatic (Practical Utility)`
  4. `Perspectivism (Lived Experience)`
  5. `Consensus (Institutional Agreement)`
  6. `Deflationary (Rhetorical Endorsement)`
- **FR8 - Strict Descriptive Neutrality**: The Alethiology Agent MUST output strictly neutral, descriptive characterizations of *how* the speaker constructs arguments. It MUST NOT evaluate whether a theory is "better" or "sound," nor accuse the speaker of fallacies or falsehoods.
- **FR9 - Alethiology Structured Output**: The agent MUST enforce the `AlethiologyAnalysis` schema, returning `primary_theory`, optional `secondary_theory`, `epistemic_summary` (2–3 sentences), and `quote_evidences` (exact transcript excerpts).
- **FR10 - Concurrent Non-Blocking Execution**: The Alethiology Agent MUST execute concurrently (`asyncio.gather`) alongside `PerspectiveAnalysis` and `BiasAnalysis` agents, adding zero net wall-clock latency to the claim processing loop.
- **FR11 - Rust PyO3 Sanitization**: All metadata, summaries, category strings, and quote evidences MUST be validated through `app.utils.input_sanitizer` (`prism_sanitizer_rs`).

---

### Track 3: Side Panel & Client UI Flow

- **FR12 - Ineligible Disclaimer State**: When a video is classified as ineligible, the Chrome Extension Side Panel MUST display `#state-ineligible`, including:
  - Muted warning icon and header (`Analysis Skipped` or `No Political Analysis Needed`).
  - Detected category pill tag and confidence percentage (e.g. `Anime Music Video (AMV) • 96% Non-Political`).
  - Explanation body explaining why analysis was paused.
  - Actionable navigation tip.
  - Prominent `[⚡ Analyze Anyway]` interactive button.
- **FR13 - "Analyze Anyway" Override Action**: Clicking `[⚡ Analyze Anyway]` MUST dispatch a new analysis job with `force_override: true` and transition the Side Panel to the optimistic loading/skeleton state.
- **FR14 - Epistemic Lens UI Component**: In the results view (`#state-results`), each claim card and/or video summary MUST render an interactive Epistemic Lens badge (primary and secondary theory chips), neutral summary block, and expandable quote evidence drawer.
- **FR15 - Cache & Storage Integrity**: Pre-classification eligibility results and alethiology analyses MUST be cached in `chrome.storage.local` using content-hashed storage keys (`cache_${videoId}_${hash}`).
- **FR16 - React Frontend SPA Parity**: The standalone React 19 Single Page Application MUST support identical pre-classification disclaimers, force-override actions, and Epistemic Lens visualizations.

---

## 3. Non-Functional Requirements (NFR)

- **NFR1 - Latency & Performance**:
  - Deterministic fast-path exit MUST execute in $< 10\text{ms}$.
  - LLM Pre-Classifier Gate execution MUST complete in $< 1.5\text{s}$.
  - Concurrent Alethiology Agent execution MUST add $0\text{ms}$ wall-clock latency overhead to the existing parallel analysis stage.
  - Side panel skeleton cards MUST render within $< 50\text{ms}$ of video navigation.
- **NFR2 - Strict Vendor Lock-In & Async I/O**:
  - All LLM agents MUST use Google ADK 2.0 (`google-adk>=2.4.0`) and Google GenAI SDK (`google-genai>=2.9.0`) in GCP Vertex AI mode (`GEMINI_TIER=paid`).
  - Primary model: `gemini-3.5-flash-lite`; backup model: `gemini-3.1-flash-lite`.
  - All network I/O MUST use non-blocking `async`/`await` patterns.
- **NFR3 - Security & Storage Isolation**:
  - Sensitive API keys, BYOK settings, and cache data MUST reside exclusively in `chrome.storage.local`.
  - All incoming metadata and transcript strings MUST be sanitized by the compiled Rust PyO3 extension (`prism_sanitizer_rs`).
  - Background Service Worker MUST enforce IPC origin verification (`sender.id === chrome.runtime.id`).
- **NFR4 - Zero-Build Architecture & Static Typings (ADR 004)**:
  - Chrome Extension MUST run zero-build vanilla JS directly loaded via unpacked extension.
  - Static type checking MUST pass via `npm run typecheck` (`tsc --noEmit` with `checkJs: true` and ambient `globals.d.ts`).
- **NFR5 - Accessibility & WCAG Compliance**:
  - Disclaimer and Epistemic Lens components MUST adhere to WCAG AA color contrast ratios ($\ge 4.5:1$).
  - All interactive buttons MUST feature accessible ARIA labels and minimum $48\times 48\text{px}$ tap targets.

---

## 4. User Stories

- **US1 - Clear Feedback on Non-Analytical Content**: As an end user watching an Anime Music Video (AMV) or lofi stream, I want the extension to politely explain why analysis was skipped so I understand that the tool is operating properly and not hanging or making up false political claims.
- **US2 - Accurate Detection of Political Satire & Essays**: As an end user watching a political satire show (*The Daily Show*) or an essay in the *Gaming* category, I want the pre-classifier to recognize the underlying socio-political discourse so I receive a full, accurate truth and bias breakdown.
- **US3 - User Control via Force Override**: As an end user who believes a video was incorrectly flagged as non-analytical, I want to click an "Analyze Anyway" button so I can force the extension to run the full pipeline without changing videos.
- **US4 - Epistemological Understanding of Public Discourse**: As a researcher or informed citizen, I want to see the speaker's underlying "Epistemic Lens" (e.g. empirical correspondence vs narrative coherence) so I can understand *why* different commentators interpret the same factual event in fundamentally different ways.
- **US5 - Reproducible & Comprehensive Testing**: As a software engineer working on Perspective Prism, I want extensive TDD unit tests and Playwright persistent context integration tests verifying the pre-classifier, override flows, and alethiology parsing.

---

## 5. Behavior-Driven Development (BDD) Acceptance Criteria

### Feature: Pre-Classification Guardrail Gate

```gherkin
Scenario: Non-analytical music video triggers early exit disclaimer
  Given a YouTube video with title "Lofi Hip Hop Radio - Beats to Relax/Study to"
  And the YouTube category is "Music"
  And the metadata contains no political or socio-economic keywords
  And the transcript is empty or contains only non-speech music tags
  When the user opens the Perspective Prism Side Panel
  Then the Pre-Classifier Gate short-circuits deterministically without LLM tokens
  And the Side Panel displays the "Analysis Skipped" disclaimer
  And the category badge displays "Music / Non-Speech Media • 100% Match"
  And the "Analyze Anyway" button is rendered and clickable

Scenario: Political Gaming video without captions routes to PreClassifierAgent
  Given a YouTube video with title "Chill Geoguessr Stream! (Talking about recent Supreme Court ruling)"
  And the YouTube category is "Gaming"
  And the transcript is empty or unavailable
  When the user opens the Perspective Prism Side Panel
  Then the deterministic fast path detects political keywords in title/metadata and does not short-circuit
  And the PreClassifierAgent evaluates the metadata
  And the system reports the political context and clarifies caption requirements rather than falsely asserting 1.0 non-political confidence
  And the "Analyze Anyway" button is available for force-override

Scenario: Political satire video categorized under Entertainment is accepted
  Given a YouTube video with title "The Daily Show: Politicians React to New Tax Bill"
  And the YouTube category is "Entertainment"
  And the transcript contains "Congress just passed a 500-page tax bill that nobody read..."
  When the Pre-Classifier Agent evaluates the metadata and transcript preview
  Then is_analysable returns true with confidence >= 0.90
  And detected_category is "Political Satire & Comedy"
  And the backend proceeds to full claim extraction and evidence retrieval

Scenario: Ambiguous or low-confidence classification defaults to eligible
  Given a YouTube video with an ambiguous transcript snippet
  When the Pre-Classifier Agent returns is_analysable = false with confidence_score = 0.62
  Then the backend triggers the conservative threshold filter (confidence < 0.70)
  And the video is marked as eligible (is_analysable = true)
  And the full analysis pipeline executes normally

Scenario: User triggers Force Override on a flagged video
  Given a video currently displaying the "Analysis Skipped" disclaimer in the Side Panel
  When the user clicks the "Analyze Anyway" button
  Then the client dispatches a POST /analyze/jobs request with force_override = true
  And the backend skips the Pre-Classification Gate
  And the Side Panel transitions immediately to the skeleton loading state
  And full claim analysis results are displayed upon completion
```

### Feature: Alethiology Specialist Agent

```gherkin
Scenario: Investigative science video classified under Correspondence Theory
  Given a transcript excerpt: "Raman spectroscopy confirmed a statistically significant microplastic concentration (p < 0.001) in brain tissue..."
  When the Alethiology Specialist Agent analyzes the claim
  Then primary_theory is classified as "Correspondence (Empirical)"
  And epistemic_summary describes direct physical measurement and statistical verification
  And quote_evidences contains the exact Raman spectroscopy transcript quote
  And the result contains zero normative value judgments or bias accusations

Scenario: Conspiracy theory breakdown classified under Coherence Theory
  Given a transcript excerpt: "Three regulatory heads resigned right when the telecom merger was announced. When you map out the hedge fund connections, it all locks into place..."
  When the Alethiology Specialist Agent analyzes the claim
  Then primary_theory is classified as "Coherence (Systemic Narrative)"
  And epistemic_summary neutrally explains that truth is constructed by assembling circumstantial events into a consistent narrative pattern
  And no pejorative terms such as "fake news" or "irrational" are present in the output
```
