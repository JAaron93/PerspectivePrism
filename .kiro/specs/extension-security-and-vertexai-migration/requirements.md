# Requirements Specification: Extension Security Hardening & GCP Vertex AI Migration

## Glossaries & Traceability Matrix

### Glossary
- **BYOK**: Bring Your Own Key — Client-side API key configuration pattern.
- **IPI**: Indirect Prompt Injection — Attack vector using untrusted transcript data to hijack LLM behavior.
- **CWS**: Chrome Web Store — Extension marketplace and reviewer pipeline.
- **IPC**: Inter-Process Communication — Messaging between extension contexts via `chrome.runtime.onMessage`.
- **ADC**: Application Default Credentials — GCP IAM authentication pattern for Vertex AI mode.

---

## 1. Functional Requirements (FR)

### FR-1: Local Credential Isolation & Storage Security
- **FR-1.1**: The extension MUST store all user API keys and sensitive tokens exclusively in `chrome.storage.local`.
- **FR-1.2**: The extension MUST NOT write or sync API keys into `chrome.storage.sync`.
- **FR-1.3**: The content script MUST NOT access, log, or hold API key references in memory.

### FR-2: Extension IPC Sender Verification
- **FR-2.1**: The Background Service Worker (`background.js`) MUST verify that `sender.id === chrome.runtime.id` for all `chrome.runtime.onMessage` listeners.
- **FR-2.2**: Messages from unauthorized extension IDs or unverified web origins MUST be rejected with a `403 Unauthorized` status response.

### FR-3: Chrome Web Store Manifest Compliance
- **FR-3.1**: Production `manifest.json` MUST NOT include HTTP endpoints (e.g. `http://localhost:8000/*`) in `host_permissions`.
- **FR-3.2**: The manifest MUST explicitly configure `content_security_policy` restricting extension pages to `script-src 'self'; object-src 'none';`.
- **FR-3.3**: The manifest MUST utilize `"activeTab"` instead of `"tabs"` for current video page URL extraction.

### FR-4: Sidepanel & UI DOM Purify Sanitization
- **FR-4.1**: All dynamic LLM outputs rendered in `sidepanel.js` or overlay popups MUST undergo HTML sanitization via DOMPurify before DOM insertion.
- **FR-4.2**: Links generated from AI research MUST be sanitized to block `javascript:` protocols.

### FR-5: Backend GCP Vertex AI Provider Migration
- **FR-5.1**: The FastAPI backend MUST check for `GCP_PROJECT` or `GOOGLE_CLOUD_PROJECT` environment variables on startup.
- **FR-5.2**: When `GCP_PROJECT` is set, the backend MUST initialize `google.genai.Client` with `vertexai=True`, `project=gcp_project`, and `location=gcp_location`.
- **FR-5.3**: When `GCP_PROJECT` is not set, the backend MUST fall back cleanly to `GEMINI_API_KEY` / `LLM_API_KEY` mode.
- **FR-5.4**: Structured output enforcement via `response_schema` MUST be active across both Vertex AI and AI Studio modes.

### FR-6: Dynamic Backend CORS Whitelisting
- **FR-6.1**: The FastAPI backend CORS middleware MUST validate Chrome Extension origin headers against the allowlist defined in `CHROME_EXTENSION_IDS`.

---

## 2. Non-Functional Requirements (NFR)

### NFR-1: Performance & Quota Throughput
- **NFR-1.1**: Vertex AI Mode MUST support a burst throughput of at least 300 Requests Per Minute (RPM) without triggering `429 RESOURCE_EXHAUSTED` rate limits.
- **NFR-1.2**: Extension sidepanel rendering latency after job completion MUST NOT exceed 100ms.

### NFR-2: Security & Privacy
- **NFR-2.1**: API keys MUST NOT be printed to browser devtools logs or backend application logs.
- **NFR-2.2**: All external communication between the extension and the backend in production MUST use TLS 1.3 (HTTPS).

---

## 3. User Stories (US)

- **US-1**: *As a privacy-focused user*, I want my personal Gemini API key saved locally on my device only, so that it is never synced across unmanaged browser profiles.
- **US-2**: *As a Chrome extension user*, I want the sidepanel to render analysis results safely, so that malicious YouTube video transcripts cannot execute cross-site scripting (XSS) attacks in my browser.
- **US-3**: *As a backend administrator*, I want the backend to run in GCP Vertex AI mode with enterprise quotas, so that multi-perspective AI analysis does not hit free-tier rate limits.

---

## 4. Behavior-Driven Development (BDD) Acceptance Criteria

### BDD-1: Storage Security (FR-1)
```gherkin
Feature: API Key Storage Security
  Scenario: User saves an API key in options
    Given the user opens the options page
    When the user enters a Gemini API key and clicks save
    Then the key must be saved to chrome.storage.local
    And chrome.storage.sync must not contain the API key key-value pair
```

### BDD-2: IPC Sender Validation (FR-2)
```gherkin
Feature: Service Worker Message Origin Check
  Scenario: Unauthorized message sender attempts IPC execution
    Given an IPC message with type "ANALYZE_VIDEO" is received by background.js
    When the message sender.id does not match chrome.runtime.id
    Then the service worker must reject the message
    And no backend analysis request must be triggered
```

### BDD-3: GCP Vertex AI Initialization (FR-5)
```gherkin
Feature: Backend Provider Mode Resolution
  Scenario: Backend starts with GCP_PROJECT configured
    Given environment variable GCP_PROJECT is set to "my-gcp-project-123"
    When the ClaimExtractor or AnalysisService initializes
    Then google.genai.Client must be instantiated with vertexai=True
    And the client project must equal "my-gcp-project-123"
```
