# Modal Labs & GCP Cross-Cloud Deployment Implementation Tasks

## Track 1: Modal Infrastructure & Cross-Cloud GCP Configuration (Backend)

- [x] **T1.1: Create Modal Deployment Entrypoint Script**
  - **Description**: Create `backend/modal_app.py` as the entrypoint for Modal Labs deployment. Import the FastAPI `app` from `app.main`. Implement a startup hook that parses the `GCP_SERVICE_ACCOUNT_JSON` Modal Secret, writes it to `/tmp/gcp_sa.json`, and exports `GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp_sa.json` for GCP Vertex AI authentication.
  - **Dependencies**: None
  - **Traceability**: FR1, FR3, NFR3, US1

- [x] **T1.2: Define Modal Container Image with Rust Native Core Engine**
  - **Description**: In `backend/modal_app.py`, define a `modal.Image.debian_slim(python_version="3.11")`. Add `apt_install` for `curl`, `build-essential`, `pkg-config`, and `gcc`. Install the Rust toolchain via `rustup`. Copy `backend/prism_sanitizer_rs` into `/root/prism_sanitizer_rs` and compile directly into the image environment via `PATH="/root/.cargo/bin:$PATH" pip install -e /root/prism_sanitizer_rs` (preserving system PATH directories). Install `backend/requirements.txt` (excluding the already installed editable crate) and copy `backend/app`.
  - **Dependencies**: T1.1
  - **Traceability**: FR2, US2

- [x] **T1.3: Configure Modal Secrets & Single-Container Asynchronous Polling Settings**
  - **Description**: Decorate the ASGI function with `@app.function()` utilizing the built image and Modal Secret `perspective-prism-gcp-secrets` (injecting `GCP_SERVICE_ACCOUNT_JSON`, `GCP_PROJECT`, `GCP_LOCATION`, `GEMINI_TIER="paid"`, `GOOGLE_API_KEY`, `GOOGLE_CSE_ID`, `CHROME_EXTENSION_IDS` formatted as a JSON array string `["..."]`, and `BACKEND_CORS_ORIGINS`). Configure `max_containers=1` to pin requests to a single container (preventing 404 polling mismatches), `@modal.concurrent(max_inputs=10)` (modal 1.x syntax replacing `allow_concurrent_inputs=10`), and `scaledown_window=120` (2 minutes keep-warm).
  - **Dependencies**: T1.1, T1.2
  - **Traceability**: FR1, FR3, FR4, FR8, NFR1

- [x] **T1.4: Cross-Cloud Live Health Probe Verification**
  - **Description**: Implement active outbound verification in `/health/llm` (e.g. `GET /health/llm?probe=true` executing a minimal `client.aio.models.count_tokens` call) or a dedicated deployment test command. Confirm that the deployed Modal container successfully authenticates to GCP Vertex AI and receives a valid response from `gemini-3.8-flash` with `circuit_breaker_open=false`.
  - **Dependencies**: T1.3
  - **Traceability**: FR5

---

## Track 2: Client Fallback & Native Side Panel UX (Chrome Extension)

> [!TIP] PARALLEL EXECUTION
> Track 2 can be developed and tested in parallel with Track 1 by mocking API error responses in Vitest.

- [ ] **T2.1: Update Client Error Handling for Differentiated Status Codes**
  - **Description**: Modify `chrome-extension/client.js` to inspect HTTP response status and host URL. Intercept HTTP 402 (Payment Required) or explicit `out of credits` payloads from `*.modal.run` hosts, throwing an `HttpError` with `code = "QUOTA_EXHAUSTED"` and `isExhaustion = true`. Treat HTTP 429, 502, and 503 as transient errors subjected to standard exponential backoff retries. Update `background.js` to propagate the structured exhaustion error across runtime messaging.
  - **Dependencies**: None
  - **Traceability**: FR6

- [ ] **T2.2: Implement Graceful Exhaustion UI in Native Side Panel**
  - **Description**: In `chrome-extension/sidepanel.html`, add a dedicated `#state-quota-exhausted` container styled with standard CSS variables. In `chrome-extension/sidepanel.js`, handle `QUOTA_EXHAUSTED` in `showState("quota-exhausted")`. Display a user-friendly message explaining the monthly free-tier server limit, a primary CTA button linking to the GitHub self-hosting guide (`https://github.com/JAaron93/PerspectivePrism#setup-installation`), and a secondary button opening `options.html`.
  - **Dependencies**: T2.1
  - **Traceability**: FR7, US3

- [ ] **T2.3: Verify Timeout Runway & Polling Resilience**
  - **Description**: Verify that `TIMEOUT_MS = 120000` (120s) and 2-second polling intervals in `client.js` properly accommodate Modal container cold-starts (3–8s) alongside Gemini 3.8 Flash high-thinking reasoning loops (30–90s) without triggering premature aborts.
  - **Dependencies**: None
  - **Traceability**: NFR2

- [ ] **T2.4: Configure Host Permissions & Options Page**
  - **Description**: Update `chrome-extension/manifest.json` `host_permissions` to include `"https://*.modal.run/*"`. Ensure the settings page (`options.html` and `options.js`) allows users to test and save a deployed Modal HTTPS endpoint.
  - **Dependencies**: None
  - **Traceability**: FR8, US4

---

## Track 3: Verification, Testing & Documentation

- [ ] **T3.1: Unit Tests for Extension Quota Exhaustion & Side Panel State**
  - **Description**: Add Vitest unit tests in `chrome-extension/tests/unit/client-retry.test.js` asserting that HTTP 402 triggers `QUOTA_EXHAUSTED`, while 429/502/503 trigger retries. Add unit tests in `chrome-extension/tests/unit/sidepanel.test.js` verifying UI transition into `#state-quota-exhausted` with the `#setup-installation` link.
  - **Dependencies**: T2.1, T2.2
  - **Traceability**: FR6, FR7

- [ ] **T3.2: Backend Unit Tests for Modal App Specification**
  - **Description**: Add Pytest tests in `backend/tests/test_modal_app.py` verifying that `backend/modal_app.py` correctly defines the image, secret bindings, and ASGI mount without raising configuration or import errors.
  - **Dependencies**: T1.1, T1.2, T1.3
  - **Traceability**: FR1, FR2, FR3

- [ ] **T3.3: Update Documentation & Deployment Guide**
  - **Description**: Update `README.md` and create a deployment guide detailing:
    1. Modal CLI setup (`pip install modal` and `modal setup`).
    2. GCP Service Account creation (`roles/aiplatform.user`) and JSON key export.
    3. Modal Secret creation command (`modal secret create perspective-prism-gcp-secrets ...`) including `CHROME_EXTENSION_IDS` formatted as a JSON array string `'["..."]'`.
    4. Modal deployment command (`modal deploy backend/modal_app.py`).
    5. Extension configuration steps for pointing to the deployed URL.
  - **Dependencies**: Track 1, Track 2
  - **Traceability**: US1, US3, US4
