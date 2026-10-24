# Frontend Behavior-Driven Development (BDD) Testing Architecture — Design

> **Document Status**: Active / Implemented Reference  
> **Target Package**: `frontend/` (React 19 + TypeScript 7.0 Single Page Application)  
> **Harness Stack**: `playwright-bdd` 9.2.1 + `@playwright/test` 1.64.1 + Vite Dev Server  
> **Constitutional Standards**: [`frontend_invariants.md`](../../.agents/rules/frontend_invariants.md) §6, [`testing_and_hygiene.md`](../../.agents/rules/testing_and_hygiene.md)

---

## 1. Architectural Overview & Context

Perspective Prism analyzes YouTube video transcripts for claims, bias, and epistemic truth frameworks. While backend analytical workflows are verified with `pytest-bdd` acceptance scenarios, the React 19 Single Page Application (`frontend/`) orchestrates critical user-facing state machines:
1. **Analysis Job Lifecycle**: Submitting YouTube URLs, validating inputs, handling asynchronous polling, and managing progressive streaming transitions.
2. **Pre-Classification Gate & Ineligibility Handling**: Presenting contextual disclaimers when non-analysable content (gaming, music, podcasts) is detected, and executing force-override analysis with immutable URL pinning.
3. **BYOK (Bring Your Own Key) Supadata Management**: Persisting user API keys in `localStorage`, toggling secrets visibility, and threading `X-Supadata-Key` headers on outbound job creation requests.
4. **Epistemic Truth Profiling & Multi-Perspective Analysis**: Visually rendering 6 canonical truth theories (Alethiology), multi-perspective stance cards, confidence meters, deception severity scores, and collapsible transcript quote evidence.
5. **Actionable Error Recovery**: Surfacing structured error states (`SUPADATA_KEY_REQUIRED`, `SUPADATA_QUOTA_EXHAUSTED`, network timeouts) with one-click resolution actions.
6. **Accessibility & Keyboard Usability**: Conforming to WAI-ARIA live regions, accessible accordions, and keyboard navigation.

PR #114 introduced the `playwright-bdd` harness and proved the setup with a single smoke scenario (`submit_analysis.feature`). This design document establishes the comprehensive architectural blueprint for scaling frontend BDD coverage across all 9 application domains through an incremental, multi-phase execution strategy.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Playwright BDD Harness                          │
│                                                                        │
│   tests/features/<domain>/*.feature      tests/steps/<domain>.ts       │
│           │                                     │                      │
│           ▼                                     ▼                      │
│      npx bddgen  ────────►  .features-gen/ (Compiled Playwright Specs) │
│                                                 │                      │
│                                                 ▼                      │
│                                        npx playwright test             │
└─────────────────────────────────────────────────┬──────────────────────┘
                                                  │
                                                  ▼
                         ┌────────────────────────────────────────────────┐
                         │               Chromium Browser                 │
                         │                                                │
                         │   http://localhost:5173 (Vite Dev Server)      │
                         │   App.tsx ── React 19 Virtual DOM              │
                         │      │                                         │
                         │      ├─► DOM Interactions (Fill, Click, Focus) │
                         │      │                                         │
                         │      └─► fetch('/analyze/jobs/**')             │
                         └────────────────────────┬───────────────────────┘
                                                  │
                                                  ▼ (Network Interception)
                         ┌────────────────────────────────────────────────┐
                         │           Playwright page.route()              │
                         │                                                │
                         │   • POST /analyze/jobs ──► JobResponse         │
                         │   • GET  /analyze/jobs/{id} ──► JobStatus      │
                         │   (Offline, deterministic mock factories)      │
                         └────────────────────────────────────────────────┘
```

---

## 2. Tooling & Compiler Architecture

### 2.1 The Two-Phase BDD Execution Pipeline
Unlike traditional Vitest or Jest runners that parse tests on the fly, `playwright-bdd` operates via a two-phase compilation model:

1. **Compilation Phase (`npx bddgen`)**:
   - Parses Gherkin `.feature` files in `frontend/tests/features/`.
   - Links steps with matching `Given`, `When`, `Then` regex/string step definitions in `frontend/tests/steps/`.
   - Generates executable Playwright test specs into `.features-gen/`.
   - **Crucial Rule**: `npx bddgen` is a mandatory pre-step before running tests. Editing a `.feature` file without running `bddgen` executes stale specs.

2. **Execution Phase (`npx playwright test`)**:
   - Boots a dedicated Vite dev server on `http://localhost:5173` via Playwright's `webServer` configuration (`npm run dev -- --strictPort`).
   - Launches headless Chromium and executes the compiled specs in `.features-gen/`.
   - Drives real user actions against the live DOM and monitors network calls intercepted via `page.route()`.

### 2.2 Compiler Scope & TypeScript Separation
Per `frontend_invariants.md` §1 & §5:
- `tsconfig.app.json` governs the production SPA build (`"types": ["vite/client"]`) and explicitly excludes test harnesses.
- `tsconfig.node.json` type-checks configuration files (`playwright.config.ts`, `vite.config.ts`, `eslint.config.js`) and step definitions in `tests/steps/**/*.ts`.
- `.features-gen/`, `test-results/`, and `playwright-report/` are gitignored and excluded from ESLint.

---

## 3. Mocking & Isolation Strategy

### 3.1 Network Boundary Interception (`page.route()`)
Per `frontend_invariants.md` §6:
- **Zero Live Cloud Traffic**: Acceptance tests MUST NEVER hit live GCP Vertex AI, Supadata, or Google CSE endpoints. All tests run offline.
- **In-Browser Route Interception**: Playwright's `page.route('**/analyze/jobs**', handler)` (or regex `/\/analyze\/jobs/`) intercepts in-flight requests made by the browser runtime:
  - `POST /analyze/jobs`: Intercepts analysis job creation, inspects headers (such as `X-Supadata-Key`) and body payload (`url`, `force_override`), returning `{ job_id: "..." }`.
  - `GET /analyze/jobs/{job_id}`: Intercepts polling requests, returning canned `JobStatusResponse` objects reflecting pending, processing (with partial claims), completed, or failed states.
  - **Pattern Matching Invariant**: The glob pattern MUST use trailing double asterisks (`**/analyze/jobs**`) rather than a single asterisk (`**/analyze/jobs*`). In Playwright glob syntax, a single `*` does not match the `/` path separator, which would cause polling requests to `/analyze/jobs/{job_id}` to slip through to the live backend unmocked.
- **Real Application Code Execution**: Scenarios drive the application's actual input elements and submit handlers. Synthetic `fetch()` triggers or bypassing component state are strictly prohibited.

### 3.2 Shared Mock Factory (`frontend/tests/support/mock_jobs.ts`)
To prevent duplicate JSON fixture blobs across step definitions, all test responses are synthesized via a strongly-typed mock builder factory:

```typescript
import type { 
  JobResponse, 
  JobStatusResponse, 
  AnalysisResponse, 
  ClientClaimAnalysis,
  ContentEligibilityResult 
} from '../../src/types'

export function createMockJob(jobId = 'bdd-test-job-1'): JobResponse {
  return { job_id: jobId }
}

export function createMockCompletedStatus(
  jobId: string,
  overrides?: {
    videoId?: string
    claims?: ClientClaimAnalysis[]
    eligibility?: ContentEligibilityResult | null
  }
): JobStatusResponse { ... }

export function createMockIneligibleStatus(
  jobId: string,
  category: string,
  title: string,
  message: string,
  confidence = 0.95
): JobStatusResponse { ... }

export function createMockFailedStatus(
  jobId: string,
  errorCode: string | null,
  errorMessage: string
): JobStatusResponse { ... }
```

---

## 4. Frontend Domain Breakdown & Feature Layout

The frontend BDD test suite is organized into 9 domain packages mirroring the architectural capabilities of the React SPA:

```
frontend/tests/
├── features/
│   ├── analysis_submission/
│   │   ├── submit_analysis.feature          # Baseline smoke scenario (PR #114)
│   │   └── submission_lifecycle.feature     # Validation, buttons, state resets
│   ├── job_polling/
│   │   └── polling_and_streaming.feature    # Polling backoff, partial streaming
│   ├── pre_classification_gate/
│   │   └── eligibility_disclaimer.feature   # Disclaimers, force-override URL pinning
│   ├── byok_supadata/
│   │   └── byok_configuration.feature       # Storage, visibility, header forwarding
│   ├── error_handling/
│   │   └── error_recovery.feature           # Key required, quota exhausted, recovery
│   ├── truth_profile/
│   │   └── truth_profile_rendering.feature  # Verdicts, stances, deception scores
│   ├── epistemic_lens/
│   │   └── epistemic_lens_analysis.feature  # 6 truth theories, quote drawer
│   ├── accessibility/
│   │   └── keyboard_and_aria.feature        # Keyboard tab order, ARIA live regions
│   └── ui_resilience/
│       └── edge_cases.feature               # Zero claims, long texts, network drops
├── steps/
│   ├── analysis_submission.ts
│   ├── job_polling.ts
│   ├── pre_classification_gate.ts
│   ├── byok_supadata.ts
│   ├── error_handling.ts
│   ├── truth_profile.ts
│   ├── epistemic_lens.ts
│   ├── accessibility.ts
│   └── ui_resilience.ts
└── support/
    ├── fixtures.ts                          # Playwright test extensions & fixtures
    └── mock_jobs.ts                         # Strongly-typed mock response factory
```

---

## 5. Architectural Invariants & Behavioral Contracts

### 5.1 Unconditional State Reset on Submission (`frontend_invariants.md` §4)
- When a user submits a new URL, the application MUST immediately reset all prior results (`setResults(null)`), clear active error banners (`setError(null)`), and reset streaming indicators before issuing network calls.
- BDD scenarios must verify that an error banner from a previous failed run disappears the instant a new URL is submitted.

### 5.2 Force-Override Target Pinning (`frontend_invariants.md` §4)
- When an ineligible video disclaimer is shown, the "⚡ Analyze Anyway" button (`#pp-force-analyze-btn`) must pin its target to the immutable `analyzedUrl` that generated the disclaimer, NOT whatever text the user subsequently typed into the input field.
- BDD verification: User submits Video A (ineligible) → user edits input field to Video B → user clicks "⚡ Analyze Anyway" → the outgoing POST payload must contain `url: Video A` and `force_override: true`.

### 5.3 BYOK Header Forwarding & Storage Isolation
- When a key is saved in `localStorage['perspective_prism_supadata_key']`, every subsequent `POST /analyze/jobs` must carry the `X-Supadata-Key` header with the trimmed key value.
- When the key is cleared, subsequent requests must omit the `X-Supadata-Key` header.
- Secret values must never be logged or leaked into unmasked DOM attributes.

### 5.4 WAI-ARIA & Accessibility Discipline
- Interactive accordions (BYOK config panel, quote evidence drawer) must manage `aria-expanded` and `aria-controls`.
- Dynamic status changes (loading spinners, "Analyzing anyway...", thinking states) must carry `role="status"` and `aria-live="polite"`.
- Error messages must carry `role="alert"`.

---

## 6. Incremental Phased Rollout Strategy

To prevent massive PR diffs, avoid reviewer cognitive fatigue, and maintain passing CI quality gates across iterations, the BDD test implementation is partitioned into six sequential phases:

| Phase | PR Scope | Features Covered | Estimated Scenarios |
|---|---|---|---|
| **Phase 1** | Shared Mock Support & BYOK Configuration | `tests/support/mock_jobs.ts`, `byok_configuration.feature` | 7 scenarios |
| **Phase 2** | Submission Lifecycle & Error Recovery | `submission_lifecycle.feature`, `error_recovery.feature` | 7 scenarios |
| **Phase 3** | Pre-Classification Gate & Force Override Pinning | `eligibility_disclaimer.feature` | 5 scenarios |
| **Phase 4** | Truth Profile, Perspectives & Epistemic Lens | `truth_profile_rendering.feature`, `epistemic_lens_analysis.feature` | 8 scenarios |
| **Phase 5** | Progressive Streaming, Thinking States & Resilience | `polling_and_streaming.feature`, `edge_cases.feature` | 6 scenarios |
| **Phase 6** | Accessibility, Screen Readers & Keyboard Usability | `keyboard_and_aria.feature` | 4 scenarios |

**Total Scope**: 37 executable Gherkin acceptance scenarios across 9 domain files and 6 PRs.
