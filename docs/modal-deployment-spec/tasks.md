# Modal Labs & GCP Cross-Cloud Deployment Implementation Tasks

## Track 1: Modal Infrastructure & Cross-Cloud GCP Configuration (Backend)

- [ ] **T1.1: Create Modal Deployment Entrypoint Script**
  - **Description**: Create `backend/modal_app.py` as the entrypoint for Modal Labs deployment. Import the FastAPI `app` from `app.main`. Implement a startup hook that parses the `GCP_SERVICE_ACCOUNT_JSON` Modal Secret, writes it to `/tmp/gcp_sa.json`, and exports `GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp_sa.json` for GCP Vertex AI authentication.
  - **Dependencies**: None
  - **Traceability**: FR1, FR3, NFR3, US1

- [ ] **T1.2: Define Modal Container Image with Rust Native Core Engine**
  - **Description**: In `backend/modal_app.py`, define a `modal.Image.debian_slim(python_version="3.11")`. Add `apt_install` for `curl`, `build-essential`, `pkg-config`, and `gcc`. Install the Rust toolchain via `rustup`. Copy `backend/prism_sanitizer_rs` into the container image and compile via `maturin develop --release`. Finally, install `backend/requirements.txt` and copy `backend/app`.
  - **Dependencies**: T1.1
  - **Traceability**: FR2, US2

- [ ] **T1.3: Configure Modal Secrets & Serverless Asynchronous Polling Settings**
  - **Description**: Decorate the ASGI function with `@app.function()` utilizing the built image and Modal Secret `perspective-prism-gcp-secrets` (injecting `GCP_SERVICE_ACCOUNT_JSON`, `GCP_PROJECT`, `GCP_LOCATION`, `GEMINI_TIER="paid"`, `GOOGLE_API_KEY`, `GOOGLE_CSE_ID`, and `BACKEND_CORS_ORIGINS`). Configure `scaledown_window=300` (5 minutes keep-warm) and `allow_concurrent_inputs=10` to preserve the in-memory job store during polling.
  - **Dependencies**: T1.1, T1.2
  - **Traceability**: FR1, FR3, FR4, NFR1

- [ ] **T1.4: Cross-Cloud Health Probe Verification**
  - **Description**: Ensure the deployed Modal ASGI application correctly exposes `/health` and `/health/llm`. Verify that `/health/llm` communicates with GCP Vertex AI, reports primary model `gemini-3.8-flash`, and reports `circuit_breaker_open=false`.
  - **Dependencies**: T1.3
  - **Traceability**: FR5

---

## Track 2: Client Fallback & Native Side Panel UX (Chrome Extension)

> [!TIP] PARALLEL EXECUTION
> Track 2 can be developed and tested in parallel with Track 1 by mocking API error responses in Vitest.

- [ ] **T2.1: Update Client Error Handling for Modal Status Codes**
  - **Description**: Modify `chrome-extension/client.js` to inspect HTTP response statuses. Intercept HTTP 402 (Payment Required), 429 (Too Many Requests), 502 (Bad Gateway), and 503 (Service Unavailable). Throw an `HttpError` with `code = "QUOTA_EXHAUSTED"` and `isExhaustion = true`. Update `background.js` to propagate this structured error across runtime messaging.
  - **Dependencies**: None
  - **Traceability**: FR6

- [ ] **T2.2: Implement Graceful Exhaustion UI in Native Side Panel**
  - **Description**: In `chrome-extension/sidepanel.html`, add a dedicated `#state-quota-exhausted` container styled with standard CSS variables. In `chrome-extension/sidepanel.js`, handle `QUOTA_EXHAUSTED` in `showState("quota-exhausted")`. Display a user-friendly message explaining the monthly free-tier server limit, a primary CTA button linking to the GitHub self-hosting guide, and a secondary button opening `options.html`.
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
  - **Description**: Add Vitest unit tests in `chrome-extension/tests/unit/client-retry.test.js` asserting that HTTP 402, 429, 502, and 503 responses trigger `QUOTA_EXHAUSTED`. Add unit tests in `chrome-extension/tests/unit/sidepanel.test.js` verifying UI transition into `#state-quota-exhausted`.
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
    3. Modal Secret creation command (`modal secret create perspective-prism-gcp-secrets ...`).
    4. Modal deployment command (`modal deploy backend/modal_app.py`).
    5. Extension configuration steps for pointing to the deployed URL.
  - **Dependencies**: Track 1, Track 2
  - **Traceability**: US1, US3, US4
