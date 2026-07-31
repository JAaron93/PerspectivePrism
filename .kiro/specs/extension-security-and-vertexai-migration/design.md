# Architecture Design: Extension Security Hardening & GCP Vertex AI Migration

## Executive Summary
This document specifies the target system architecture for **Perspective Prism**, combining Chrome Extension Security Hardening (Manifest V3, Sidepanel API, BYOK Storage) with backend provider migration to **Google Cloud Platform (GCP) Vertex AI Mode** (`google-genai` SDK in `vertexai=True` mode).

---

## 1. System Architecture Diagram

```mermaid
graph TD
    subgraph Chrome Extension [Privileged Client Realm]
        SW[Service Worker background.js]
        SP[Sidepanel UI sidepanel.js]
        CS[Content Script content.js]
        LS[(chrome.storage.local)]
    end

    subgraph FastAPI Backend [Trusted Server Realm]
        API[FastAPI Endpoints main.py]
        Sanitizer[PyO3 Rust Sanitizer input_sanitizer.py]
        CE[Claim Extractor Agent claim_extractor.py]
        AS[Analysis Service Agent analysis_service.py]
    end

    subgraph Google Cloud Platform [AI & Search Infrastructure]
        VertexAI[Vertex AI Gemini API gemini-3.5-flash-lite]
        CSE[Google Custom Search JSON API]
    end

    CS -->|Validated IPC| SW
    SP -->|Validated IPC| SW
    SW <-->|Local Unsynced State/Keys| LS
    SW -->|HTTPS / Cors Authenticated| API
    API --> Sanitizer
    Sanitizer --> CE
    Sanitizer --> AS
    CE -->|google-genai SDK (vertexai=True)| VertexAI
    AS -->|google-genai SDK (vertexai=True)| VertexAI
    AS -->|Evidence Queries| CSE
```

---

## 2. Security Threat Model & Architectural Invariants

### 2.1 BYOK (Bring Your Own Key) & Credential Protection Invariants
* **Invariant 1: Local Credential Isolation**: User API keys must **never** be stored in `chrome.storage.sync`. They are persisted exclusively in `chrome.storage.local` to prevent unencrypted cloud synchronization across Google accounts.
* **Invariant 2: Background Gateway Isolation**: Content scripts injected into YouTube pages must never hold, read, or process API keys. Only the Background Service Worker and Backend Gateway may handle credentials.

### 2.2 Indirect Prompt Injection (IPI) Invariants
* **Invariant 3: Delimited User Data Sections**: All untrusted external inputs (transcripts, video titles, evidence snippets) must be wrapped inside `===USER DATA START===` and `===USER DATA END===` section delimiters using `input_sanitizer.wrap_user_data()` before prompt interpolation.
* **Invariant 4: Gemini Structured Outputs**: Model interactions returning application business data (claim extraction, perspective & bias analyses) must enforce Pydantic response schemas (via ADK Agent `output_schema` or GenAI client `response_schema`) to guarantee that prompt injections cannot alter output structure or execute unauthorized code. Utility operations (such as `count_tokens`, health checks, and basic connectivity probes) are explicitly exempt.

### 2.3 UI & Extension DOM XSS Invariants
* **Invariant 5: DOMPurify Sanitization**: Any dynamic HTML rendering in Sidepanel or Popup views must be sanitized using DOMPurify with `javascript:` URI stripping enforced.
* **Invariant 6: Strict IPC Origin Verification**: All `chrome.runtime.onMessage` handlers in `background.js` must verify `sender.id === chrome.runtime.id`.

### 2.4 Chrome Web Store & Production Invariants
* **Invariant 7: HTTPS Only**: Production `manifest.json` must exclude all `http://localhost` host permissions.
* **Invariant 8: Minimal Permissions**: The extension must eliminate unnecessary permissions (`tabs`) in favor of `activeTab` and targeted host permissions (`https://*.youtube.com/*`).

---

## 3. Backend Provider Architecture: 100% GCP Vertex AI Mode

### 3.1 GCP Vertex AI Provider Authentication Flow
The backend exclusively operates in **GCP Vertex AI Mode** (`google-genai` SDK in `vertexai=True` mode and Google ADK 2.0 agents):

1. **GCP Project & Location Resolution via `configure_provider_env()`**:
   - Backend services (`ClaimExtractor`, `AnalysisService`) invoke `configure_provider_env(settings)` to resolve `GCP_PROJECT` (or `GOOGLE_CLOUD_PROJECT`) and `GCP_LOCATION`.
   - Sets `os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"`, `GCP_PROJECT`, `GCP_LOCATION`, and `GEMINI_TIER = "paid"` to configure Google ADK `Agent` instances for paid-tier high-throughput Vertex AI execution (300+ RPM).
   - Explicitly purges legacy AI Studio API keys (`GEMINI_API_KEY`, `LLM_API_KEY`) and conflicting environment variables from process memory (`os.environ`) to prevent stale mode detection.
2. **Standalone Client Initialization**:
   - Verification scripts and direct utilities instantiate `from google import genai` via `genai.Client(vertexai=True, project=gcp_project, location=gcp_location)`.
3. **AI Studio Key Prohibition**:
   - Legacy AI Studio API keys (`GEMINI_API_KEY`, `LLM_API_KEY`) and free-tier rate-limit throttles are permanently removed. All backend calls route through GCP Vertex AI billing credits.

### 3.2 Dynamic CORS Whitelisting
The backend CORS policy dynamically allows the production Chrome Web Store Extension ID via `CHROME_EXTENSION_IDS` environment setting:
```python
def build_chrome_extension_regex(extension_ids: list[str]) -> str | None:
    if not extension_ids:
        return None
    return f"chrome-extension://({'|'.join(re.escape(cid) for cid in extension_ids)})"
```

---

## 4. Component Mapping

| Component | Responsible Files | Primary Responsibility |
| :--- | :--- | :--- |
| **Extension Manifest** | `chrome-extension/manifest.json` | Minimal permissions, HTTPS hosts, MV3 CSP |
| **Service Worker IPC** | `chrome-extension/background.js` | IPC sender validation, state management, API proxy |
| **Config & Credentials** | `chrome-extension/config.js` | `chrome.storage.local` persistence, settings validation |
| **Sidepanel UI** | `chrome-extension/sidepanel.js` | Safe DOM creation, DOMPurify sanitization |
| **Backend Provider** | `backend/app/services/analysis_service.py`<br>`backend/app/services/claim_extractor.py` | GCP Vertex AI initialization (`google-genai`) |
| **Backend CORS** | `backend/app/main.py`<br>`backend/app/core/config.py` | CORS regex for production Extension ID |
| **Input Sanitizer** | `backend/app/utils/input_sanitizer.py` | PyO3 Rust control character & pattern filtering |
