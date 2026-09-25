# Modal Labs & GCP Cross-Cloud Deployment Requirements

## Context & Scope

Perspective Prism utilizes a cross-cloud architecture combining serverless compute on **Modal Labs** with foundation model reasoning and search infrastructure on **Google Cloud Platform (GCP)**. This specification defines the requirements for deploying the Python FastAPI backend to Modal Labs while integrating with GCP Vertex AI and the Manifest V3 Native Side Panel client.

---

## Functional Requirements (FR)

### Cloud Infrastructure & Compute
- **FR1 - Modal ASGI App**: The system MUST define a `modal.App` in `backend/modal_app.py` exposing the FastAPI application from `app.main` via the `@modal.asgi_app()` decorator.
- **FR2 - Container Image with Rust Native Core Engine**: The system MUST define a `modal.Image.debian_slim()` that:
  1. Installs essential Debian packages (`curl`, `build-essential`, `pkg-config`, `gcc`).
  2. Installs the Rust toolchain via `rustup` (`cargo`, `rustc`).
  3. Copies the local `backend/prism_sanitizer_rs` source directory into the container image before dependency resolution.
  4. Compiles the native Rust extension via `maturin>=1.15,<2.0` (`pyo3 0.29`, `aho-corasick`, `unicode-normalization`).
  5. Installs all remaining Python dependencies from `backend/requirements.txt`.
- **FR3 - Cross-Cloud Secret Management (Option A)**: The deployment MUST inject GCP credentials and environment variables using Modal Secrets (`perspective-prism-gcp-secrets`):
  1. Store the GCP Service Account JSON key content as a Modal Secret string (`GCP_SERVICE_ACCOUNT_JSON`).
  2. Write this secret to `/tmp/gcp_sa.json` at container startup and export `GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp_sa.json`.
  3. Inject `GCP_PROJECT` (or `GOOGLE_CLOUD_PROJECT`), `GCP_LOCATION="global"`, and `GEMINI_TIER="paid"`.
  4. Inject Google Custom Search credentials (`GOOGLE_API_KEY`, `GOOGLE_CSE_ID`).
  5. Strictly prohibit legacy AI Studio keys (`GEMINI_API_KEY`, `LLM_API_KEY`) under ADR 003.
- **FR4 - Serverless Asynchronous Polling Job Support (Option A)**: The deployment MUST preserve background analysis jobs (`POST /analyze/jobs` -> `GET /analyze/jobs/{job_id}`) using an in-memory job store backed by `scaledown_window=300` (5 minutes keep-warm) and `allow_concurrent_inputs=10` on the Modal ASGI function to prevent container termination while polling.
- **FR5 - Cross-Cloud Health Probes**: The Modal ASGI app MUST expose `/health` and `/health/llm` endpoints to verify container readiness, circuit-breaker status, and live connectivity to GCP Vertex AI.

### Client Fallback & UX Integration
- **FR6 - Graceful Degradation Interception**: The Chrome Extension API client (`chrome-extension/client.js`) MUST intercept HTTP status codes associated with Modal compute exhaustion or container failures:
  - `402 Payment Required`: Modal credit pool or quota exhaustion.
  - `429 Too Many Requests`: Modal concurrent container or rate limit exhaustion.
  - `502 Bad Gateway` / `503 Service Unavailable`: Modal container boot failures or server capacity exhaustion.
  Upon detecting these codes, `client.js` MUST throw a structured error with error code `QUOTA_EXHAUSTED`.
- **FR7 - Native Side Panel Self-Hosting CTA**: Upon intercepting a `QUOTA_EXHAUSTED` error, the Chrome Extension Native Side Panel (`chrome-extension/sidepanel.js` and `sidepanel.html`) MUST transition to a dedicated `#state-quota-exhausted` UI state (or enhanced error state) presenting:
  1. A clear, friendly explanation that the project's monthly free-tier server credits have been reached.
  2. A direct hyperlink to the project's GitHub repository self-hosting guide.
  3. An action button to navigate to the Extension Settings (`options.html`) to configure a custom backend URL.
- **FR8 - CORS & Host Permissions**:
  - The backend MUST permit incoming requests matching `chrome-extension://*` IDs and local development origins.
  - The Chrome Extension `manifest.json` MUST grant host permissions for `https://*.modal.run/*` to enable communication with deployed Modal instances.

---

## Non-Functional Requirements (NFR)

- **NFR1 - Cost Efficiency & Scale-to-Zero**: The backend container MUST scale to zero instances after the keep-warm window (`scaledown_window=300` seconds) expires without active traffic, conserving Modal's $30/month credit allowance.
- **NFR2 - Reasoning & Cold-Start Runway**: The client timeout MUST provide at least a 120-second runway (`TIMEOUT_MS = 120000`) to accommodate both initial container cold-starts (3–8s) and Gemini 3.8 Flash high-thinking reasoning loops (30–90s) without premature aborts.
- **NFR3 - Maintainability & Zero-Intrusion**: The Modal deployment entrypoint MUST reside in a standalone script (`backend/modal_app.py`) without modifying `app/main.py` routing logic or service implementations.
- **NFR4 - Security & Secret Isolation**: Service account private keys MUST never be committed to git, baked into container image layers, or logged in stdout/stderr. Thought tokens and internal reasoning signatures MUST be strictly preserved during telemetry under ADR 007.

---

## User Stories

- **US1 (Developer Deployment)**: As a developer, I want to run `modal deploy backend/modal_app.py` to package and deploy the backend to Modal Labs so that my serverless API connects seamlessly to GCP Vertex AI without manual infrastructure provisioning.
- **US2 (Reproducible Rust Core Compilation)**: As a developer, I want the Modal container build to automatically compile `prism_sanitizer_rs` using `maturin` and `cargo` so that the Rust Native Core Engine runs identically in production and local environments.
- **US3 (User Exhaustion Guidance)**: As an end-user, if the hosted portfolio backend runs out of monthly credits, I want to be informed clearly in the Side Panel with instructions on how to self-host the backend, rather than encountering a broken interface.
- **US4 (Flexible Client Configuration)**: As an end-user, I want to configure the deployed Modal endpoint URL in the extension options page so I can switch between local development and cloud-hosted backends seamlessly.
