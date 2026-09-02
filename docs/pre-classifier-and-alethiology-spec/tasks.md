# Pre-Classification Gate & Alethiology Specialist Agent Implementation Tasks

## Track 1: Backend Data Models & Rust Sanitization Extensions

- [ ] **T1.1: Extend Pydantic Schemas for Pre-Classifier and Alethiology**
  - **Description**: Update `backend/app/models/schemas.py` to define `TruthTheoryType` literal enum, `VideoMetadata`, `VideoRequest` (adding `force_override: bool = False` and `metadata: Optional[VideoMetadata]`), `ContentEligibilityResult`, `AlethiologyAnalysis`, and update `ClientTruthProfile` and `AnalysisResponse` to include `alethiology` and `eligibility`.
  - **Dependencies**: None
  - **Traceability**: FR1, FR3, FR6, FR7, FR9, NFR2

- [ ] **T1.2: Extend Rust Input Sanitizer and PyO3 Bindings**
  - **Description**: Update `backend/app/utils/input_sanitizer.py` and `backend/prism_sanitizer_rs/src/lib.rs` (if necessary) to provide dedicated sanitization helpers `sanitize_metadata_field()`, `sanitize_category_string()`, and `sanitize_quote_evidence()` ensuring stripping of control characters and XSS injection vectors.
  - **Dependencies**: None
  - **Traceability**: FR11, NFR3

- [ ] **T1.3: TDD Unit Tests for New Schemas and Sanitization Helpers**
  - **Description**: Create `backend/tests/test_schemas_and_sanitizer.py` verifying serialization/deserialization of `ContentEligibilityResult` and `AlethiologyAnalysis`, validation bounds on confidence scores, and strict input sanitization behavior.
  - **Dependencies**: T1.1, T1.2
  - **Traceability**: FR11, US5

---

## Track 2: Pre-Classification Guardrail Gate (Backend)

- [ ] **T2.1: Implement Deterministic Fast-Path Filter**
  - **Description**: Create `backend/app/services/content_classifier.py` with `evaluate_deterministic_fast_path(category_name, transcript_preview)`. Returns `ContentEligibilityResult(is_analysable=False, confidence_score=1.0, ...)` if transcript is missing and category is `Music` or `Gaming`.
  - **Dependencies**: T1.1
  - **Traceability**: FR2, NFR1

- [ ] **T2.2: Implement ADK 2.0 Pre-Classifier Agent & Edge-Case Few-Shot Prompt**
  - **Description**: In `backend/app/services/content_classifier.py`, define `PreClassifierService` using Google ADK 2.0 `Agent` configured with `gemini-3.5-flash-lite` (primary) and `gemini-3.1-flash-lite` (backup) in Vertex AI mode with `output_schema=ContentEligibilityResult`. Include few-shot prompt calibrations for satire, political AMVs, documentaries in Education/Tech, and news-adjacent gaming commentary. Implement conservative thresholding (`confidence < 0.70` defaults to `is_analysable = True`).
  - **Dependencies**: T1.1, T2.1
  - **Traceability**: FR3, FR4, FR5, NFR2

- [ ] **T2.3: TDD & BDD Unit Tests for Pre-Classifier Service**
  - **Description**: Create `backend/tests/test_content_classifier.py` containing mocked unit tests and BDD Gherkin scenarios testing deterministic short-circuiting, satire pass-through, low-confidence conservative fallback, and edge-case classification.
  - **Dependencies**: T2.2
  - **Traceability**: FR1, FR2, FR3, FR4, FR5, US1, US2, US5

---

## Track 3: Alethiology Specialist Agent (Backend)

- [ ] **T3.1: Implement Alethiology Specialist Agent & System Prompt**
  - **Description**: Create `backend/app/services/alethiology_service.py` defining `AlethiologyService` with ADK 2.0 `Agent(model=primary_model, output_schema=AlethiologyAnalysis)`. Incorporate the strict descriptive neutrality guardrail (no normative judgments, no fallacy accusations) and few-shot examples for the 6 truth theories (Correspondence, Coherence, Pragmatic, Perspectivism, Consensus, Deflationary).
  - **Dependencies**: T1.1
  - **Traceability**: FR7, FR8, FR9, NFR2

- [ ] **T3.2: Integrate Alethiology Agent into Parallel Async Execution Pipeline**
  - **Description**: Update `backend/app/services/analysis_service.py` and `backend/app/main.py` to dispatch `analyze_alethiology()` concurrently inside `asyncio.gather` alongside perspective analyses and bias/deception analysis for each claim, assembling the result into `ClientTruthProfile.alethiology`.
  - **Dependencies**: T1.1, T3.1
  - **Traceability**: FR10, NFR1

- [ ] **T3.3: TDD & BDD Unit Tests for Alethiology Specialist Agent**
  - **Description**: Create `backend/tests/test_alethiology_service.py` verifying schema adherence, parallel non-blocking execution, neutrality guardrails (ensuring conspiracy theories are classified as Coherence without bias slurs), and empirical science classification as Correspondence.
  - **Dependencies**: T3.1, T3.2
  - **Traceability**: FR7, FR8, FR9, FR10, US4, US5

---

## Track 4: API Endpoint & Background Job Orchestration (Backend)

- [ ] **T4.1: Update `/analyze/jobs` Flow in `main.py` with Gate & Force Override**
  - **Description**: In `backend/app/main.py`, update `process_analysis()` to:
    1. Check `request.force_override`. If `True`, log bypass and skip pre-classification.
    2. If `False`, run `PreClassifierService.classify_video()`.
    3. If `is_analysable == False` (and `confidence >= 0.70`), set job status to `COMPLETED`, populate `result.eligibility`, and early exit.
    4. Otherwise, continue to full multi-agent claim extraction and parallel analysis.
  - **Dependencies**: T2.2, T3.2
  - **Traceability**: FR1, FR6, NFR1

- [ ] **T4.2: End-to-End API Pipeline Tests**
  - **Description**: Create `backend/tests/test_analysis_pipeline_integration.py` testing the complete `/analyze/jobs` API lifecycle with mocked Google GenAI Vertex AI calls, asserting early exit responses, force override bypass execution, and alethiology output fields.
  - **Dependencies**: T4.1
  - **Traceability**: FR6, US3, US5

---

## Track 5: Manifest V3 Chrome Extension (Side Panel & Client)

> [!TIP] PARALLEL EXECUTION
> Track 5 and Track 6 can proceed completely in parallel once Track 1 schemas and Track 4 API contracts are defined.

- [ ] **T5.1: Update Extension API Client for Metadata & Force Override**
  - **Description**: Update `chrome-extension/client.js` and `chrome-extension/client-script.js` to accept `forceOverride` and `metadata` parameters in `createAnalysisJob(videoUrl, options)`.
  - **Dependencies**: T1.1, T4.1
  - **Traceability**: FR1, FR6, NFR3

- [ ] **T5.2: Implement Ineligible Disclaimer UI State in Side Panel HTML & CSS**
  - **Description**: Update `chrome-extension/sidepanel.html` and `chrome-extension/sidepanel.css` to add `#state-ineligible` container with warning icon, `#disclaimer-title`, `#disclaimer-category-badge`, `#disclaimer-message`, actionable navigation tip, and `#pp-force-analyze-btn` ("⚡ Analyze Anyway").
  - **Dependencies**: None
  - **Traceability**: FR12, NFR5

- [ ] **T5.3: Implement "Analyze Anyway" Override Handler in Side Panel Controller**
  - **Description**: Update `chrome-extension/sidepanel.js` to handle `eligibility` payload. When `eligibility.is_analysable === false`, display `#state-ineligible`. Bind `#pp-force-analyze-btn` click event to trigger `startAnalysis(videoId, { forceOverride: true })`.
  - **Dependencies**: T5.1, T5.2
  - **Traceability**: FR12, FR13, US1, US3

- [ ] **T5.4: Implement Epistemic Lens Component & Quote Accordion**
  - **Description**: Update `chrome-extension/sidepanel.js` and `sidepanel.css` to render an "Epistemic Lens" card within each claim's Truth Profile view, displaying primary/secondary theory chips, epistemic summary text, and a collapsible quote evidence drawer.
  - **Dependencies**: T1.1, T5.3
  - **Traceability**: FR14, US4, NFR5

- [ ] **T5.5: Update Ambient TypeScript Definitions & Typecheck**
  - **Description**: Update `chrome-extension/globals.d.ts` with `TruthTheoryType`, `ContentEligibilityResult`, `AlethiologyAnalysis`, and updated `ClientTruthProfile`. Run `npm run typecheck` in `chrome-extension/` to verify zero errors under `checkJs: true`.
  - **Dependencies**: T5.1, T5.3, T5.4
  - **Traceability**: NFR4

- [ ] **T5.6: Vitest Unit & Playwright Persistent Context Integration Tests**
  - **Description**: Add unit tests in `chrome-extension/tests/unit/` for disclaimer rendering and override triggers. Add Playwright integration test `chrome-extension/tests/integration/pre-classifier-and-alethiology.spec.js` asserting UI transitions from disclaimer to full analysis upon clicking "Analyze Anyway".
  - **Dependencies**: T5.3, T5.4, T5.5
  - **Traceability**: FR12, FR13, FR14, FR15, US5

---

## Track 6: React Frontend SPA Parity

> [!TIP] PARALLEL EXECUTION
> Track 6 can proceed concurrently with Track 5.

- [ ] **T6.1: Update Frontend TypeScript Interfaces**
  - **Description**: Update `frontend/src/types/index.ts` (or `types.ts`) with `TruthTheoryType`, `ContentEligibilityResult`, `AlethiologyAnalysis`, and updated `VideoRequest`.
  - **Dependencies**: T1.1
  - **Traceability**: FR16, NFR4

- [ ] **T6.2: Implement React Pre-Classification Disclaimer & Epistemic Lens Components**
  - **Description**: Create `frontend/src/components/EligibilityDisclaimer.tsx` and `frontend/src/components/EpistemicLensCard.tsx`. Update analysis page to render disclaimer when ineligible and display Epistemic Lens in claim cards.
  - **Dependencies**: T6.1
  - **Traceability**: FR16, NFR5

- [ ] **T6.3: Verify Production Build and Linting**
  - **Description**: Run `npm run build` (`tsc -b && vite build` via TypeScript 7.0 native compiler) and `npm run lint` in `frontend/` to ensure sub-second compilation and zero lint regressions.
  - **Dependencies**: T6.1, T6.2
  - **Traceability**: FR16, NFR4

---

## Track 7: Architecture Decision Record & Documentation Sync

- [ ] **T7.1: Author ADR 005 for Pre-Classification Gate and Alethiology Agent**
  - **Description**: Create `docs/adr/005-pre-classification-gate-and-alethiology-agent.md` recording the architectural decision, options considered, Vertex AI ADK 2.0 configuration, and epistemic taxonomy rationale.
  - **Dependencies**: T4.1, T5.4
  - **Traceability**: NFR2, NFR3

- [ ] **T7.2: Update System Architecture Documentation**
  - **Description**: Update `architecture.md` and `README.md` to document the new pipeline stages, API contracts, and user guide for the "Epistemic Lens" and "Analyze Anyway" features.
  - **Dependencies**: T7.1
  - **Traceability**: Zero-Drift Invariant

- [ ] **T7.3: Full Integration Smoke Test & Zero-Drift Verification**
  - **Description**: Execute the complete backend test suite (`pytest`) and frontend/extension test suites (`npm test`, `npm run test:integration`), verifying 100% pass rate and zero drift between specification artifacts and code.
  - **Dependencies**: T4.2, T5.6, T6.3, T7.2
  - **Traceability**: Zero-Drift Invariant, US5
