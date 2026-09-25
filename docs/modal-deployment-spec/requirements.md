# Modal Labs & GCP Cross-Cloud Deployment Requirements

## Context & Scope

Perspective Prism utilizes a cross-cloud architecture combining serverless compute on **Modal Labs** with foundation model reasoning and search infrastructure on **Google Cloud Platform (GCP)**. This specification defines the requirements for deploying the Python FastAPI backend to Modal Labs while integrating with GCP Vertex AI and the Manifest V3 Native Side Panel client.

---

## Functional Requirements (FR)

### Cloud Infrastructure & Compute
- **FR1 - Modal ASGI App**: The system MUST define a `modal.App` in `backend/modal_app.py` exposing the FastAPI application from `app.main` via the `@modal.asgi_app()` decorator.
- **FR2 - Container Image with Rust Native Core Engine**: The system MUST define a `modal.Image.debian_slim()` that:
  1. Installs essential Debian packages (`curl`, `build-essential`, `pkg-config`, `gcc`).
  2. Installs the Rust toolchain via `rustup` (`cargo`, `rustc`) and exports it to `PATH`.
  3. Copies the local `backend/prism_sanitizer_rs` source directory into `/root/prism_sanitizer_rs`.
  4. Compiles and installs the native Rust extension directly into the container's Python environment via `pip install -e /root/prism_sanitizer_rs` (utilizing `maturin>=1.15,<2.0`), providing a single consistent installation path without requiring a separate virtual environment.
  5. Installs all remaining Python dependencies from `backend/requirements.txt` (excluding the already installed editable crate) and copies `backend/app`.
- **FR3 - Cross-Cloud Secret Management (Option A)**: The deployment MUST inject GCP credentials, search keys, and extension configuration using Modal Secrets (`perspective-prism-gcp-secrets`):
  1. Store the GCP Service Account JSON key content as a Modal Secret string (`GCP_SERVICE_ACCOUNT_JSON`).
  2. Write this secret to `/tmp/gcp_sa.json` at container startup and export `GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp_sa.json`.
  3. Inject `GCP_PROJECT` (or `GOOGLE_CLOUD_PROJECT`), `GCP_LOCATION="global"`, and `GEMINI_TIER="paid"`.
  4. Inject Google Custom Search credentials (`GOOGLE_API_KEY`, `GOOGLE_CSE_ID`).
  5. Inject `CHROME_EXTENSION_IDS` (comma-separated string or JSON list) and `BACKEND_CORS_ORIGINS` to dynamically configure CORS origin validation.
  6. Strictly prohibit legacy AI Studio keys (`GEMINI_API_KEY`, `LLM_API_KEY`) under ADR 003.
- **FR4 - Serverless Asynchronous Polling Job Routing (Option A)**: The deployment MUST preserve background analysis jobs (`POST /analyze/jobs` -> `GET /analyze/jobs/{job_id}`) across polling intervals:
  1. Set `concurrency_limit=1` on the Modal ASGI function to strictly pin all incoming traffic to the single active container instance, preventing multi-container routing mismatches where status polls return 404 against a different container.
  2. Set `allow_concurrent_inputs=10` to process up to 10 concurrent requests within that single container.
  3. Set `scaledown_window=120` (2 minutes keep-warm) to keep the container active through background analysis and polling cycles while bounding idle compute costs.
- **FR5 - Cross-Cloud Live Health Probes**: The Modal ASGI app MUST support health verification that tests genuine outbound connectivity:
  1. Expose `/health` for basic container liveness.
  2. Enhance `/health/llm` (or provide `GET /health/llm?probe=true`) to execute an active lightweight ping (e.g. `client.aio.models.count_tokens`) against GCP Vertex AI, validating live credential authentication and model reachability rather than inspecting only local circuit-breaker variables.

### Client Fallback & UX Integration
- **FR6 - Differentiated Error Interception**: The Chrome Extension API client (`chrome-extension/client.js`) MUST distinguish permanent quota exhaustion from transient network/server errors:
  1. **Quota Exhaustion**: Explicitly detect **HTTP 402 Payment Required** (Modal credit exhaustion) or responses from a `*.modal.run` host containing explicit credit exhaustion payloads. Upon detection, throw a structured `HttpError` with `code = "QUOTA_EXHAUSTED"` and `isExhaustion = true`.
  2. **Transient Errors**: Treat HTTP 429, 502, and 503 as transient conditions subject to standard exponential backoff retries. Do NOT map generic 429/502/503 responses or self-hosted backend errors to `QUOTA_EXHAUSTED`.
- **FR7 - Native Side Panel Self-Hosting CTA**: Upon intercepting a genuine `QUOTA_EXHAUSTED` error, the Chrome Extension Native Side Panel (`chrome-extension/sidepanel.js` and `sidepanel.html`) MUST transition to `#state-quota-exhausted`:
  1. Inform the user that the project's monthly free-tier server credits on Modal Labs have been reached.
  2. Provide a direct hyperlink to the project's GitHub repository self-hosting guide (`https://github.com/JAaron93/PerspectivePrism#setup-installation`).
  3. Provide a button to open Extension Settings (`options.html`) to configure a self-hosted or custom backend URL.
- **FR8 - CORS & Host Permissions**:
  - The backend MUST permit incoming requests matching `CHROME_EXTENSION_IDS` (via `build_chrome_extension_regex`) and `BACKEND_CORS_ORIGINS`.
  - The Chrome Extension `manifest.json` MUST grant host permissions for `https://*.modal.run/*` to enable communication with deployed Modal instances.

---

## Non-Functional Requirements (NFR)

- **NFR1 - Cost Efficiency & Budget Cap**: The backend container MUST scale to zero instances after `scaledown_window=120` seconds of inactivity. Pinned to `concurrency_limit=1`, total monthly execution time cannot exceed the $30/month credit allowance under normal usage patterns.
- **NFR2 - Reasoning & Cold-Start Runway**: The client timeout MUST provide a 120-second runway (`TIMEOUT_MS = 120000`) to accommodate container cold-starts (3–8s) and Gemini 3.8 Flash high-thinking reasoning loops (30–90s) without premature aborts.
- **NFR3 - Maintainability & Zero-Intrusion**: The Modal deployment entrypoint MUST reside in a standalone script (`backend/modal_app.py`) without modifying `app/main.py` routing logic or service implementations.
- **NFR4 - Security & Secret Isolation**: Service account private keys MUST never be committed to git, baked into container image layers, or logged in stdout/stderr. Thought tokens and internal reasoning signatures MUST be strictly preserved during telemetry under ADR 007.

---

## User Stories

- **US1 (Developer Deployment)**: As a developer, I want to run `modal deploy backend/modal_app.py` to package and deploy the backend to Modal Labs so that my serverless API connects seamlessly to GCP Vertex AI without manual infrastructure provisioning.
- **US2 (Reproducible Rust Core Compilation)**: As a developer, I want the Modal container build to automatically compile `prism_sanitizer_rs` into the container environment via `pip install -e` and `maturin` so that the Rust Native Core Engine runs identically in production and local environments without venv errors.
- **US3 (User Exhaustion Guidance)**: As an end-user, if the hosted portfolio backend runs out of monthly credits, I want to be informed clearly in the Side Panel with instructions on how to self-host the backend, rather than encountering a broken interface.
- **US4 (Flexible Client Configuration)**: As an end-user, I want to configure the deployed Modal endpoint URL in the extension options page so I can switch between local development and cloud-hosted backends seamlessly.
