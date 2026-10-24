# Frontend Behavior-Driven Development (BDD) Testing — Implementation Tasks

> **Derived from**: [`requirements.md`](./requirements.md) → [`design.md`](./design.md)  
> **Target Framework**: `playwright-bdd` 9.2.1 on Playwright Runner  
> **Constitutional Standards**: [`frontend_invariants.md`](../../.agents/rules/frontend_invariants.md) §6, [`testing_and_hygiene.md`](../../.agents/rules/testing_and_hygiene.md)

---

## Traceability Index

| Task ID | Domain / Track | Requirements Addressed |
|---|---|---|
| **T0.1** | Shared Mock Factory | NFR1, NFR2, NFR6 |
| **T1.1 – T1.3** | BYOK Supadata Configuration (PR 1) | FR8, FR9, FR10, FR11, FR12, NFR1, NFR2 |
| **T2.1 – T2.4** | Submission Lifecycle & Error Recovery (PR 2) | FR1, FR2, FR3, FR13, FR14, FR15, NFR5 |
| **T3.1 – T3.3** | Pre-Classification Gate & Force Override Pinning (PR 3) | FR6, FR7, NFR1, NFR2 |
| **T4.1 – T4.4** | Truth Profile, Perspectives & Epistemic Lens (PR 4) | FR16, FR17, FR18, FR19, FR20, NFR5 |
| **T5.1 – T5.4** | Progressive Streaming, Thinking States & Resilience (PR 5) | FR4, FR5, NFR1, NFR6 |
| **T6.1 – T6.2** | Accessibility & Keyboard Navigation (PR 6) | NFR5, FR1, FR8 |
| **T7.1 – T7.2** | Test Script Modernization & CI Integration | NFR3, NFR4 |

---

## Track 0 — Shared Test Harness & Mock Factory (Foundation)
> Must be implemented first or in PR 1 to provide the strongly-typed builder utilities for all subsequent step definitions.

- [x] **T0.1 — Implement Typed Mock Response Factory (`frontend/tests/support/mock_jobs.ts`)**
  - **Description**: Create `frontend/tests/support/mock_jobs.ts` exporting strongly-typed builder functions conforming to `frontend/src/types/index.ts`:
    1. `createMockJob(jobId?: string): JobResponse`
    2. `createMockCompletedStatus(jobId: string, options?: { videoId?: string; claims?: ClientClaimAnalysis[]; eligibility?: ContentEligibilityResult | null }): JobStatusResponse`
    3. `createMockStreamingStatus(jobId: string, partialClaims: ClientClaimAnalysis[]): JobStatusResponse`
    4. `createMockIneligibleStatus(jobId: string, details: { category: string; title: string; message: string; confidence?: number; topics?: string[] }): JobStatusResponse`
    5. `createMockFailedStatus(jobId: string, errorCode: string | null, errorMessage: string): JobStatusResponse`
  - **TDD / Verification**: Execute `npx tsc --project tsconfig.node.json --noEmit` to verify type compatibility with `JobStatusResponse` and `JobResponse`.
  - **Dependencies**: None
  - **Traceability**: NFR1, NFR2, NFR6

---

## Track 1 — Phase 1 / PR 1: BYOK Supadata Configuration
> Self-contained feature verifying local storage, secret masking, accordion toggling, and request header forwarding.

- [x] **T1.1 — Create BYOK Gherkin Feature (`tests/features/byok_supadata/byok_configuration.feature`)**
  - **Description**: Author Gherkin feature file with 6 scenarios:
    1. Toggling BYOK configuration accordion (`#byok-toggle-btn` toggles `#byok-config-panel` and `aria-expanded`).
    2. Saving Supadata API key persists in `localStorage` and updates toggle button label to "🔑 Supadata API Key (Configured) ▼".
    3. Toggling password visibility switches input type between `password` and `text` with accessible `aria-label`.
    4. Clearing saved API key removes it from `localStorage` and reverts toggle label to unconfigured.
    5. Outbound `POST /analyze/jobs` carries `X-Supadata-Key` header when key is configured.
    6. Outbound `POST /analyze/jobs` omits `X-Supadata-Key` header when no key is configured.
  - **Dependencies**: T0.1
  - **Traceability**: FR8, FR9, FR10, FR11, FR12

- [x] **T1.2 — Implement BYOK Step Definitions (`tests/steps/byok_supadata.ts`)**
  - **Description**: Implement step definitions using `createBdd()` from `playwright-bdd`:
    - Intercept `localStorage` state via `page.evaluate()` or UI interactions.
    - Intercept `page.route('**/analyze/jobs**')` and capture request headers into test context.
    - Assert `aria-expanded`, input types, status messages, and header values.
  - **Dependencies**: T1.1
  - **Traceability**: FR8, FR9, FR10, FR11, FR12, NFR1, NFR2

- [x] **T1.3 — Compile & Run Phase 1 BDD Acceptance Tests**
  - **Description**: Run `npx bddgen && npx playwright test tests/features/byok_supadata` in `frontend/`.
  - **Verification**: 6 passed scenarios in headless Chromium.
  - **Dependencies**: T1.2
  - **Traceability**: NFR3, NFR4

---

## Track 2 — Phase 2 / PR 2: Submission Lifecycle & Error Recovery
> Completes the input form submission lifecycle, unconditional state resets, and structured error code handling.

> [!TIP] PARALLEL EXECUTION
> Track 2 can be developed in parallel with Track 3 once Track 0/Track 1 patterns are merged.

- [x] **T2.1 — Create Submission Lifecycle Feature (`tests/features/analysis_submission/submission_lifecycle.feature`)**
  - **Description**: Author Gherkin scenarios verifying:
    1. Form validation prevents submission on empty input.
    2. Submit button state transitions ("Analyzing...", "Streaming...", disabled).
    3. Unconditional state reset: Submitting a new URL immediately clears previous results and previous error banners from the DOM.
  - **Dependencies**: T0.1
  - **Traceability**: FR1, FR2, FR3

- [x] **T2.2 — Create Error Recovery Feature (`tests/features/error_handling/error_recovery.feature`)**
  - **Description**: Author Gherkin scenarios verifying:
    1. `SUPADATA_KEY_REQUIRED` error automatically opens the BYOK configuration panel and renders actionable links ("Get Free Key", "Enter API Key").
    2. `SUPADATA_QUOTA_EXHAUSTED` error renders actionable link to `https://supadata.ai/pricing`.
    3. Server 500 failure renders friendly error alert.
    4. Re-submitting a new video dismisses active error banners.
  - **Dependencies**: T0.1
  - **Traceability**: FR13, FR14, FR15

- [x] **T2.3 — Implement Step Definitions (`tests/steps/error_handling.ts` & update `analysis_submission.ts`)**
  - **Description**: Implement step bindings using mock builder `createMockFailedStatus()`. Assert DOM alert elements (`role="alert"`), href targets, and panel expansion states.
  - **Dependencies**: T2.1, T2.2
  - **Traceability**: FR1, FR2, FR3, FR13, FR14, FR15, NFR2

- [x] **T2.4 — Compile & Run Phase 2 BDD Acceptance Tests**
  - **Description**: Run `npx bddgen && npx playwright test tests/features/analysis_submission tests/features/error_handling`.
  - **Verification**: All scenarios green.
  - **Dependencies**: T2.3
  - **Traceability**: NFR3, NFR4

---

## Track 3 — Phase 3 / PR 3: Pre-Classification Gate & Force Override Pinning
> Tests non-analysable video disclaimers and the constitutional invariant of force-override URL pinning.

> [!TIP] PARALLEL EXECUTION
> Track 3 can be developed independently of Track 4 and Track 5.

- [x] **T3.1 — Create Eligibility Disclaimer Feature (`tests/features/pre_classification_gate/eligibility_disclaimer.feature`)**
  - **Description**: Author Gherkin scenarios:
    1. Ineligible video displays disclaimer banner with warning icon, title "Analysis Skipped", category badge ("Entertainment • 95% Match"), and topic chips.
    2. Educational tip recommends navigating to news or documentary videos.
    3. Clicking "⚡ Analyze Anyway" triggers `startAnalysis` with `force_override: true` and updates button to "Analyzing Anyway...".
    4. **Force-Override Target Pinning Invariant (`frontend_invariants.md` §4)**: If the user modifies the text input after an ineligible disclaimer is shown, clicking "⚡ Analyze Anyway" MUST target the original `analyzedUrl` that generated the disclaimer, NOT the newly edited text.
  - **Dependencies**: T0.1
  - **Traceability**: FR6, FR7

- [x] **T3.2 — Implement Pre-Classification Step Definitions (`tests/steps/pre_classification_gate.ts`)**
  - **Description**: Implement steps with `createMockIneligibleStatus()`. Intercept outbound `POST /analyze/jobs` request payload and assert `body.url` matches the pinned URL and `body.force_override === true`.
  - **Dependencies**: T3.1
  - **Traceability**: FR6, FR7, NFR1, NFR2

- [x] **T3.3 — Compile & Run Phase 3 BDD Acceptance Tests**
  - **Description**: Run `npx bddgen && npx playwright test tests/features/pre_classification_gate`.
  - **Verification**: All scenarios green.
  - **Dependencies**: T3.2
  - **Traceability**: NFR3, NFR4

---

## Track 4 — Phase 4 / PR 4: Truth Profile, Perspectives & Epistemic Lens
> Tests multi-claim rendering, verdict badges, 4 perspective cards, confidence meters, deception ratings, and Alethiology truth theory chips.

- [x] **T4.1 — Create Truth Profile Feature (`tests/features/truth_profile/truth_profile_rendering.feature`)**
  - **Description**: Author Gherkin scenarios:
    1. Multi-claim rendering with ordinal labels ("Claim 1", "Claim 2") and formatted timestamps (`00:00 - 00:08`).
    2. Overall assessment verdicts apply correct CSS styling (`assessment-likely-true`, `assessment-likely-false`, `assessment-mixed`).
    3. All 4 perspectives render with stances, percentage text, inline confidence bar width, and explanation.
    4. Deception score renders `X.X/10` and severity level (`High` for >7, `Moderate` for >4, `Low` for <=4).
  - **Dependencies**: T0.1
  - **Traceability**: FR16, FR17, FR18, FR20

- [x] **T4.2 — Create Epistemic Lens Feature (`tests/features/epistemic_lens/epistemic_lens_analysis.feature`)**
  - **Description**: Author Gherkin scenarios:
    1. Renders primary theory chip (`Correspondence (Empirical)`) with theory color styling and optional secondary theory chip (`Coherence (Systemic Narrative)`).
    2. Renders descriptive epistemic summary.
    3. Quote evidence drawer toggle expands and collapses blockquotes, managing `aria-expanded` and arrow indicator.
  - **Dependencies**: T0.1
  - **Traceability**: FR19

- [x] **T4.3 — Implement Step Definitions (`tests/steps/truth_profile.ts` & `tests/steps/epistemic_lens.ts`)**
  - **Description**: Implement step definitions verifying DOM classes, text content, inline styles, and accordion expansion.
  - **Dependencies**: T4.1, T4.2
  - **Traceability**: FR16, FR17, FR18, FR19, FR20, NFR2

- [x] **T4.4 — Compile & Run Phase 4 BDD Acceptance Tests**
  - **Description**: Run `npx bddgen && npx playwright test tests/features/truth_profile tests/features/epistemic_lens`.
  - **Verification**: All scenarios green.
  - **Dependencies**: T4.3
  - **Traceability**: NFR3, NFR4

---

## Track 5 — Phase 5 / PR 5: Progressive Streaming, Thinking States & UI Resilience
> Verifies real-time streaming transitions, partial updates, pending thinking indicators, polling backoff, and layout robustness.

- [x] **T5.1 — Create Progressive Streaming Feature (`tests/features/job_polling/polling_and_streaming.feature`)**
  - **Description**: Author Gherkin scenarios:
    1. Partial claims trigger transition to streaming mode (`isStreaming = true`, button displays "Streaming...").
    2. Pending perspective triggers active `<ThinkingComponent>` spinner with context ("Analyzing Scientific perspective...").
    3. Incomplete epistemic lens shows "Analyzing epistemological framework..." thinking indicator.
    4. Deception rating shows "Analyzing bias patterns..." when score is null.
    5. Completed status cleanly transitions all thinking elements to final cards.
  - **Dependencies**: T0.1
  - **Traceability**: FR4, FR5

- [x] **T5.2 — Create UI Resilience & Edge Cases Feature (`tests/features/ui_resilience/edge_cases.feature`)**
  - **Description**: Author Gherkin scenarios:
    1. Completed job with empty claims array (`claims: []`) renders video header without error.
    2. Very long claim text (500+ characters) renders without horizontal scroll overflow or layout truncation.
  - **Dependencies**: T0.1
  - **Traceability**: NFR6

- [x] **T5.3 — Implement Step Definitions (`tests/steps/job_polling.ts` & `tests/steps/ui_resilience.ts`)**
  - **Description**: Implement step definitions controlling polling responses sequence: first call returns processing with partial claim, second call returns completed. Assert thinking component roles (`role="status"`).
  - **Dependencies**: T5.1, T5.2
  - **Traceability**: FR4, FR5, NFR1, NFR2

- [x] **T5.4 — Compile & Run Phase 5 BDD Acceptance Tests**
  - **Description**: Run `npx bddgen && npx playwright test tests/features/job_polling tests/features/ui_resilience`.
  - **Verification**: All scenarios green.
  - **Dependencies**: T5.3
  - **Traceability**: NFR3, NFR4

---

## Track 6 — Phase 6 / PR 6: Accessibility, Screen Readers & Keyboard Usability
> Validates assistive technology support, live region announcements, and keyboard-only usability.

- [x] **T6.1 — Create Accessibility Feature (`tests/features/accessibility/keyboard_and_aria.feature`)**
  - **Description**: Author Gherkin scenarios:
    1. Full keyboard tab navigation: user tabs through input, submits via Enter key, navigates into BYOK controls.
    2. Assistive live regions: loading spinner and thinking components have `role="status"` and `aria-live="polite"`. Error containers have `role="alert"`.
  - **Dependencies**: T0.1
  - **Traceability**: NFR5, FR1, FR8

- [x] **T6.2 — Implement Accessibility Step Definitions (`tests/steps/accessibility.ts`)**
  - **Description**: Use Playwright `page.keyboard.press('Tab')`, `page.keyboard.press('Enter')`, and attribute assertions (`expect(locator).toHaveAttribute('role', 'status')`).
  - **Dependencies**: T6.1
  - **Traceability**: NFR5

---

## Track 7 — Test Script Modernization & CI Integration
> Wires npm scripts and documents execution commands.

- [x] **T7.1 — Add Dedicated BDD NPM Scripts in `frontend/package.json`**
  - **Description**: Add npm convenience scripts to `frontend/package.json`:
    - `"test:bdd"`: `"npx bddgen && npx playwright test"`
    - `"test:bdd:gen"`: `"npx bddgen"`
    - `"test:bdd:ui"`: `"npx bddgen && npx playwright test --ui"`
  - **Dependencies**: None
  - **Traceability**: NFR3

- [x] **T7.2 — End-to-End Suite Verification & Full Run Benchmark**
  - **Description**: Execute `npm run test:bdd` across all 37 scenarios. Ensure total suite runtime is under 60 seconds and zero flaky tests occur.
  - **Dependencies**: Tracks 1 through 6
  - **Traceability**: NFR3, NFR4
