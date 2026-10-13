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
| FR5 | Structured error codes (`SUPADATA_QUOTA_EXHAUSTED`, `SUPADATA_KEY_REQUIRED`) and `#state-supadata-quota` state |
| FR6 | Options page "API Keys" section |
| FR7 | Backend `Header()` extraction & thread-through |
| FR8 | Supadata `httpx` async fetch in `get_transcript()` |
| FR9 | `SUPADATA_FALLBACK_LOCAL` gate |
| FR10 | New `Settings` fields |
| FR11 | Server-side key precedence |
| FR12 | `.env.example` documentation |
| FR13 | Active storage synchronization across extension views |
| FR14 | Web frontend BYOK setup path & server key fallback |
| NFR1 | Key confidentiality (no logging) |
| NFR2 | 20s timeout on Supadata calls |
| NFR3 | Non-blocking `httpx.AsyncClient` |
| NFR4 | Zero backend key storage |
| NFR5 | Onboarding panel accessibility |
| NFR6 | Idempotent config save |
| BDD | Executable Gherkin scenarios (US1–US6) via `pytest-bdd` |

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
  - **Description**: Add a `# Supadata Transcript API (BYOK)` section to `backend/.env.example` documenting all four new fields with inline comments explaining purpose, the free-tier note (100 fetches/month), the server-side default for web deployments, and that `SUPADATA_FALLBACK_LOCAL=true` enables local-dev `youtube-transcript-api` fallback.
  - **Dependencies**: T1.1
  - **Traceability**: FR12, FR14

- [ ] **T1.3 — Implement Supadata Fetch & Structured Domain Exceptions in `ClaimExtractor`**
  - **Description**: Modify `backend/app/services/claim_extractor.py`:
    1. Define domain exceptions:
       - `class SupadataQuotaExhaustedError(TranscriptRetrievalError): code = "SUPADATA_QUOTA_EXHAUSTED"`
       - `class SupadataKeyRequiredError(TranscriptRetrievalError): code = "SUPADATA_KEY_REQUIRED"`
       - `class SupadataKeyInvalidError(TranscriptRetrievalError): code = "SUPADATA_KEY_INVALID"`
    2. Add `supadata_key: str | None = None` parameter to `get_transcript(video_id, supadata_key=None)`.
    3. Resolve the effective key: `effective_key = supadata_key or settings.SUPADATA_API_KEY or None`.
    4. If `effective_key` is non-empty: make a non-blocking `async with httpx.AsyncClient() as client:` GET to `f"{settings.SUPADATA_BASE_URL}/youtube/transcript"` with `params={"url": f"https://www.youtube.com/watch?v={video_id}"}`, `headers={"x-api-key": effective_key}`, and `timeout=settings.SUPADATA_TIMEOUT`.
       - If response status is 402: raise `SupadataQuotaExhaustedError("Supadata monthly transcript quota reached.")`.
       - If response status is 401 or 403: raise `SupadataKeyInvalidError("Invalid Supadata API key.")`.
       - If response status is 4xx/5xx: raise `TranscriptRetrievalError(f"Supadata returned HTTP {response.status_code}")`.
       - Catch `httpx.TimeoutException` → re-raise as `TranscriptRetrievalError("Supadata request timed out.")`.
       - Parse valid response JSON into `Transcript` / `TranscriptSegment` objects via `_parse_supadata_response()`.
    5. If `effective_key` is absent and `settings.SUPADATA_FALLBACK_LOCAL` is `True`: execute the existing `YouTubeTranscriptApi().fetch(video_id)` path (unchanged).
    6. If `effective_key` is absent and `settings.SUPADATA_FALLBACK_LOCAL` is `False`: raise `SupadataKeyRequiredError("No Supadata API key provided and local fallback is disabled.")`.
    7. The key MUST NOT appear in any log statement.
  - **TDD**: Write failing tests in `backend/tests/test_claim_extractor.py`:
    - Mock `httpx.AsyncClient.get` returning 200 with valid Supadata JSON response → assert `Transcript` returned.
    - Mock `httpx.AsyncClient.get` returning 402 → assert `SupadataQuotaExhaustedError` raised with `e.code == "SUPADATA_QUOTA_EXHAUSTED"`.
    - Mock `httpx.AsyncClient.get` returning 401 → assert `SupadataKeyInvalidError` raised with `e.code == "SUPADATA_KEY_INVALID"`.
    - Mock `httpx.AsyncClient.get` raising `httpx.TimeoutException` → assert `TranscriptRetrievalError` raised.
    - Assert `effective_key` never appears in the exception message strings or logger.
    - `SUPADATA_FALLBACK_LOCAL=True`, no key → assert `YouTubeTranscriptApi().fetch` is called.
    - `SUPADATA_FALLBACK_LOCAL=False`, no key → assert `SupadataKeyRequiredError` raised immediately.
  - **Dependencies**: T1.1
  - **Traceability**: FR5, FR8, FR9, FR11, NFR1, NFR2, NFR3, NFR4

- [ ] **T1.4 — Thread `supadata_key` and Structured `error_code` Through Backend Pipeline**
  - **Description**: Modify `backend/app/models/schemas.py` and `backend/app/main.py`:
    1. In `backend/app/models/schemas.py`: Add `error_code: Optional[str] = None` to `JobStatusResponse`.
    2. In `backend/app/main.py`:
       - Add `x_supadata_key: str | None = Header(default=None, alias="X-Supadata-Key")` to `create_analysis_job()`.
       - In `jobs[job_id]`, initialize `"error_code": None`.
       - Pass `supadata_key=x_supadata_key` to `background_tasks.add_task(process_analysis, job_id, request, supadata_key=x_supadata_key)`.
       - Add `supadata_key: str | None = None` parameter to `process_analysis()`.
       - Pass `supadata_key=supadata_key` to `claim_extractor.get_transcript(video_id, supadata_key=supadata_key)`.
       - In `process_analysis()` exception handler:
         ```python
         async with jobs_lock:
             if job_id in jobs:
                 jobs[job_id]["status"] = JobStatus.FAILED
                 jobs[job_id]["error"] = str(e)
                 jobs[job_id]["error_code"] = getattr(e, "code", None)
         ```
       - In `get_job_status(job_id)`: return `JobStatusResponse(..., error_code=job.get("error_code"))`.
       - The key MUST NOT be stored in `jobs{}` or logged at any level.
  - **TDD**: Write failing tests in `backend/tests/test_integration.py` using `transport = ASGITransport(app=app)` and `async with AsyncClient(transport=transport, base_url="http://test") as ac:`:
    - POST `/analyze/jobs` with `X-Supadata-Key: test-key`, mock `ClaimExtractor.get_transcript` to capture kwargs, assert `supadata_key="test-key"` was passed.
    - Mock `ClaimExtractor.get_transcript` to raise `SupadataQuotaExhaustedError()`. Submit job, poll `GET /analyze/jobs/{job_id}` until failed, assert response body contains `status="failed"` and `error_code="SUPADATA_QUOTA_EXHAUSTED"`.
    - Mock `ClaimExtractor.get_transcript` to raise `SupadataKeyRequiredError()`. Submit job, poll `GET /analyze/jobs/{job_id}` until failed, assert response body contains `status="failed"` and `error_code="SUPADATA_KEY_REQUIRED"`.
  - **Dependencies**: T1.3
  - **Traceability**: FR5, FR7, FR11, NFR1, NFR4

- [ ] **T1.5 — Map Supadata Response Schema to `Transcript`**
  - **Description**: In `backend/app/services/claim_extractor.py`, implement private helper `_parse_supadata_response(data: dict) -> Transcript` mapping Supadata's `/v1/youtube/transcript` `{ "content": [{ "text": str, "offset": int, "duration": int }, ...] }`:
    - `offset` (ms) → `start` (seconds: `offset / 1000.0`)
    - `duration` (ms) → `duration` (seconds: `duration / 1000.0`)
    - `text` → `text`
    Handle missing or malformed segments gracefully with `logger.warning`.
  - **TDD**: Write unit tests in `backend/tests/test_claim_extractor.py` for `_parse_supadata_response` with: a valid payload, a payload with missing segment fields, and an empty `content` list.
  - **Dependencies**: T1.3
  - **Traceability**: FR8

---

## Track 2 — Extension: Config, Client & Key Header
> Sequential within the track. Can run **in parallel with Track 1** after T1.4 is complete.

> [!TIP] PARALLEL EXECUTION
> Track 2 tasks T2.1–T2.4 can be developed and unit-tested in parallel with Track 1 by mocking the backend with MSW v2 handlers.

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

- [ ] **T2.3 — Thread Key from Side Panel to Client with Active Storage Sync**
  - **Description**: In `chrome-extension/sidepanel.js` and `chrome-extension/background.js`:
    1. In `sidepanel.js`:
       - Register a `chrome.storage.onChanged` listener for changes to `"config"` in `local` storage. When detected, update the in-memory `supadataApiKey` state immediately.
       - Inside `startAnalysis()` (prior to calling `chrome.runtime.sendMessage({ type: "ANALYZE_VIDEO" })`), re-read the latest config via `ConfigManager.load()` to ensure the newest key is dispatched.
       - Pass `supadataApiKey: config.supadataApiKey` in the `ANALYZE_VIDEO` message payload.
    2. In `background.js`:
       - Register a `chrome.storage.onChanged` listener for `"config"` in `local` storage.
       - In `handleAnalysisRequest(message)`: read `message.supadataApiKey || config.supadataApiKey` and pass it in `activeClient.analyzeVideo(videoId, { ...options, supadataApiKey })`.
       - Preserve `sender.id === chrome.runtime.id` IPC origin check.
  - **TDD**: Add Vitest unit tests in `chrome-extension/tests/unit/sidepanel.test.js` and `background.test.js`:
    - With side panel open having key "key-old", dispatch a `chrome.storage.onChanged` event setting `supadataApiKey: "key-new"` (simulating options page save).
    - Trigger analysis in the still-open side panel.
    - Assert the message dispatched to `background.js` and the header sent by `client.createAnalysisJob` contains `"key-new"`, not `"key-old"`.
  - **Dependencies**: T2.2
  - **Traceability**: FR4, FR13, NFR1

- [ ] **T2.4 — Propagate Structured `error_code` in `pollJobStatus()`**
  - **Description**: In `chrome-extension/client.js`, update `pollJobStatus(jobId, signal)`:
    When `statusData.status === "failed"`:
    1. Construct `const err = new Error(statusData.error || "Job failed without error message");`
    2. If `statusData.error_code`: attach `err.code = statusData.error_code;` (e.g. `"SUPADATA_QUOTA_EXHAUSTED"` or `"SUPADATA_KEY_REQUIRED"`).
    3. Throw `err`.
  - **TDD**: Add Vitest unit tests in `chrome-extension/tests/unit/client.test.js`:
    - Mock status endpoint returning `{ status: "failed", error: "Monthly quota reached", error_code: "SUPADATA_QUOTA_EXHAUSTED" }`.
    - Assert `pollJobStatus()` throws an Error where `err.code === "SUPADATA_QUOTA_EXHAUSTED"` and `err.message.includes("quota")`.
    - Mock status endpoint returning `{ status: "failed", error: "Missing key", error_code: "SUPADATA_KEY_REQUIRED" }`.
    - Assert `pollJobStatus()` throws an Error where `err.code === "SUPADATA_KEY_REQUIRED"`.
  - **Dependencies**: T2.2
  - **Traceability**: FR5

---

## Track 3 — Extension: Onboarding Panel UX & Quota Handling
> Sequential. Depends on Track 2 config foundation (T2.1, T2.4).

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

- [ ] **T3.3 — Add `#state-supadata-quota` Side Panel State and Error Routing**
  - **Description**:
    1. In `chrome-extension/sidepanel.html`, add `<div id="state-supadata-quota" class="state-container" hidden>` with:
       - A heading: "Transcript Quota Reached"
       - A message explaining the 100/month free tier is exhausted.
       - A link to `https://supadata.ai/pricing` labelled "Upgrade Plan ↗".
       - A button `#pp-quota-change-key-btn` ("Change API Key") that calls `showState("onboarding-key")`.
    2. In `chrome-extension/sidepanel.js`:
       - In the error catch block for `ANALYZE_VIDEO`:
         - If `error.code === "SUPADATA_QUOTA_EXHAUSTED"`: call `showState("supadata-quota")`.
         - If `error.code === "SUPADATA_KEY_REQUIRED"` or `error.code === "SUPADATA_KEY_INVALID"`: call `showState("onboarding-key")`.
  - **TDD**: Add Vitest + jsdom unit tests in `chrome-extension/tests/unit/sidepanel-quota.test.js`:
    - When `makeAnalysisRequest()` rejects with `Error` having `code: "SUPADATA_QUOTA_EXHAUSTED"`: assert `showState("supadata-quota")` is rendered with the pricing link.
    - Click "Change API Key" on `#state-supadata-quota` → assert `showState("onboarding-key")` is rendered.
    - When `makeAnalysisRequest()` rejects with `Error` having `code: "SUPADATA_KEY_REQUIRED"`: assert `showState("onboarding-key")` is rendered.
  - **Dependencies**: T3.2, T2.4
  - **Traceability**: FR5, NFR5

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
    - On load with stored key → input populated (value set, type="password")
    - Save button click with "new-key" → `ConfigManager.save()` called with `supadataApiKey: "new-key"`
    - Success → status paragraph shows "Saved."
    - Error → status paragraph shows error text
  - **Dependencies**: T4.1
  - **Traceability**: FR6, NFR1

---

## Track 5 — Integration Tests & Documentation
> Sequential. Depends on Tracks 1, 2, 3, and 4.

- [ ] **T5.1 — Backend Integration Test: Key Header Thread-Through via ASGITransport**
  - **Description**: Add a pytest async test in `backend/tests/test_integration.py` using `transport = ASGITransport(app=app)` and `async with AsyncClient(transport=transport, base_url="http://test") as ac:`:
    1. Mock `ClaimExtractor.get_transcript` to capture the `supadata_key` kwarg.
    2. POST `/analyze/jobs` with header `X-Supadata-Key: integration-test-key`.
    3. Poll `GET /analyze/jobs/{job_id}` until job completes.
    4. Assert `get_transcript` was called with `supadata_key="integration-test-key"`.
    5. Assert `"integration-test-key"` does not appear in any log output captured by `caplog`.
  - **Dependencies**: T1.4, T1.3
  - **Traceability**: FR7, FR8, NFR1, NFR4

- [ ] **T5.2 — Backend Integration Test: End-to-End Quota & Missing Key Polling**
  - **Description**: Add pytest async tests in `backend/tests/test_integration.py` using `transport = ASGITransport(app=app)` and `async with AsyncClient(transport=transport, base_url="http://test") as ac:`:
    1. **Quota Exhaustion**: Submit a job with `X-Supadata-Key: exhausted-key`. Mock Supadata HTTP endpoint to return status 402. Poll `GET /analyze/jobs/{job_id}` until completion. Assert job `status == "failed"` and `error_code == "SUPADATA_QUOTA_EXHAUSTED"`.
    2. **Missing Key**: Submit a job with no `X-Supadata-Key` header with `settings.SUPADATA_FALLBACK_LOCAL = False` and `settings.SUPADATA_API_KEY = ""`. Poll `GET /analyze/jobs/{job_id}` until completion. Assert job `status == "failed"` and `error_code == "SUPADATA_KEY_REQUIRED"`.
  - **Dependencies**: T1.4, T1.3
  - **Traceability**: FR5, FR9

- [ ] **T5.3 — Playwright Integration Test: Onboarding & Multi-View Sync**
  - **Description**: Add Playwright persistent-context integration tests in `chrome-extension/tests/integration/byok-onboarding.test.js`:
    1. **Initial Onboarding**: Open Side Panel on YouTube watch page without key stored → verify `#state-onboarding-key` is visible → enter key and click Save → verify `#state-onboarding-key` transitions away and key is saved in storage.
    2. **Active Sync Across Pages**: Open Side Panel on YouTube watch page with key "key-1". Open Options page in a second tab and save key "key-2". Return to Side Panel without reloading, trigger analysis → intercept outbound request and verify `X-Supadata-Key` header carries "key-2".
  - **Dependencies**: T2.3, T3.2, T4.2
  - **Traceability**: US1, US4, FR13

- [ ] **T5.4 — Update `backend/.env.example` and `README.md`**
  - **Description**:
    1. In `backend/.env.example`, add the four Supadata fields under a new `# Supadata Transcript API (BYOK)` section with comments explaining server fallback for web deployments.
    2. In `README.md`, add a "Transcript API Setup" subsection under Setup/Installation explaining: what Supadata is, the free 100/month tier, web frontend configuration (`SUPADATA_API_KEY`), and how to get a key at `supadata.ai`.
  - **Dependencies**: T1.2
  - **Traceability**: FR12, FR14

- [ ] **T5.5 — Update `perspective-prism-gcp-secrets` Modal Secret Documentation**
  - **Description**: Update `docs/modal-deployment-spec/design.md` §2.3 Cross-Cloud Secret Management to note that `SUPADATA_API_KEY` is an optional entry in the Modal secret serving as the default key for web frontend requests and server-side testing. Update `docs/modal_deployment_guide.md` with the same note.
  - **Dependencies**: T1.1
  - **Traceability**: FR11, FR12, FR14

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

- [ ] **T6.2 — Write `.feature` Files for All User Stories**
  - **Description**: Transcribe the Gherkin scenarios from `requirements.md` verbatim into executable `.feature` files under `backend/tests/features/byok_supadata/`:
    - `us1_first_time_setup.feature` (US1)
    - `us2_analysis_with_key.feature` (US2)
    - `us3_quota_exhausted.feature` (US3)
    - `us4_updating_key.feature` (US4)
    - `us5_local_dev_fallback.feature` (US5)
    - `us6_web_frontend.feature` (US6)
  - **Dependencies**: T6.1
  - **Traceability**: BDD, US1–US6

- [ ] **T6.3 — Implement Step Definitions for Backend-Scope Scenarios via ASGITransport**
  - **Description**: Create `backend/tests/bdd/test_byok_supadata.py`. Implement `pytest-bdd` step definitions using `@given`, `@when`, `@then` decorators and the `scenarios()` collector for backend-scoped scenarios (`us2`, `us3`, `us4`, `us5`, `us6`).
    - Use `transport = ASGITransport(app=app)` and `async with AsyncClient(transport=transport, base_url="http://test") as ac:` for all HTTP steps (matching `httpx>=0.28.1`).
    - Control `settings.SUPADATA_FALLBACK_LOCAL` and `settings.SUPADATA_API_KEY` via `pytest` `monkeypatch`.
    - Mock Supadata responses via `unittest.mock.patch("httpx.AsyncClient.get")`.
    - Assert `status == "failed"` and `error_code` matching scenario specifications.
    - Assert `caplog` contains no key leaks.
  - **TDD sequence**:
    1. Run `pytest backend/tests/bdd/ -m bdd` → assert `PytestBDDWarning: Steps not found` for unmapped steps.
    2. Implement steps one `Scenario` at a time: implement step → run → green → next.
    3. Final run: all BDD scenarios pass.
  - **Dependencies**: T6.2, T1.3, T1.4
  - **Traceability**: BDD, FR5, FR7, FR8, FR9, FR11, NFR1, NFR4

- [ ] **T6.4 — Register `bdd` Marker in `pyproject.toml` and Verify CI Command**
  - **Description**: Confirm that `pytest -m bdd backend/tests/` selects exactly and only the BDD scenario tests. Add the BDD test run as a documented command in `README.md` under the Testing section:
    ```bash
    # Run executable Gherkin BDD acceptance scenarios
    pytest -m bdd backend/tests/
    ```
    Verify that `pytest -m "not bdd" backend/tests/` continues to collect and pass all existing non-BDD tests with zero regressions.
  - **Dependencies**: T6.3
  - **Traceability**: BDD

---

## Track 7 — Web Frontend: BYOK Setup Path & Server Fallback
> Can run in parallel with Track 2 and Track 3.

- [ ] **T7.1 — Web Frontend BYOK Key Support in `App.tsx`**
  - **Description**: In `frontend/src/App.tsx`:
    1. Add state `supadataKey` initialized from `localStorage.getItem("perspective_prism_supadata_key") || ""`.
    2. Add an optional API key input or modal dialog allowing users to enter/update their Supadata API key, saving to `localStorage`.
    3. In `startAnalysis(targetUrl, forceOverride)`:
       - Read the key from `localStorage`.
       - If non-empty, include `'X-Supadata-Key': key` in `fetch(`${apiUrl}/analyze/jobs`)` headers.
    4. In `checkStatus()`:
       - If `statusData.status === 'failed'`:
         - If `statusData.error_code === 'SUPADATA_KEY_REQUIRED'`: set an actionable error message guiding the user to enter their Supadata API key or sign up at `supadata.ai`.
         - If `statusData.error_code === 'SUPADATA_QUOTA_EXHAUSTED'`: set an actionable error message informing the user their 100/month free quota is exhausted with a link to `supadata.ai/pricing`.
  - **TDD**: Write unit tests in `frontend/src/App.test.tsx`:
    - Assert that when `localStorage` has `"perspective_prism_supadata_key": "web-key"`, `POST /analyze/jobs` is called with header `X-Supadata-Key: web-key`.
    - Assert that when backend returns `status: "failed", error_code: "SUPADATA_KEY_REQUIRED"`, the UI renders the key entry guidance.
  - **Dependencies**: T1.4
  - **Traceability**: FR14, US6

- [ ] **T7.2 — Backend Integration Test for Web Frontend Caller**
  - **Description**: In `backend/tests/test_integration.py`, add integration tests covering web frontend callers using `transport = ASGITransport(app=app)` and `async with AsyncClient(transport=transport, base_url="http://test") as ac:`:
    1. **Keyless caller with server fallback configured**: POST `/analyze/jobs` with no `X-Supadata-Key` header when `settings.SUPADATA_API_KEY = "server-key"`. Mock Supadata response. Poll job status → verify job completes successfully.
    2. **Web client caller with user-supplied key**: POST `/analyze/jobs` with `X-Supadata-Key: web-user-key` when `settings.SUPADATA_API_KEY = ""`. Mock Supadata response. Poll job status → verify job completes successfully using the client header key.
  - **Dependencies**: T1.4, T7.1
  - **Traceability**: FR11, FR14, US6
