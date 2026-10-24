# Frontend Behavior-Driven Development (BDD) Testing — Requirements Specification

> **Derived from**: [`design.md`](./design.md)  
> **Target Framework**: `playwright-bdd` 9.2.1 on Playwright Runner  
> **Constitutional Standards**: [`frontend_invariants.md`](../../.agents/rules/frontend_invariants.md) §6, [`testing_and_hygiene.md`](../../.agents/rules/testing_and_hygiene.md)

---

## 1. Functional Requirements (FR)

### Analysis Submission & Form Lifecycle
* **FR1**: The application must require a non-empty YouTube URL and prevent submission if the input is blank using native HTML5 form validation.
* **FR2**: The application must disable the submit button and display "Analyzing..." during initial job submission, and "Streaming..." during progressive updates.
* **FR3**: The application must unconditionally clear prior analysis results, prior error banners, and streaming states the instant a new URL submission is triggered (enforcing `frontend_invariants.md` §4).

### Polling, Streaming & Thinking States
* **FR4**: When the backend returns partial claims (`currentClaimsCount > 0 && status !== 'completed'`), the application must transition to streaming mode, render received claims, and show thinking indicators for pending perspectives and uncalculated alethiology.
* **FR5**: When all perspectives and analyses complete (`status === 'completed'`), streaming and loading spinners must terminate and the finalized truth profile must be rendered.

### Pre-Classification Gate & Force Override
* **FR6**: When a video is classified as non-analysable (`eligibility.is_analysable === false`), the application must render the `<EligibilityDisclaimer>` with warning icon, disclaimer title, category match badge, detected topics, and an educational tip.
* **FR7**: Clicking "⚡ Analyze Anyway" must submit a new job with `force_override: true`, targeting the immutable `analyzedUrl` that triggered the disclaimer, even if the user edited the input box in the interim (enforcing `frontend_invariants.md` §4).

### BYOK Supadata API Key Management
* **FR8**: Users must be able to expand and collapse the BYOK settings panel via `#byok-toggle-btn`.
* **FR9**: Saving an API key must persist the trimmed value in `localStorage['perspective_prism_supadata_key']`, update the toggle label to "🔑 Supadata API Key (Configured) ▼", and display a transient success notification.
* **FR10**: Clearing an API key must remove it from `localStorage` and revert the toggle label to unconfigured.
* **FR11**: The password visibility toggle button must toggle the input between `password` and `text` types and update `aria-label`.
* **FR12**: Outbound `POST /analyze/jobs` requests must include the `X-Supadata-Key` header if and only if a valid key is stored/configured.

### Error Handling & Actionable Recovery
* **FR13**: When a job fails with `SUPADATA_KEY_REQUIRED`, the application must display a descriptive alert, auto-expand the BYOK configuration panel, and render action buttons linking to Supadata signup and API key entry.
* **FR14**: When a job fails with `SUPADATA_QUOTA_EXHAUSTED`, the application must render a descriptive alert and an action button linking to Supadata pricing.
* **FR15**: General network failures (e.g. 500 server error, network drop) must render user-friendly alert banners with role="alert". Submitting a new URL must dismiss active error banners.

### Truth Profile, Perspectives & Alethiology
* **FR16**: The application must display all extracted claims with their ordinal label ("Claim 1", "Claim 2") and formatted video timestamps (`MM:SS - MM:SS`).
* **FR17**: Overall assessment verdicts ("Likely True", "Likely False", "Mixed", "Suspicious/Deceptive") must apply corresponding CSS badge classes.
* **FR18**: All four canonical perspectives (Scientific, Journalistic, Partisan Left, Partisan Right) must render with their stance badge, integer confidence percentage, visual confidence progress bar, and explanation.
* **FR19**: The Epistemic Lens card must display primary and optional secondary truth theory chips colored by canonical theory, descriptive epistemic summary, and an expandable transcript quote evidence drawer (`aria-expanded`).
* **FR20**: Deception ratings must display the numerical score (`X.X/10`) and severity classification (`High` for >7, `Moderate` for >4, `Low` for <=4).

---

## 2. Non-Functional Requirements (NFR)

* **NFR1 (Zero Live Cloud Traffic)**: All acceptance scenarios MUST execute completely offline using Playwright `page.route()` network interception. Zero live traffic to GCP Vertex AI, Supadata, or Google CSE.
* **NFR2 (Real DOM Execution)**: Acceptance scenarios MUST drive the real DOM (typing into inputs, clicking buttons, toggling accordions) and observe resulting DOM mutations. Synthesizing synthetic `fetch()` calls or bypassing component action handlers is strictly prohibited.
* **NFR3 (Two-Phase Invocation Parity)**: All scenarios MUST successfully compile via `npx bddgen` and execute cleanly via `npx playwright test`.
* **NFR4 (Execution Velocity)**: The entire frontend BDD acceptance suite must run in under 60 seconds on a standard developer workstation or CI runner.
* **NFR5 (WAI-ARIA Accessibility)**: Dynamic state containers must implement `role="status"` and `aria-live="polite"`. Error containers must implement `role="alert"`. Collapsible elements must maintain valid `aria-expanded` and `aria-controls` bindings.
* **NFR6 (Fixture Discipline)**: All video fixtures MUST use domain-relevant journalism/news URLs (e.g., `https://www.youtube.com/watch?v=PBSNewsHour_BudgetBriefing`). Never use Rick Astley or non-journalism URLs.

---

## 3. User Stories & Gherkin Feature Specifications

### User Story 1: Analysis Submission & Form Lifecycle
> As a web user researching a news video,  
> I want intuitive form validation and responsive button states,  
> So that I know my analysis request is being processed and stale data is cleared.

```gherkin
Feature: Analysis submission lifecycle
  The frontend validates YouTube URL inputs, updates button states during
  submission, and unconditionally clears previous state on new submissions.

  Scenario: Submitting with an empty URL is blocked by form validation
    Given the user navigates to the Perspective Prism web app
    When the user submits the form with an empty YouTube URL
    Then the browser prevents submission via HTML5 validation
    And no analysis job request is sent to the backend

  Scenario: Analyze button reflects loading and streaming states
    Given the analysis API will answer with a slow-processing job
    When the user submits a valid YouTube news URL
    Then the submit button is disabled
    And the button displays "Analyzing..."
    When the backend sends partial claims
    Then the button displays "Streaming..."

  Scenario: Submitting a new URL clears previous results and errors
    Given a previous analysis has rendered results on the screen
    And an active error banner is displayed
    When the user submits a new YouTube news video URL
    Then the previous results are immediately removed from the DOM
    And the previous error banner is immediately dismissed
```

---

### User Story 2: Progressive Streaming & Real-Time Thinking States
> As a web user waiting for multi-perspective analysis,  
> I want to see claims appear as they are discovered and see visual indicators for in-flight tasks,  
> So that I know the system is actively evaluating evidence without freezing.

```gherkin
Feature: Progressive job streaming and thinking indicators
  The frontend polls for job updates, renders partial claims in real-time,
  and displays thinking spinners for perspectives still in progress.

  Scenario: Partial claims render immediately while remaining perspectives are analyzed
    Given a job that returns one claim with pending perspectives
    When the user submits a YouTube news video URL
    Then Claim 1 is rendered in the results
    And the Scientific perspective shows an active thinking spinner
    And the Epistemic Lens displays an epistemological analysis thinking indicator

  Scenario: Streaming seamlessly transitions to completed results
    Given a job that is actively streaming partial claims
    When the backend status switches to completed
    Then all thinking indicators are replaced with completed perspective cards
    And the submit button reverts to its default "Analyze" state
```

---

### User Story 3: Pre-Classification Gate & Force-Override Pinning
> As a user who accidentally submitted a non-analysable video,  
> I want clear guidance on why analysis was skipped and an override option that stays pinned to the original video,  
> So that I am not charged quota on ineligible content and cannot accidentally bypass the gate on the wrong video.

```gherkin
Feature: Pre-classification eligibility disclaimer and force override
  Ineligible videos render an educational disclaimer, and the force-override
  action pins to the original URL even if the user edits the input box.

  Scenario: Non-analysable video renders eligibility disclaimer and topics
    Given the analysis API classifies the video as ineligible entertainment
    When the user submits the entertainment video URL
    Then the eligibility disclaimer banner is displayed with a warning icon
    And the disclaimer title is "Analysis Skipped"
    And the detected category badge shows "Entertainment • 95% Match"
    And detected topic badges are rendered
    And an educational tip advises navigating to news or documentary videos

  Scenario: Force analyze button sends override request
    Given an ineligible video disclaimer is currently displayed
    When the user clicks the "Analyze Anyway" button
    Then the button displays "Analyzing Anyway..." with a spinner
    And a new job is created with force_override set to true
    And the completed analysis results are rendered

  Scenario: Force analyze pins to the original URL when input is edited
    Given an ineligible video disclaimer is displayed for "Video_Alpha"
    When the user edits the input field to "Video_Beta"
    And the user clicks the "Analyze Anyway" button
    Then the override request payload contains url "Video_Alpha"
    And the override request payload does not contain "Video_Beta"
```

---

### User Story 4: BYOK Supadata API Key Management
> As a power user with my own Supadata API key,  
> I want to save my key locally, toggle its visibility, and have it sent with my requests,  
> So that I can bypass server-side transcript quota limits safely.

```gherkin
Feature: BYOK Supadata API key management
  Users configure, toggle, save, and clear their personal Supadata API key,
  which is persisted in localStorage and forwarded in request headers.

  Scenario: Toggling BYOK configuration accordion
    Given the user is on the main page with unconfigured BYOK settings
    Then the BYOK toggle button displays "Configure Supadata API Key (BYOK)"
    When the user clicks the BYOK toggle button
    Then the BYOK configuration panel is expanded
    And the toggle button has aria-expanded set to true

  Scenario: Saving Supadata API key persists to localStorage and updates button
    Given the BYOK configuration panel is open
    When the user enters "sd_live_abcdef123456" into the API key input
    And the user clicks "Save Key"
    Then the key is stored in localStorage
    And a status message confirms "API Key saved."
    And the toggle button displays "Supadata API Key (Configured)"

  Scenario: Toggling password visibility switches input type
    Given the BYOK configuration panel is open with an entered key
    Then the API key input has type "password"
    When the user clicks the "Show" visibility button
    Then the API key input has type "text"
    And the visibility button label changes to "Hide"

  Scenario: Clearing saved API key resets configuration
    Given a Supadata API key is already saved in localStorage
    When the user opens the BYOK configuration panel
    And the user clicks the "Clear" button
    Then the key is removed from localStorage
    And the API key input field is emptied
    And the toggle button reverts to "Configure Supadata API Key (BYOK)"

  Scenario: Outbound request includes X-Supadata-Key when configured
    Given a Supadata API key "sd_live_secret_key" is saved in localStorage
    When the user submits a YouTube news video URL
    Then the outbound POST request headers include "X-Supadata-Key" with value "sd_live_secret_key"

  Scenario: Outbound request omits X-Supadata-Key when not configured
    Given no Supadata API key is configured
    When the user submits a YouTube news video URL
    Then the outbound POST request headers do not include "X-Supadata-Key"
```

---

### User Story 5: Error Handling & Actionable Recovery
> As a user encountering API rate limits or network issues,  
> I want clear, actionable error alerts with one-click paths to resolve them,  
> So that I can easily fix the problem and continue analyzing videos.

```gherkin
Feature: Error handling and actionable recovery
  The frontend formats backend error codes into actionable user guidance
  and provides direct links to resolve key and quota issues.

  Scenario: SUPADATA_KEY_REQUIRED error opens BYOK panel and shows action links
    Given the analysis API fails with error code "SUPADATA_KEY_REQUIRED"
    When the user submits a YouTube news video URL
    Then an error banner is displayed explaining an API key is required
    And the BYOK configuration panel is automatically opened
    And an action link directs to "Get Free Key at Supadata.ai"
    And an "Enter API Key" action button is displayed

  Scenario: SUPADATA_QUOTA_EXHAUSTED error provides direct upgrade link
    Given the analysis API fails with error code "SUPADATA_QUOTA_EXHAUSTED"
    When the user submits a YouTube news video URL
    Then an error banner is displayed explaining quota exhaustion
    And an action link directs to "Upgrade Plan at Supadata" pointing to "https://supadata.ai/pricing"

  Scenario: Backend 500 error renders server failure alert
    Given the analysis API fails to create the job with a 500 server error
    When the user submits a YouTube news video URL
    Then an error alert is rendered stating "Failed to start analysis job"
```

---

### User Story 6: Truth Profile & Multi-Perspective Analysis
> As a citizen evaluating controversial statements,  
> I want to see claims analyzed across Scientific, Journalistic, and Partisan viewpoints,  
> So that I can understand consensus, conflicting stances, and bias severity.

```gherkin
Feature: Truth profile and multi-perspective rendering
  The frontend displays claims, overall assessments, four distinct perspectives,
  confidence progress bars, and deception ratings.

  Scenario: Multiple claims render with timestamps and overall assessments
    Given an analysis job containing two distinct claims
    When the analysis completes
    Then "Claim 1" is rendered with its claim text and timestamp
    And "Claim 2" is rendered with its claim text and timestamp
    And the overall assessment badge for Claim 1 reflects "Likely True"
    And the overall assessment badge for Claim 2 reflects "Mixed"

  Scenario: Four perspectives render with stances and confidence bars
    Given a completed claim analysis with all 4 perspectives
    When the results are displayed
    Then 4 perspective cards are rendered
    And Scientific perspective has stance "Support" and confidence "90%"
    And Journalistic perspective has stance "Support" and confidence "85%"
    And Partisan Left perspective has stance "Refute" and confidence "70%"
    And Partisan Right perspective has stance "Ambiguous" and confidence "60%"
    And each perspective card includes an explanation paragraph

  Scenario: Deception rating renders numeric score and severity tier
    Given a completed claim with deception score 8.5
    When the results are displayed
    Then the deception score displays "8.5/10"
    And the deception severity rationale displays "Deception Score: High"
```

---

### User Story 7: Epistemic Lens & Alethiology Analysis
> As an epistemologist or researcher,  
> I want to see which theory of truth grounds the speaker's claim,  
> So that I can evaluate whether claims rely on empirical facts, systemic coherence, or rhetorical consensus.

```gherkin
Feature: Epistemic lens and truth theory classification
  The frontend displays primary and secondary epistemological theories
  with dedicated color chips, descriptive summaries, and expandable quote evidence.

  Scenario: Epistemic lens displays canonical truth theories and summary
    Given a claim analyzed under "Correspondence (Empirical)" theory
    And supporting theory "Coherence (Systemic Narrative)"
    When the epistemic lens card renders
    Then the title displays "🔭 Epistemic Lens" with subtitle "Truth Framework"
    And the primary theory chip shows "Correspondence (Empirical)"
    And the secondary theory chip shows "Supporting: Coherence (Systemic Narrative)"
    And the descriptive epistemic summary is displayed

  Scenario: Expandable transcript quote evidence drawer
    Given the epistemic lens has 2 transcript quote evidence snippets
    When the card renders
    Then the quote accordion button displays "Transcript Quote Evidence (2)"
    And the quote evidences drawer is initially hidden
    When the user clicks the quote accordion toggle
    Then the quote evidences drawer becomes visible
    And both quote snippets are rendered inside blockquotes
    And the accordion toggle arrow switches from "▶" to "▼"
```

---

### User Story 8: Accessibility & Keyboard Navigation
> As a user relying on keyboard navigation and screen readers,  
> I want proper focus management, accessible labels, and live status announcements,  
> So that I can fully operate Perspective Prism without a mouse.

```gherkin
Feature: Accessibility and keyboard navigation
  The application conforms to WAI-ARIA standards for status regions,
  form controls, and keyboard navigability.

  Scenario: Full keyboard navigation through submission form
    Given the user navigates to the app using the keyboard
    When the user tabs into the YouTube URL field
    And the user types a valid news video URL
    And the user presses the "Enter" key
    Then the form is submitted
    And the loading spinner has role="status" and aria-live="polite"

  Scenario: Error banner has role alert for assistive technologies
    Given the analysis API fails with a network error
    When the user submits a news video URL
    Then the error container has role="alert"
```

---

### User Story 9: UI Resilience & Edge Cases
> As a software engineer testing edge cases,  
> I want the UI to gracefully handle empty claim sets, long texts, and polling backoff,  
> So that the app never crashes or corrupts the layout on anomalous API outputs.

```gherkin
Feature: UI resilience and edge cases
  The frontend gracefully handles edge conditions including zero claims,
  excessively long claim text, and prolonged polling backoff.

  Scenario: Analysis completed with zero verifiable claims
    Given an analysis job that completes with an empty claims array
    When the results render
    Then the results header shows the analyzed video ID
    And no truth profile cards are rendered
    And no JavaScript errors are thrown in the console

  Scenario: Very long claim text renders without layout truncation
    Given a claim with 500 characters of text
    When the results render
    Then the full claim text is displayed in the DOM
    And the claim card container expands responsively
```

---

## 4. Traceability Matrix

| Requirement | User Story | Feature File | Step Definition File |
|---|---|---|---|
| **FR1, FR2** | US1 | `tests/features/analysis_submission/submission_lifecycle.feature` | `tests/steps/analysis_submission.ts` |
| **FR3** | US1 | `tests/features/analysis_submission/submission_lifecycle.feature` | `tests/steps/analysis_submission.ts` |
| **FR4, FR5** | US2 | `tests/features/job_polling/polling_and_streaming.feature` | `tests/steps/job_polling.ts` |
| **FR6** | US3 | `tests/features/pre_classification_gate/eligibility_disclaimer.feature` | `tests/steps/pre_classification_gate.ts` |
| **FR7** | US3 | `tests/features/pre_classification_gate/eligibility_disclaimer.feature` | `tests/steps/pre_classification_gate.ts` |
| **FR8, FR9, FR10, FR11** | US4 | `tests/features/byok_supadata/byok_configuration.feature` | `tests/steps/byok_supadata.ts` |
| **FR12** | US4 | `tests/features/byok_supadata/byok_configuration.feature` | `tests/steps/byok_supadata.ts` |
| **FR13, FR14, FR15** | US5 | `tests/features/error_handling/error_recovery.feature` | `tests/steps/error_handling.ts` |
| **FR16, FR17, FR18** | US6 | `tests/features/truth_profile/truth_profile_rendering.feature` | `tests/steps/truth_profile.ts` |
| **FR19** | US7 | `tests/features/epistemic_lens/epistemic_lens_analysis.feature` | `tests/steps/epistemic_lens.ts` |
| **FR20** | US6 | `tests/features/truth_profile/truth_profile_rendering.feature` | `tests/steps/truth_profile.ts` |
| **NFR1, NFR2** | All | All features | All step definitions |
| **NFR3, NFR4** | All | `playwright.config.ts`, `package.json` | All step definitions |
| **NFR5** | US8 | `tests/features/accessibility/keyboard_and_aria.feature` | `tests/steps/accessibility.ts` |
| **NFR6** | US9 | `tests/features/ui_resilience/edge_cases.feature` | `tests/steps/ui_resilience.ts` |
