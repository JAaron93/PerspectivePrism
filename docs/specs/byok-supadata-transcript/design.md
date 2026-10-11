# BYOK API Key Management & Supadata YouTube Transcript Integration — Design Specification

## 1. Overview

This specification introduces two tightly coupled features:

1. **BYOK Onboarding UX**: A structured key-management layer in the Chrome extension that gates analysis on the user supplying a valid Supadata API key, surfaces an onboarding modal explaining the free tier, and persists the key in `chrome.storage.local`.
2. **Supadata Transcript Integration**: A per-request transcript fetch pipeline in the FastAPI backend that receives the user's Supadata key via a request header (`X-Supadata-Key`) and uses it to bypass YouTube's cloud IP blocking — replacing the current unproxied `youtube-transcript-api` call that returns `RequestBlocked` from Modal's datacenter IPs.

The two features are architecturally coupled at the `POST /analyze/jobs` API boundary: the extension supplies the key as a request header; the backend consumes it per-request without storing it server-side.

---

## 2. Architecture

### 2.1 End-to-End Request Flow

```mermaid
sequenceDiagram
    autonumber
    participant SP as Side Panel (sidepanel.js)
    participant CFG as ConfigManager (config.js)
    participant Client as PerspectivePrismClient (client.js)
    participant Modal as FastAPI Backend (main.py)
    participant Supadata as Supadata REST API
    participant YTA as youtube-transcript-api (fallback)
    participant Vertex as GCP Vertex AI

    SP->>CFG: load() → { supadataApiKey, backendUrl, ... }
    alt supadataApiKey is empty
        SP->>SP: showState("onboarding-key") — render onboarding panel
        Note over SP: User clicks "Get Free API Key" → opens supadata.ai
        SP->>SP: User pastes key → ConfigManager.save() → chrome.storage.local
    end
    SP->>Client: analyzeVideo(url, { supadataApiKey })
    Client->>Modal: POST /analyze/jobs\n  Headers: X-Supadata-Key: <key>\n  Body: { url }
    Modal->>Modal: _bootstrap_gcp_credentials()
    Modal->>Supadata: GET /v1/youtube/transcript?url=<url>\n  x-api-key: <key>
    alt Supadata success
        Supadata-->>Modal: { content: [...segments] }
        Modal->>Vertex: Extract claims → Analyse → Truth Profile
        Modal-->>Client: Job completed (full result)
    else Supadata failure (invalid key / quota / network)
        Modal->>YTA: api.fetch(video_id) [local-dev fallback only]
        alt YTA also fails
            Modal-->>Client: Job completed (graceful error placeholder)
        end
    end
    Client-->>SP: Render results
```

### 2.2 Key Storage & Propagation

| Layer | Storage | How key moves |
|---|---|---|
| Chrome Extension | `chrome.storage.local` → `config.supadataApiKey` | Loaded on startup by `ConfigManager.load()` |
| Side Panel → Client | In-memory, passed as `options.supadataApiKey` to `analyzeVideo()` | Never written to DOM or logs |
| Client → Backend | `X-Supadata-Key` request header on `POST /analyze/jobs` | Single HTTPS hop, TLS-encrypted |
| Backend | **Not stored** — read from `Request.headers`, passed to `ClaimExtractor.get_transcript()` per call | Discarded after each request |

> [!IMPORTANT]
> The Supadata key is **never stored server-side**. It is read from the `X-Supadata-Key` header, passed in-memory to `ClaimExtractor`, used for one Supadata API call, and discarded. This mirrors the `/health/llm` `X-Probe-Key` per-request pattern already in production.

### 2.3 Component Topology

```mermaid
flowchart TD
    A["sidepanel.html\n#state-onboarding-key"] -->|user saves key| B["config.js\nConfigManager.save()"]
    B --> C["chrome.storage.local\nconfig.supadataApiKey"]
    C -->|load on startup| D["client.js\ncreateAnalysisJob()"]
    D -->|X-Supadata-Key header| E["main.py\ncreate_analysis_job()"]
    E -->|supadata_key arg| F["main.py\nprocess_analysis()"]
    F -->|supadata_key arg| G["claim_extractor.py\nget_transcript()"]
    G -->|x-api-key header| H["Supadata REST API\nhttps://api.supadata.ai/v1/youtube/transcript"]
    G -->|fallback only when\nSUPADATA_FALLBACK_LOCAL=true| I["youtube-transcript-api\nlocal dev only"]
```

### 2.4 Onboarding Panel UX

The onboarding experience renders inside the Native Side Panel as a new `#state-onboarding-key` state, consistent with ADR 002. It is shown when:
- The extension is first installed and no key is present
- The user clicks "Change API Key" in the options/settings page
- The backend returns an error code `SUPADATA_KEY_MISSING` or `SUPADATA_QUOTA_EXHAUSTED`

```
┌─────────────────────────────────────────────────────────┐
│  🔑  Set Up Your Free Transcript Key                    │
│                                                         │
│  Perspective Prism uses Supadata to fetch YouTube       │
│  transcripts from the cloud. Supadata's free tier       │
│  includes 100 transcript fetches per month —            │
│  no credit card required.                               │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  1. Sign up at supadata.ai  (free, ~30 seconds)  │  │
│  │  2. Copy your API key from the dashboard         │  │
│  │  3. Paste it below and click Save                │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  API Key  [________________________]  👁                │
│                                                         │
│  [  Get Free Key ↗  ]      [  Save & Continue  ]       │
│                                                         │
│  ℹ Your key is stored locally on this device only.     │
│    It is sent to Supadata on your behalf to fetch       │
│    transcripts and never stored on our servers.         │
└─────────────────────────────────────────────────────────┘
```

The options page (`options.html` / `options.js`) gains a matching "API Keys" section with the same field so the key can be updated without re-triggering the full onboarding flow.

### 2.5 Backend Fallback Chain

```
1. Supadata API  (X-Supadata-Key header present)
        ↓ on 4xx / 5xx / timeout / missing key
2. youtube-transcript-api  (LOCAL DEV ONLY — SUPADATA_FALLBACK_LOCAL=true)
        ↓ RequestBlocked / TranscriptRetrievalError
3. Graceful placeholder  (current behaviour — job completes, error claim returned)
```

> [!NOTE]
> The `youtube-transcript-api` fallback is gated by `settings.SUPADATA_FALLBACK_LOCAL` (default `False`). In Modal production only Supadata is attempted. Local development can set `SUPADATA_FALLBACK_LOCAL=true` in `.env` to test the full pipeline without a Supadata key.

---

## 3. Architectural Constraints

### 3.1 Extension Invariants (ADR 002 / ADR 004)
- All UI renders inside the Native Side Panel — no browser popups, no content-script overlays.
- Zero-build vanilla JS — no bundler. The onboarding state is a new `#state-onboarding-key` container in `sidepanel.html` using existing CSS variables.
- `supadataApiKey` stored exclusively in `chrome.storage.local`. `chrome.storage.sync` is prohibited for secrets.
- The key input field must be `type="password"` with a toggle-visibility button.
- `ConfigValidator.validate()` must accept and validate `supadataApiKey` as an optional string (non-empty string passes; `undefined` or `""` passes validation but gates analysis flow).

### 3.2 Backend Invariants (AGENTS.md)
- `X-Supadata-Key` is declared via FastAPI `Header(default=None)` — optional, typed `str | None`.
- The key flows as a positional argument: `create_analysis_job()` → `process_analysis()` → `ClaimExtractor.get_transcript()`. Never stored in `os.environ`, `jobs{}`, or any persistent state.
- Supadata HTTP call uses `httpx.AsyncClient` (non-blocking, consistent with ADR 003 async I/O standard).
- If `X-Supadata-Key` is absent and `SUPADATA_FALLBACK_LOCAL=False`, the transcript step raises `TranscriptRetrievalError` immediately and the job completes with the existing graceful placeholder — the `POST /analyze/jobs` endpoint always returns `202` with a `job_id`.

### 3.3 New Backend Settings Fields

| Field | Type | Default | Purpose |
|---|---|---|---|
| `SUPADATA_API_KEY` | `str` | `""` | Optional server-side dev key (Modal secret or `.env`) |
| `SUPADATA_FALLBACK_LOCAL` | `bool` | `False` | Enables `youtube-transcript-api` fallback for local dev |
| `SUPADATA_BASE_URL` | `str` | `"https://api.supadata.ai/v1"` | Override for testing |
| `SUPADATA_TIMEOUT` | `float` | `20.0` | Per-request timeout for Supadata calls |

### 3.4 New Extension Config Fields

| Field | Type | Default | Validation rule |
|---|---|---|---|
| `supadataApiKey` | `string` | `""` | Optional; non-empty string if present |

---

## 4. Compliance & ADR Traceability

| Invariant | Compliance Mechanism |
|---|---|
| **ADR 002 (Native Side Panel)** | Onboarding is `#state-onboarding-key` in Side Panel; no browser popup |
| **ADR 003 (Vertex AI async I/O)** | Supadata fetch uses `httpx.AsyncClient` with `await` |
| **ADR 004 (Zero-build extension)** | Onboarding UI is vanilla JS + existing CSS custom properties |
| **AGENTS.md BYOK isolation** | Key stored in `chrome.storage.local` only; never logged; never synced |
| **AGENTS.md IPC origin verification** | `background.js` `sender.id` check unchanged; key forwarded via existing message channel |
| **Modal deployment spec §2.3** | `SUPADATA_API_KEY` added as optional entry in `perspective-prism-gcp-secrets` for server-side dev use |
