# BYOK API Key Management & Supadata YouTube Transcript Integration — Implementation Tasks

> Derived from [`requirements.md`](./requirements.md) → [`design.md`](./design.md).
> All tasks follow strict TDD: write the failing test first, implement the minimum code to pass, verify.

---

## Traceability Index

| ID | Requirement |
|---|---|
| FR1 | Supadata key stored in `chrome.storage.local` |
| FR2 | `#state-onboarding-key` side panel state |
| FR3 | `ConfigValidator` accepts `supadataApiKey` |
| FR4 | `X-Supadata-Key` header on `POST /analyze/jobs` |
| FR5 | `#state-supadata-quota` side panel state |
| FR6 | Options page "API Keys" section |
| FR7 | Backend `Header()` extraction & thread-through |
| FR8 | Supadata `httpx` async fetch in `get_transcript()` |
| FR9 | `SUPADATA_FALLBACK_LOCAL` gate |
| FR10 | New `Settings` fields |
| FR11 | Server-side key precedence |
| FR12 | `.env.example` documentation |
| NFR1 | Key confidentiality (no logging) |
| NFR2 | 20s timeout on Supadata calls |
| NFR3 | Non-blocking `httpx.AsyncClient` |
| NFR4 | Zero backend key storage |
| NFR5 | Onboarding panel accessibility |
| BDD | All five US Gherkin scenarios executable via `pytest-bdd` |

---

## Track 1 — Backend: Settings, Supadata Fetch & Header Threading
> Sequential. Each task depends on the previous.

- [ ] **T1.1 — Add Supadata Settings Fields**
  - **Description**: In `backend/app/core/config.py`, add four new fields to `Settings`:
    - `SUPADATA_API_KEY: str = ""`
    - `SUPADATA_FALLBACK_LOCAL: bool = False`
    - `SUPADATA_BASE_URL: str = "https://api.supadata.ai/v1"`
    - `SUPADATA_TIMEOUT: float = 20.0`
    Add a `field_validator` for `SUPADATA_TIMEOUT` enforcing `>= 1.0`. Add a `field_validator` for `SUPADATA_BASE_URL` enforcing a valid HTTPS URL in non-test environments.
  - **TDD**: Write failing test in `backend/tests/test_verify_environment.py` asserting defaults and that `SUPADATA_TIMEOUT < 1.0` raises `ValueError`. Verify it fails. Implement. Verify it passes.
  - **Dependencies**: None
  - **Traceability**: FR10, NFR2

- [ ] **T1.2 — Document New Fields in `.env.example`**
  - **Description**: Add a `# Supadata Transcript API (BYOK)` section to `backend/.env.example` documenting all four new fields with inline comments explaining purpose, the free-tier note (100 fetches/month), and that `SUPADATA_FALLBACK_LOCAL=true` enables local-dev `youtube-transcript-api` fallback.
  - **Dependencies**: T1.1
  - **Traceability**: FR12

- [ ] **T1.3 — Implement Supadata Fetch in `ClaimExtractor.get_transcript()`**
  - **Description**: Modify `backend/app/services/claim_extractor.py`:
    1. Add `supadata_key: str | None = None` parameter to `get_transcript(video_id, supadata_key=None)`.
    2. Resolve the effective key: `effective_key = supadata_key or settings.SUPADATA_API_KEY or None`.
    3. If `effective_key` is non-empty: make a non-blocking `async with httpx.AsyncClient() as client:` GET to `f"{settings.SUPADATA_BASE_URL}/youtube/transcript"` with `params={"url": f"https://www.youtube.com/watch?v={video_id}"}`, `headers={"x-api-key": effective_key}`, and `timeout=settings.SUPADATA_TIMEOUT`. Parse the response JSON into `Transcript` / `TranscriptSegment` objects. Catch `httpx.TimeoutException` → re-raise as `TranscriptRetrievalError`. Catch `httpx.HTTPStatusError` for 4xx/5xx → re-raise as `TranscriptRetrievalError` with status in the message (without leaking the key).
    4. If `effective_key` is absent and `settings.SUPADATA_FALLBACK_LOCAL` is `True`: execute the existing `YouTubeTranscriptApi().fetch(video_id)` path (unchanged).
    5. If `effective_key` is absent and `settings.SUPADATA_FALLBACK_LOCAL` is `False`: raise `TranscriptRetrievalError("No Supadata key provided and local fallback is disabled.")`.
    6. The key MUST NOT appear in any log statement.
  - **TDD**: Write failing tests in `backend/tests/test_claim_extractor.py`:
    - Mock `httpx.AsyncClient.get` returning a valid Supadata JSON response → assert `Transcript` returned.
    - Mock `httpx.AsyncClient.get` raising `httpx.TimeoutException` → assert `TranscriptRetrievalError` raised.
    - Assert `effective_key` never appears in the `TranscriptRetrievalError` message string.
    - `SUPADATA_FALLBACK_LOCAL=True`, no key → assert `YouTubeTranscriptApi().fetch` is called.
    - `SUPADATA_FALLBACK_LOCAL=False`, no key → assert `TranscriptRetrievalError` raised immediately.
  - **Dependencies**: T1.1
  - **Traceability**: FR8, FR9, FR11, NFR1, NFR2, NFR3, NFR4

- [ ] **T1.4 — Thread `supadata_key` Through `process_analysis()` and `create_analysis_job()`**
  - **Description**: Modify `backend/app/main.py`:
    1. Add `x_supadata_key: str | None = Header(default=None, alias="X-Supadata-Key")` to `create_analysis_job()` signature.
    2. Pass `supadata_key=x_supadata_key` to `background_tasks.add_task(process_analysis, job_id, request, supadata_key=x_supadata_key)`.
    3. Add `supadata_key: str | None = None` parameter to `process_analysis()`.
    4. Pass `supadata_key=supadata_key` to `claim_extractor.get_transcript(video_id, supadata_key=supadata_key)`.
    5. The key MUST NOT be stored in the `jobs{}` dictionary or logged at any level.
  - **TDD**: Write failing test in `backend/tests/test_modal_app.py` (or `test_integration.py`) using `httpx.AsyncClient(app=app)` — POST `/analyze/jobs` with `X-Supadata-Key: test-key`, mock `ClaimExtractor.get_transcript` to capture kwargs, assert `supadata_key="test-key"` was passed.
  - **Dependencies**: T1.3
  - **Traceability**: FR7, FR11, NFR1, NFR4

- [ ] **T1.5 — Map Supadata Response Schema to `Transcript`**
  - **Description**: Verify and document the Supadata response shape. The `/v1/youtube/transcript` endpoint returns `{ "content": [{ "text": str, "offset": int, "duration": int }, ...] }`. Write a private helper `_parse_supadata_response(data: dict) -> Transcript` in `claim_extractor.py` that maps `offset` (milliseconds) → `start` (seconds), `duration` (milliseconds) → `duration` (seconds), and `text` → `text`. Handle missing or malformed segments gracefully with `logger.warning`.
  - **TDD**: Write unit tests for `_parse_supadata_response` with: a valid payload, a payload with missing fields, an empty `content` list.
  - **Dependencies**: T1.3
  - **Traceability**: FR8

---

## Track 2 — Extension: Config, Client & Key Header
> Sequential within the track. Can run **in parallel with Track 1** after T1.4 is complete (integration tests need the backend).

> [!TIP] PARALLEL EXECUTION
> Track 2 tasks T2.1–T2.3 can be developed and unit-tested in parallel with Track 1 by mocking the backend with MSW v2 handlers.

- [ ] **T2.1 — Add `supadataApiKey` to Extension Config**
  - **Description**: In `chrome-extension/config.js`:
    1. Add `supadataApiKey: ""` to `DEFAULT_CONFIG`.
    2. Add a validator block in `ConfigValidator.validate()`: if `config.supadataApiKey !== undefined`, assert `typeof config.supadataApiKey === "string"` → push error if not.
    3. Update `window.DEFAULT_CONFIG` export and ES module export.
    Repeat identical changes in `chrome-extension/config-script.js` (the content-script variant).
  - **TDD**: Add Vitest unit tests in `chrome-extension/tests/unit/config.test.js`:
    - `DEFAULT_CONFIG.supadataApiKey === ""`
    - `ConfigValidator.validate({ supadataApiKey: "abc" })` → `valid: true`
    - `ConfigValidator.validate({ supadataApiKey: 123 })` → `valid: false`, error includes `"supadataApiKey"`
    - `ConfigManager.save({ ...DEFAULT_CONFIG, supadataApiKey: "test" })` → `chrome.storage.local.set` called with the field
  - **Dependencies**: None
  - **Traceability**: FR1, FR3

- [ ] **T2.2 — Send `X-Supadata-Key` Header in `createAnalysisJob()`**
  - **Description**: In `chrome-extension/client.js`, modify `createAnalysisJob(videoUrl, options = {})`:
    1. Read `supadataApiKey` from `options.supadataApiKey`.
    2. Build a `headers` object starting with `"Content-Type": "application/json"`.
    3. If `supadataApiKey` is a non-empty string, add `"X-Supadata-Key": supadataApiKey` to the headers. Do NOT add the header if `supadataApiKey` is empty or undefined.
    4. Do not log the key value at any level (log `"[supadata key present]"` or omit entirely).
  - **TDD**: Add Vitest unit tests in `chrome-extension/tests/unit/client.test.js`:
    - With `supadataApiKey: "abc"` → fetch called with headers including `"X-Supadata-Key": "abc"`
    - With `supadataApiKey: ""` → fetch called without `"X-Supadata-Key"` header
    - With `supadataApiKey` absent → fetch called without `"X-Supadata-Key"` header
    - Assert `"abc"` does not appear in any `console.log` / `console.error` mock call
  - **Dependencies**: T2.1
  - **Traceability**: FR4, NFR1

- [ ] **T2.3 — Thread Key from Side Panel to Client**
  - **Description**: In `chrome-extension/sidepanel.js`:
    1. After `ConfigManager.load()`, read `config.supadataApiKey`.
    2. Pass it into `client.analyzeVideo(url, { supadataApiKey: config.supadataApiKey })` (or equivalent call site).
    3. In `background.js` (if `analyzeVideo` routes through it): forward `supadataApiKey` in the message payload and in the `client.analyzeVideo` call. Preserve `sender.id === chrome.runtime.id` IPC origin check.
  - **TDD**: Add Vitest unit tests asserting that when `ConfigManager.load()` resolves `{ supadataApiKey: "test-key" }`, the downstream `analyzeVideo` options object includes `supadataApiKey: "test-key"`.
  - **Dependencies**: T2.2
  - **Traceability**: FR4, NFR1

---

## Track 3 — Extension: Onboarding Panel UX
> Sequential. Depends on Track 2 config foundation (T2.1).

- [ ] **T3.1 — Add `#state-onboarding-key` to Side Panel HTML**
  - **Description**: In `chrome-extension/sidepanel.html`, add a new `<div id="state-onboarding-key" class="state-container" hidden>` containing:
    - A heading: "Set Up Your Free Transcript Key"
    - An explanatory paragraph mentioning the 100 fetches/month free tier.
    - A `<ol>` with three steps (sign up, copy key, paste key).
    - A `<label for="supadata-key-input">API Key</label>` and `<input type="password" id="supadata-key-input" autocomplete="off" spellcheck="false">`.
    - A toggle-visibility `<button id="supadata-key-toggle" aria-label="Show API key">` (eye icon).
    - A `<a href="https://supadata.ai" target="_blank" rel="noopener">Get Free Key ↗</a>` button.
    - A `<button id="supadata-key-save">Save & Continue</button>`.
    - A privacy notice paragraph.
    Style using existing CSS custom properties from `sidepanel.css`. The input MUST have an associated label (NFR5). Focus MUST be set to the input on state entry.
  - **TDD**: Add Vitest + jsdom unit test in `chrome-extension/tests/unit/sidepanel-onboarding.test.js` asserting: the container exists and is `hidden` by default; the input has `type="password"`; the label `for` matches the input `id`.
  - **Dependencies**: T2.1
  - **Traceability**: FR2, NFR5

- [ ] **T3.2 — Implement Onboarding State Logic in `sidepanel.js`**
  - **Description**: In `chrome-extension/sidepanel.js`:
    1. After `ConfigManager.load()`, check if `config.supadataApiKey` is empty. If so, call `showState("onboarding-key")`.
    2. Implement `showState("onboarding-key")`: hide all other states, show `#state-onboarding-key`, set focus to `#supadata-key-input`.
    3. Wire `#supadata-key-toggle` click → toggle `input.type` between `"password"` and `"text"`, update `aria-label` accordingly.
    4. Wire `#supadata-key-save` click:
       - Read `input.value.trim()`.
       - If empty, show an inline validation error message (do not call `save()`).
       - If non-empty, call `ConfigManager.save({ ...config, supadataApiKey: input.value.trim() })`.
       - On success, call `showState("idle")` (or the default pre-analysis state).
       - On error, display a save failure message.
  - **TDD**: Add Vitest + jsdom tests:
    - Empty `supadataApiKey` in config → `showState("onboarding-key")` called
    - Non-empty `supadataApiKey` in config → `showState("onboarding-key")` NOT called
    - Save button clicked with empty input → `ConfigManager.save()` NOT called, validation error shown
    - Save button clicked with "abc" → `ConfigManager.save()` called with `supadataApiKey: "abc"`
    - Toggle button clicked → input type changes; `aria-label` updated
  - **Dependencies**: T3.1, T2.1
  - **Traceability**: FR2, FR3, NFR1, NFR5

- [ ] **T3.3 — Add `#state-supadata-quota` Side Panel State**
  - **Description**: In `chrome-extension/sidepanel.html`, add `<div id="state-supadata-quota" class="state-container" hidden>` with:
    - A heading: "Transcript Quota Reached"
    - A message explaining the 100/month free tier is exhausted.
    - A link to `https://supadata.ai/pricing` labelled "Upgrade Plan ↗".
    - A button "Change API Key" that calls `showState("onboarding-key")`.
    In `chrome-extension/client.js`, map Supadata 402 / quota-exhaustion response to a new structured error: `error.code = "SUPADATA_QUOTA_EXHAUSTED"`.
    In `chrome-extension/sidepanel.js`, handle `SUPADATA_QUOTA_EXHAUSTED` → `showState("supadata-quota")`.
  - **TDD**: Add Vitest tests:
    - Mock `POST /analyze/jobs` returning 402 with quota body → `error.code === "SUPADATA_QUOTA_EXHAUSTED"`
    - `showState("supadata-quota")` renders the correct container with the pricing link
    - "Change API Key" button click → `showState("onboarding-key")` called
  - **Dependencies**: T3.2, T2.2
  - **Traceability**: FR5

---

## Track 4 — Extension: Options Page API Keys Section
> Can run **in parallel with Track 3** after T2.1 is complete.

> [!TIP] PARALLEL EXECUTION
> Track 4 can be developed in parallel with Track 3. It only requires T2.1 (config field exists).

- [ ] **T4.1 — Add "API Keys" Section to Options Page HTML**
  - **Description**: In `chrome-extension/options.html`, add an "API Keys" `<section>` containing:
    - A section heading "API Keys".
    - A `<label for="options-supadata-key">Supadata API Key</label>`.
    - A `<input type="password" id="options-supadata-key" autocomplete="off">` with a toggle-visibility button.
    - A "How to get a free key ↗" link to `https://supadata.ai`.
    - A `<button id="options-save-keys">Save</button>`.
    - A `<p id="options-key-status" aria-live="polite"></p>` for confirmation / error messages.
    Style consistently with existing options page sections.
  - **Dependencies**: T2.1
  - **Traceability**: FR6, NFR5

- [ ] **T4.2 — Implement Options Page Key Save Logic**
  - **Description**: In `chrome-extension/options.js`:
    1. On page load, call `ConfigManager.load()` and populate `#options-supadata-key` with the stored value (show as masked).
    2. Wire toggle-visibility button on the options input (same pattern as T3.2).
    3. Wire `#options-save-keys` click → read value → call `ConfigManager.save({ ...config, supadataApiKey: trimmed })` → on success set `#options-key-status` to "Saved." → on error show error text.
    4. Key value MUST NOT be logged.
  - **TDD**: Add Vitest unit tests in `chrome-extension/tests/unit/options.test.js`:
    - On load with stored key → input populated (value set, but type="password" so visually masked)
    - Save button click with "new-key" → `ConfigManager.save()` called with `supadataApiKey: "new-key"`
    - Success → status paragraph shows "Saved."
    - Error → status paragraph shows error text
  - **Dependencies**: T4.1
  - **Traceability**: FR6, NFR1

---

## Track 5 — Integration Tests & Documentation
> Sequential. Depends on all other tracks being complete.

- [ ] **T5.1 — Backend Integration Test: Key Header Thread-Through**
  - **Description**: Add a pytest async test in `backend/tests/test_integration.py` using `httpx.AsyncClient(app=app, base_url="http://test")`:
    1. Mock `ClaimExtractor.get_transcript` to capture the `supadata_key` kwarg.
    2. POST `/analyze/jobs` with header `X-Supadata-Key: integration-test-key`.
    3. Poll job until complete.
    4. Assert `get_transcript` was called with `supadata_key="integration-test-key"`.
    5. Assert `"integration-test-key"` does not appear in any log output captured by `caplog`.
  - **Dependencies**: T1.4, T1.3
  - **Traceability**: FR7, FR8, NFR1, NFR4

- [ ] **T5.2 — Backend Integration Test: Missing Key + Fallback Off**
  - **Description**: Add a pytest async test asserting that when no `X-Supadata-Key` header is sent and `settings.SUPADATA_FALLBACK_LOCAL=False`, the job completes with `status="completed"` and the result contains the error placeholder claim (not a 4xx HTTP error on job creation).
  - **Dependencies**: T1.4, T1.3
  - **Traceability**: FR9

- [ ] **T5.3 — Playwright Integration Test: Onboarding Flow**
  - **Description**: Add a Playwright persistent-context integration test in `chrome-extension/tests/integration/byok-onboarding.test.js`:
    1. Load the side panel with `chrome.storage.local` containing no `supadataApiKey`.
    2. Assert `#state-onboarding-key` is visible.
    3. Type a key into the input and click "Save & Continue".
    4. Assert `chrome.storage.local["config"].supadataApiKey` equals the entered key.
    5. Assert `#state-onboarding-key` is no longer visible.
  - **Dependencies**: T3.2
  - **Traceability**: US1

- [ ] **T5.4 — Update `backend/.env.example` and `README.md`**
  - **Description**:
    1. In `backend/.env.example`, add the four Supadata fields under a new `# Supadata Transcript API (BYOK)` section with comments.
    2. In `README.md`, add a "Transcript API Setup" subsection under the Setup/Installation heading explaining: what Supadata is, the free 100/month tier, and how to get a key. Link to `supadata.ai`.
  - **Dependencies**: T1.2
  - **Traceability**: FR12

- [ ] **T5.5 — Update `perspective-prism-gcp-secrets` Modal Secret Documentation**
  - **Description**: Update `docs/modal-deployment-spec/design.md` §2.3 Cross-Cloud Secret Management to note that `SUPADATA_API_KEY` is an **optional** entry in the Modal secret for server-side developer testing. Update `docs/modal_deployment_guide.md` with the same note. Do not mark as required — it is a developer convenience; production users supply the key via `X-Supadata-Key`.
  - **Dependencies**: T1.1
  - **Traceability**: FR11, FR12

---

## Track 6 — pytest-bdd: Executable Gherkin Scenarios (Backend)

> [!TIP] PARALLEL EXECUTION
> Track 6 can be developed in parallel with Track 1 (T1.3–T1.4) once T6.1 (infrastructure) is done. The `.feature` files can be written immediately; step implementations fill in as Track 1 code is built.

- [ ] **T6.1 — Install `pytest-bdd` and Register `bdd` Marker**
  - **Description**:
    1. Add `pytest-bdd>=9.0.0` to `[project.optional-dependencies] dev` in `backend/pyproject.toml`.
    2. Add `"bdd: mark test as a BDD acceptance scenario (Gherkin .feature file)"` to `[tool.pytest.ini_options] markers` in `pyproject.toml`.
    3. Add `pytest-bdd>=9.0.0` to `backend/requirements.txt` (dev section comment).
    4. Create the directory `backend/tests/features/byok_supadata/` to house all `.feature` files for this spec.
    5. Create `backend/tests/bdd/__init__.py` (empty) and `backend/tests/bdd/conftest.py` importing shared fixtures from the root `tests/conftest.py`.
  - **TDD**: Run `pytest --co -q backend/tests/bdd/` and assert it collects without errors before any `.feature` files exist.
  - **Dependencies**: None
  - **Traceability**: BDD

- [ ] **T6.2 — Write `.feature` Files for All Five User Stories**
  - **Description**: Transcribe the Gherkin scenarios from `requirements.md` verbatim into executable `.feature` files under `backend/tests/features/byok_supadata/`. One file per user story:

    **`us1_first_time_setup.feature`** — US1 (First-Time Setup):
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

    **`us2_analysis_with_key.feature`** — US2 (Analysis with key present):
    ```gherkin
    Feature: Analysis request includes Supadata key header

      Scenario: Analysis request includes Supadata key header
        Given the backend receives a POST to /analyze/jobs
        And the request header "X-Supadata-Key" is "test-key-abc"
        When the job is processed
        Then ClaimExtractor.get_transcript() is called with supadata_key "test-key-abc"
        And the Supadata API receives header "x-api-key" equal to "test-key-abc"
        And the key is not written to os.environ or the jobs store

      Scenario: Backend uses server-side key when header is absent
        Given the backend receives a POST to /analyze/jobs
        And no "X-Supadata-Key" header is present
        And settings.SUPADATA_API_KEY is "server-side-key"
        When the job is processed
        Then ClaimExtractor.get_transcript() is called with supadata_key "server-side-key"
    ```

    **`us3_quota_exhausted.feature`** — US3 (Quota exhausted):
    ```gherkin
    Feature: Supadata quota exhaustion handling

      Scenario: Quota exhausted error is surfaced in job result
        Given the Supadata API returns HTTP 402 for the transcript request
        And the request header "X-Supadata-Key" is "exhausted-key"
        When the analysis job is submitted and polled to completion
        Then the job status is "completed"
        And the job result contains a transcript error claim with code "SUPADATA_QUOTA_EXHAUSTED"
    ```

    **`us4_updating_key.feature`** — US4 (Updating key in settings) — backend-scope only:
    ```gherkin
    Feature: Per-request key replaces previous key

      Scenario: New key in header supersedes server-side default
        Given settings.SUPADATA_API_KEY is "old-server-key"
        And the request header "X-Supadata-Key" is "new-user-key"
        When the job is processed
        Then ClaimExtractor.get_transcript() is called with supadata_key "new-user-key"
        And supadata_key is not "old-server-key"
    ```

    **`us5_local_dev_fallback.feature`** — US5 (Local dev fallback):
    ```gherkin
    Feature: Local development fallback behaviour

      Scenario: Local fallback enabled — youtube-transcript-api is called
        Given settings.SUPADATA_FALLBACK_LOCAL is True
        And no X-Supadata-Key header is present
        And settings.SUPADATA_API_KEY is ""
        When ClaimExtractor.get_transcript() is called with video_id "test-id"
        Then the youtube-transcript-api fetch path is attempted
        And no Supadata HTTP request is made

      Scenario: Local fallback disabled in production — immediate error
        Given settings.SUPADATA_FALLBACK_LOCAL is False
        And no X-Supadata-Key header is present
        And settings.SUPADATA_API_KEY is ""
        When ClaimExtractor.get_transcript() is called with video_id "test-id"
        Then TranscriptRetrievalError is raised immediately
        And no youtube-transcript-api fetch is attempted
        And no Supadata HTTP request is made
    ```

  - **Dependencies**: T6.1
  - **Traceability**: BDD, US1–US5

- [ ] **T6.3 — Implement Step Definitions for US2 & US5 (Backend Scope)**
  - **Description**: Create `backend/tests/bdd/test_byok_supadata.py`. Implement `pytest-bdd` step definitions using `@given`, `@when`, `@then` decorators and the `scenarios()` collector. Backend-scoped steps cover the scenarios in `us2_analysis_with_key.feature`, `us3_quota_exhausted.feature`, `us4_updating_key.feature`, and `us5_local_dev_fallback.feature`.

    Key step implementation patterns:
    - Use `pytest_asyncio` + `httpx.AsyncClient(app=app)` for HTTP-level steps.
    - Use `unittest.mock.patch` / `pytest monkeypatch` to control `settings.SUPADATA_FALLBACK_LOCAL`, `settings.SUPADATA_API_KEY`, and mock `httpx.AsyncClient` responses for Supadata calls.
    - Use `pytest` `caplog` fixture at `logging.DEBUG` level to assert the key never appears in any log output.
    - The `jobs store` assertion checks that the `jobs{}` dict entry for the job_id does not contain any string matching the test key value.

    Scaffold structure:
    ```python
    # backend/tests/bdd/test_byok_supadata.py
    import pytest
    from pytest_bdd import scenarios, given, when, then, parsers
    from httpx import AsyncClient
    from app.main import app

    scenarios(
        "../features/byok_supadata/us2_analysis_with_key.feature",
        "../features/byok_supadata/us3_quota_exhausted.feature",
        "../features/byok_supadata/us4_updating_key.feature",
        "../features/byok_supadata/us5_local_dev_fallback.feature",
    )

    @given(parsers.parse('the request header "X-Supadata-Key" is "{key}"'))
    def supadata_key_header(key):
        return {"X-Supadata-Key": key}

    # ... remaining steps
    ```

    US1 & US3 onboarding scenarios are **extension-only** (no backend step implementation needed). They are documented in `us1_first_time_setup.feature` and `us3_quota_exhausted.feature` but executed by the Playwright integration test (T5.3).

  - **TDD sequence**:
    1. Run `pytest backend/tests/bdd/ -m bdd` → assert `PytestBDDWarning: Steps not found` for all steps.
    2. Implement steps one `Scenario` at a time: implement step → run → green → next.
    3. Final run: all BDD scenarios pass.
  - **Dependencies**: T6.2, T1.3, T1.4
  - **Traceability**: BDD, FR7, FR8, FR9, FR11, NFR1, NFR4

- [ ] **T6.4 — Register `bdd` Marker in `pyproject.toml` and Verify CI Command**
  - **Description**: Confirm that `pytest -m bdd backend/tests/` selects exactly and only the BDD scenario tests. Add the BDD test run as a documented command in `README.md` under the Testing section:
    ```bash
    # Run executable Gherkin BDD acceptance scenarios
    pytest -m bdd backend/tests/
    ```
    Verify that `pytest -m "not bdd" backend/tests/` continues to collect and pass all existing non-BDD tests with zero regressions.
  - **Dependencies**: T6.3
  - **Traceability**: BDD
