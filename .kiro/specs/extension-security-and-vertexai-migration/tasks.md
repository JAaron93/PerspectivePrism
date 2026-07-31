# Implementation Tasks: Extension Security Hardening & GCP Vertex AI Migration

## Execution Tracks Overview

> [!TIP] PARALLEL EXECUTION TRACKS
> - **Track A (Extension Security & Manifest Hardening)**: Can be executed independently in `chrome-extension/`.
> - **Track B (Backend Vertex AI Provider Migration & CORS)**: Can be executed independently in `backend/`.
> - **Track C (Integration Verification & Pre-Publish Audit)**: Execution depends on Tracks A & B completion.

---

## Track A: Chrome Extension Security Hardening & MV3 Compliance

### Task 1: Migrate Key Storage from Sync to Local Storage
- **Requirement Traceability**: FR-1.1, FR-1.2, FR-1.3, US-1, BDD-1
- **Target Files**:
  - `chrome-extension/config.js`
  - `chrome-extension/config-script.js`
  - `chrome-extension/options.js`
- **Dependencies**: None
- **Acceptance Criteria**:
  - `ConfigManager.save()` writes config payload to `chrome.storage.local`.
  - `chrome.storage.sync` calls are removed for sensitive config parameters across both `config.js` and `config-script.js`.
  - Content scripts strictly do NOT access or hold API keys in memory.
  - Unit tests in `chrome-extension/tests/` pass verifying `chrome.storage.local` usage.

### Task 2: Service Worker IPC Sender Origin Validation
- **Requirement Traceability**: FR-2.1, FR-2.2, BDD-2
- **Target Files**:
  - `chrome-extension/background.js`
- **Dependencies**: None
- **Acceptance Criteria**:
  - Add origin verification `if (!sender.id || sender.id !== chrome.runtime.id)` in `chrome.runtime.onMessage.addListener`.
  - Reject untrusted messages with `{ success: false, error: "Unauthorized sender origin", code: "UNAUTHORIZED" }`.

### Task 3: Production Manifest Cleanup & CSP Enforcement
- **Requirement Traceability**: FR-3.1, FR-3.2, FR-3.3
- **Target Files**:
  - `chrome-extension/manifest.json`
- **Dependencies**: None
- **Acceptance Criteria**:
  - Remove `http://localhost:8000/*` and `http://127.0.0.1:8000/*` from production `host_permissions`.
  - Add `content_security_policy`: `{ "extension_pages": "script-src 'self'; object-src 'none';" }`.
  - Replace `"tabs"` permission with `"activeTab"` if tab URL access is gesture-based.

### Task 4: DOMPurify Sanitization in Sidepanel UI
- **Requirement Traceability**: FR-4.1, FR-4.2, US-2
- **Target Files**:
  - `chrome-extension/sidepanel.js`
  - `chrome-extension/package.json`
- **Dependencies**: None
- **Acceptance Criteria**:
  - Import DOMPurify library into extension scope.
  - Wrap claim texts, perspective stance reasoning, and titles in DOMPurify sanitization before insertion.
  - Sanitize all research links to block `javascript:` protocols.

---

## Track B: Backend Vertex AI Provider Migration & Configuration

### Task 5: Verify & Integrate Vertex AI Mode in Backend Services
- **Requirement Traceability**: FR-5.1, FR-5.2, FR-5.3, FR-5.4, US-3, BDD-3
- **Target Files**:
  - `backend/app/services/claim_extractor.py`
  - `backend/app/services/analysis_service.py`
  - `backend/app/core/config.py`
  - `backend/app/utils/input_sanitizer.py`
- **Dependencies**: None
- **Acceptance Criteria**:
  - Verify `configure_provider_env(settings)` resolves `GCP_PROJECT` or `GOOGLE_CLOUD_PROJECT` and sets `os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"`.
  - Ensure backend services (`ClaimExtractor`, `AnalysisService`) initialize Google ADK `Agent` instances with `configure_provider_env(settings)` and raise a `ValueError` only if neither `GCP_PROJECT` nor `GOOGLE_CLOUD_PROJECT` is set.
  - Standardize standalone client scripts (`verify_environment.py`, `live_smoke_test.py`) on `from google import genai; genai.Client(vertexai=True, project=gcp_project, location=gcp_location)`.
  - Enforce `===USER DATA START===` and `===USER DATA END===` section delimiters via `input_sanitizer.wrap_user_data()`.
  - Enforce Pydantic structured output schemas for model calls returning application business data (using ADK Agent `output_schema` for claim extraction and GenAI client `response_schema` for perspective/bias analyses), while exempting non-structured operations like `count_tokens` and health probes.
  - Run pytest suite `pytest backend/tests/test_analysis_service_init.py` cleanly.

### Task 6: Environment Template & Verifier Documentation Audit
- **Requirement Traceability**: FR-5.1, NFR-2.1, NFR-2.2
- **Target Files**:
  - `backend/.env.example`
  - `README.md`
- **Dependencies**: Task 5
- **Acceptance Criteria**:
  - Document `GCP_PROJECT`, `GCP_LOCATION`, and `GEMINI_TIER=paid` in `.env.example`.
  - Add instructions for linking GCP Billing and enabling `aiplatform.googleapis.com`.
  - Document ingress-level HTTPS and TLS protocol configuration requirements for production deployments.

### Task 7: Dynamic Production Extension ID CORS Configuration
- **Requirement Traceability**: FR-6.1
- **Target Files**:
  - `backend/app/core/config.py`
  - `backend/app/main.py`
- **Dependencies**: Task 5
- **Acceptance Criteria**:
  - Verify `build_chrome_extension_regex(settings.CHROME_EXTENSION_IDS)` matches Web Store extension IDs dynamically.

---

## Track C: Integration Testing & Verification

### Task 8: End-to-End Test Suite Execution
- **Requirement Traceability**: NFR-1.1, NFR-1.2, NFR-2.1, NFR-2.2
- **Target Files**:
  - `chrome-extension/tests/`
  - `backend/tests/`
- **Dependencies**: Tracks A & B
- **Acceptance Criteria**:
  - Run `pytest` in `backend/` with dummy credentials passing 100%.
  - Run `npm test` in `chrome-extension/` passing 100%.
  - Verify zero `429 RESOURCE_EXHAUSTED` errors during high-throughput execution.
  - Verify storage isolation, IPC sender validation, and DOMPurify sanitization tests pass cleanly.
