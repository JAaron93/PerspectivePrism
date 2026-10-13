# BYOK API Key Management & Supadata YouTube Transcript Integration — Requirements

> Derived from [`design.md`](./design.md). All requirements trace back to the architectural decisions therein.

---

## Glossary

| Term | Definition |
|---|---|
| **BYOK** | Bring Your Own Key — user supplies their own third-party API credential |
| **Supadata** | Managed REST API (`api.supadata.ai`) that fetches YouTube transcripts via residential proxies |
| **`X-Supadata-Key`** | HTTP request header carrying the user's Supadata key from extension → backend |
| **Onboarding panel** | `#state-onboarding-key` side panel state shown when the key is absent |
| **Graceful placeholder** | Existing job-completion path that returns an error-claim when transcript fetch fails |
| **`SUPADATA_FALLBACK_LOCAL`** | Backend setting enabling `youtube-transcript-api` as a local-dev fallback |

---

## Functional Requirements

### FR1 — Supadata Key Storage (Extension)
The extension MUST store the user's Supadata API key in `chrome.storage.local` under the `config` key as the field `supadataApiKey`. The key MUST NOT be stored in `chrome.storage.sync`.

### FR2 — Onboarding Panel (Extension)
The Side Panel MUST display `#state-onboarding-key` when `supadataApiKey` is absent (empty string or undefined) at startup or after an analysis attempt receives `SUPADATA_KEY_MISSING`. The panel MUST include:
- A human-readable explanation that Supadata is free for 100 transcripts/month with no credit card required.
- A numbered three-step instruction list (sign up → copy key → paste key).
- A password-type input field with a toggle-visibility button.
- A "Get Free Key" button that opens `https://supadata.ai` in a new tab.
- A "Save & Continue" button that persists the key via `ConfigManager.save()` and transitions to the analysis state.
- A privacy notice explaining the key is stored locally and only sent to Supadata.

### FR3 — Key Validation on Save (Extension)
`ConfigValidator.validate()` MUST accept `supadataApiKey` as an optional string field. An empty string MUST pass validation (key not yet set). A non-empty string MUST pass validation without format enforcement (Supadata keys have no fixed format). The field MUST be included in `DEFAULT_CONFIG` with a default of `""`.

### FR4 — Key Header on Analysis Request (Extension)
`PerspectivePrismClient.createAnalysisJob()` MUST include the `X-Supadata-Key` header in the `POST /analyze/jobs` request whenever `supadataApiKey` is non-empty. The header MUST be omitted (not sent as an empty string) when `supadataApiKey` is absent.

### FR5 — Structured Error Codes & Quota Handling
`JobStatusResponse` MUST include an optional `error_code: Optional[str] = None` field.
- When transcript retrieval fails due to quota exhaustion (HTTP 402 from Supadata), the backend background worker MUST set `status = "failed"` and `error_code = "SUPADATA_QUOTA_EXHAUSTED"`.
- When transcript retrieval fails due to missing key and local fallback is disabled (`SUPADATA_FALLBACK_LOCAL=False`), the backend background worker MUST set `status = "failed"` and `error_code = "SUPADATA_KEY_REQUIRED"`.
- When transcript retrieval fails due to invalid key (HTTP 401/403 from Supadata), the backend background worker MUST set `status = "failed"` and `error_code = "SUPADATA_KEY_INVALID"`.
- `PerspectivePrismClient.pollJobStatus()` MUST propagate `error_code` from the failed job response onto the thrown `Error` instance (`err.code = statusData.error_code`).
- When the extension client catches `SUPADATA_QUOTA_EXHAUSTED`, the Side Panel MUST transition to `#state-supadata-quota` displaying:
  - A message explaining the user's free tier (100/month) has been reached.
  - An "Upgrade Plan" link to `https://supadata.ai/pricing`.
  - A "Change API Key" button that re-triggers `#state-onboarding-key`.
- When the extension client catches `SUPADATA_KEY_REQUIRED` or `SUPADATA_KEY_INVALID`, the Side Panel MUST transition to `#state-onboarding-key`.

### FR6 — Options Page API Key Section (Extension)
The options page (`options.html` / `options.js`) MUST include an "API Keys" section with a field for `supadataApiKey`, matching the onboarding panel input (masked, toggle-visible). Saving MUST call `ConfigManager.save()` and display a confirmation message.

### FR7 — Backend Header Extraction (Backend)
`create_analysis_job()` in `main.py` MUST declare `x_supadata_key: str | None = Header(default=None)` and pass the value to `process_analysis()` as a positional argument. The key MUST NOT be stored in `os.environ`, the `jobs{}` dictionary, or any persistent state.

### FR8 — Supadata Transcript Fetch (Backend)
`ClaimExtractor.get_transcript()` MUST accept an optional `supadata_key: str | None` parameter. When `supadata_key` is non-empty, it MUST make a non-blocking `httpx.AsyncClient` GET request to `{SUPADATA_BASE_URL}/youtube/transcript` with `params={"url": f"https://www.youtube.com/watch?v={video_id}"}` and `headers={"x-api-key": supadata_key}`. The response segments MUST be mapped to the existing `Transcript` / `TranscriptSegment` schema.

### FR9 — Local Dev Fallback (Backend)
When `supadata_key` is absent AND `settings.SUPADATA_FALLBACK_LOCAL` is `True`, `get_transcript()` MUST fall back to the existing `youtube-transcript-api` fetch path. When `SUPADATA_FALLBACK_LOCAL` is `False` (default / production), the method MUST raise `TranscriptRetrievalError` immediately without attempting `youtube-transcript-api`.

### FR10 — New Backend Settings Fields (Backend)
`Settings` in `config.py` MUST expose: `SUPADATA_API_KEY: str = ""`, `SUPADATA_FALLBACK_LOCAL: bool = False`, `SUPADATA_BASE_URL: str = "https://api.supadata.ai/v1"`, `SUPADATA_TIMEOUT: float = 20.0`.

### FR11 — Server-Side Key Precedence (Backend)
If `x_supadata_key` from the request header is absent but `settings.SUPADATA_API_KEY` is non-empty, `process_analysis()` MUST use `settings.SUPADATA_API_KEY` as the effective key. This allows deployments serving the web frontend and developer test suites to run without requiring client-supplied keys.

### FR12 — `.env.example` Documentation (Backend)
`backend/.env.example` MUST document all four new Supadata settings fields with comments explaining their purpose, the server fallback behavior, and the local-dev fallback flag.

### FR13 — Active Storage Synchronization (Extension)
`sidepanel.js` and `background.js` MUST listen to `chrome.storage.onChanged` for changes to the `config` object in `local` storage, and `sidepanel.js` MUST re-read `ConfigManager.load()` before initiating each analysis request. Any key update saved in the options page MUST immediately apply to an already-open Side Panel without requiring a panel reload.

### FR14 — Web Frontend BYOK & Server Key Fallback (Frontend)
The standalone React SPA (`frontend/src/App.tsx`) MUST support entering a Supadata API key, persisted in `localStorage` under `perspective_prism_supadata_key`, and forward it via the `X-Supadata-Key` header on `POST /analyze/jobs`. For deployments where the web frontend is accessed without client-side keys, `settings.SUPADATA_API_KEY` MUST be configured in the backend environment to serve as the default transcript provider.

---

## Non-Functional Requirements

### NFR1 — Key Confidentiality
The `supadataApiKey` value MUST NOT appear in:
- Any console log statement in the extension (use `"[key present]"` or omit entirely)
- Any backend log statement
- Any error message surfaced to the UI
- The `jobs{}` dictionary or any serialised job state

### NFR2 — Supadata Request Timeout
The Supadata HTTP call MUST respect `settings.SUPADATA_TIMEOUT` (default 20.0 seconds). On timeout, `httpx.TimeoutException` MUST be caught and re-raised as `TranscriptRetrievalError`.

### NFR3 — Non-Blocking I/O
The Supadata fetch MUST use `httpx.AsyncClient` with `await`. It MUST NOT use `requests`, `urllib`, or any synchronous HTTP client directly on the event loop.

### NFR4 — Zero Backend Storage
The per-request Supadata key MUST have a lifetime bounded to a single `process_analysis()` call. It MUST be garbage-collected when the coroutine returns.

### NFR5 — Onboarding Accessibility
The onboarding panel MUST meet WCAG 2.1 AA standards:
- The password input MUST have an associated `<label>` element.
- The toggle-visibility button MUST have a descriptive `aria-label` (e.g. `"Show API key"` / `"Hide API key"`).
- Focus MUST land on the key input when the onboarding state is first shown.
- All interactive elements MUST be keyboard-navigable.

### NFR6 — Idempotent Save
Calling `ConfigManager.save()` with the same `supadataApiKey` value multiple times MUST produce identical `chrome.storage.local` state with no side effects.

---

## User Stories

### US1 — First-Time Setup
> As a new user who has just installed the extension, when I open the Side Panel on a YouTube video, I want to see a clear onboarding screen explaining how to get a free Supadata key, so that I can complete setup in under two minutes without needing to read external documentation.

**Acceptance criteria (Gherkin):**
```gherkin
Feature: Supadata BYOK onboarding

  Scenario: First install with no key stored
    Given the extension is newly installed
    And chrome.storage.local contains no "supadataApiKey"
    When the user opens the Side Panel on a YouTube video page
    Then the side panel displays "#state-onboarding-key"
    And the panel contains the text "100 transcript fetches per month"
    And the panel contains a "Get Free Key" button linking to "https://supadata.ai"
    And the API key input field has type="password"

  Scenario: User saves a valid key
    Given the onboarding panel is displayed
    When the user types a non-empty string into the API key input
    And clicks "Save & Continue"
    Then ConfigManager.save() is called with supadataApiKey set to the entered value
    And chrome.storage.local["config"].supadataApiKey equals the entered value
    And the side panel transitions away from "#state-onboarding-key"
```

### US2 — Analysing a Video with a Key Present
> As a returning user with a saved Supadata key, when I click "Analyse" on a YouTube video, I want the analysis to fetch the transcript transparently via Supadata so I get accurate results from the cloud without any proxy setup.

**Acceptance criteria (Gherkin):**
```gherkin
  Scenario: Analysis request includes Supadata key header
    Given chrome.storage.local["config"].supadataApiKey is "test-key-abc"
    When the user triggers video analysis
    Then createAnalysisJob() sends POST /analyze/jobs
    And the request headers include "X-Supadata-Key: test-key-abc"

  Scenario: Backend uses header key for Supadata fetch
    Given the POST /analyze/jobs request contains header X-Supadata-Key: "test-key-abc"
    When the backend processes the job
    Then ClaimExtractor.get_transcript() calls the Supadata API
    And the Supadata request includes header "x-api-key: test-key-abc"
    And the key is not written to os.environ or the jobs store
```

### US3 — Quota Exhausted
> As a user who has used all 100 free transcript fetches this month, when I try to analyse a video, I want a clear message telling me my quota is exhausted and a direct link to upgrade, so I can decide whether to pay for more or wait until next month.

**Acceptance criteria (Gherkin):**
```gherkin
  Scenario: Quota exhausted error is surfaced via job polling
    Given the Supadata API returns HTTP 402 for the transcript request
    When the analysis job is submitted and polled to completion
    Then GET /analyze/jobs/{job_id} returns status "failed" and error_code "SUPADATA_QUOTA_EXHAUSTED"
    And pollJobStatus() throws an Error with error.code equal to "SUPADATA_QUOTA_EXHAUSTED"
    And the side panel displays "#state-supadata-quota"
    And the panel contains a link to "https://supadata.ai/pricing"
    And the panel contains a "Change API Key" button
```

### US4 — Updating the Key in Settings & Sync to Open Panel
> As an existing user who wants to switch to a different Supadata account, I want to be able to update my API key from the Settings/Options page without going through the full onboarding flow again, and I want an already-open Side Panel to pick up the new key immediately without needing a reload.

**Acceptance criteria (Gherkin):**
```gherkin
  Scenario: Key updated via options page propagates to active Side Panel
    Given the Side Panel is currently open in a YouTube tab
    And the user opens the options page in another tab
    When the user saves a new supadataApiKey "new-test-key-456" in the options page
    And switches back to the open Side Panel and triggers an analysis
    Then createAnalysisJob() dispatches POST /analyze/jobs
    And the request headers include "X-Supadata-Key: new-test-key-456"
```

### US5 — Local Development Without a Supadata Key
> As a developer running the backend locally, I want to be able to test the full pipeline without a Supadata key by enabling a fallback to youtube-transcript-api, so I can develop and unit-test claim extraction without a paid third-party dependency.

**Acceptance criteria (Gherkin):**
```gherkin
  Scenario: Local fallback enabled
    Given settings.SUPADATA_FALLBACK_LOCAL is True
    And no X-Supadata-Key header is present
    When ClaimExtractor.get_transcript() is called
    Then the youtube-transcript-api fetch path is attempted
    And no Supadata HTTP request is made

  Scenario: Local fallback disabled in production
    Given settings.SUPADATA_FALLBACK_LOCAL is False
    And no X-Supadata-Key header is present
    When ClaimExtractor.get_transcript() is called
    Then TranscriptRetrievalError is raised immediately
    And no youtube-transcript-api fetch is attempted
```

### US6 — Web Frontend Transcript Fetching
> As a user or tester accessing Perspective Prism via the standalone React web application, I want transcript fetching to succeed either by providing my Supadata key in the web interface or by leveraging the server's configured key, so that web-based analyses complete without cloud IP blocking errors.

**Acceptance criteria (Gherkin):**
```gherkin
  Scenario: Web frontend request with user-supplied key
    Given localStorage contains "perspective_prism_supadata_key" equal to "web-user-key"
    When the user starts analysis from the web frontend
    Then POST /analyze/jobs is sent with header "X-Supadata-Key: web-user-key"
    And the job processes with supadata_key "web-user-key"

  Scenario: Keyless web frontend request on deployment with server key
    Given no key is entered in the web frontend
    And settings.SUPADATA_API_KEY is configured on the backend
    When the user starts analysis from the web frontend
    Then POST /analyze/jobs is sent without an X-Supadata-Key header
    And the backend processes the job using settings.SUPADATA_API_KEY
```
