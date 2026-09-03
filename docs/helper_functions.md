# Helper Functions Reference

> Centralized documentation of all reusable helper functions across Perspective Prism.

---

## Backend: `app/utils/llm_utils.py`

### `execute_adk_agent(agent, user_prompt, output_key, output_schema=None, is_backup=False, max_attempts=2) -> Any`

**Purpose:** Runs an ADK Agent via `InMemorySessionService` and `Runner` with standardized error handling, error code translation (4xx → `ClientError`, 5xx → `ServerError`), retry logic with enriched prompts on first failure, and optional Pydantic model validation of the output.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `agent` | `Agent` | — | The ADK Agent instance to run. |
| `user_prompt` | `str` | — | The prompt text to pass to the agent. |
| `output_key` | `str` | — | The session state key containing the output result. |
| `output_schema` | `Any \| None` | `None` | Optional Pydantic model class for output validation. |
| `is_backup` | `bool` | `False` | Whether this is a backup agent run (suppresses retry enrichment). |
| `max_attempts` | `int` | `2` | Maximum execution attempts. |

**Returns:** The result object from session state.

**Used by:**
- `app/services/claim_extractor.py` — `ClaimExtractor.extract_claims()`
- `app/services/analysis_service.py` — `AnalysisService._run_agent_direct()`
- `app/services/content_classifier.py` — `PreClassifierService._run_agent_direct()`
- `app/services/alethiology_service.py` — `AlethiologyService._run_agent_direct()`

### `init_tier_concurrency(settings, service_name="Service", configure_fn=None) -> tuple[dict[str, str], int, asyncio.Semaphore]`

**Purpose:** Configures the LLM provider environment for GCP Vertex AI mode, parses the tier concurrency limit (`tier_max_concurrency`), logs initialization metadata, and instantiates an `asyncio.Semaphore` for request rate throttling.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `settings` | `Any` | — | Application settings instance holding `GEMINI_TIER` and `tier_max_concurrency`. |
| `service_name` | `str` | `"Service"` | Service identifier used for logging. |
| `configure_fn` | `Callable \| None` | `None` | Optional provider configuration function (defaults to `configure_provider_env`). |

**Returns:** Tuple of `(provider_info, max_concurrency, semaphore)`.

**Used by:**
- `app/services/content_classifier.py` — `PreClassifierService.__init__()`
- `app/services/alethiology_service.py` — `AlethiologyService.__init__()`
- `app/services/analysis_service.py` — `AnalysisService.__init__()`

### `execute_agent_with_circuit_breaker(service_state, run_direct_fn, agent_primary, agent_backup, user_prompt, output_key, service_name, error_cls) -> Any`

**Purpose:** Standardizes circuit breaker state machine transitions (CLOSED → OPEN → HALF-OPEN probe ownership), transient API error detection via module-level constant frozenset `_TRANSIENT_HTTP_CODES` (`{429, 500, 502, 503, 504}` for $O(1)$ set lookup), failure threshold tripping, probe race condition prevention, and automatic fallback to the backup agent.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `service_state` | `Any` | Service instance holding circuit breaker attributes (`cb_open`, `cb_half_open`, `cb_probing`, `cb_failures`, `cb_last_failure_time`, `_cb_lock`). |
| `run_direct_fn` | `Callable` | Async callable executing the agent within concurrency semaphore. |
| `agent_primary` | `Agent` | Primary ADK Agent. |
| `agent_backup` | `Agent` | Backup ADK Agent. |
| `user_prompt` | `str` | The prompt text to pass to the agent. |
| `output_key` | `str` | Session state key for agent output. |
| `service_name` | `str` | Name of service for log messages (e.g. `"Pre-classifier"`). |
| `error_cls` | `type[Exception]` | Domain-specific exception to raise on double failure. |

**Returns:** Result object from successful agent run.

**Used by:**
- `app/services/content_classifier.py` — `PreClassifierService._run_agent_with_fallback()`
- `app/services/alethiology_service.py` — `AlethiologyService._run_agent_with_fallback()`
- `app/services/analysis_service.py` — `AnalysisService._run_agent_with_fallback()`

---

## Backend: `app/utils/prompt_helpers.py`

### `build_user_data_prompt(data, instruction, nonce=None) -> str`

**Purpose:** Builds a prompt string with untrusted user data wrapped at the beginning inside dynamic per-request nonce delimiters (`===USER DATA <nonce> START===` / `===USER DATA <nonce> END===`), followed by the directive instruction.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `str \| dict[str, str]` | — | User data as a pre-formatted string or dictionary of labeled fields. |
| `instruction` | `str` | — | Directive instruction for the LLM. |
| `nonce` | `str \| None` | `None` | Optional specific nonce string; generates a random nonce if None. |

**Returns:** Formatted prompt string.

**Used by:**
- `app/services/claim_extractor.py` — `ClaimExtractor.extract_claims()`
- `app/services/analysis_service.py` — `AnalysisService.analyze_perspective()`, `analyze_bias_and_deception()`
- `app/services/content_classifier.py` — `PreClassifierService.classify_video()`
- `app/services/alethiology_service.py` — `AlethiologyService.analyze_alethiology()`

### `format_classifier_user_data(metadata_clean, preview) -> str`

**Purpose:** Formats a sanitized metadata dictionary and transcript preview string into a standardized key-value text block for the Pre-Classification Guardrail Gate agent.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `metadata_clean` | `dict[str, str]` | Clean dictionary with `title`, `channel_name`, `category_name`, `tags`, `description_snippet`. |
| `preview` | `str` | Sanitized transcript preview text (defaults to `"NO TRANSCRIPT AVAILABLE"` if empty). |

**Returns:** Structured multi-line string block.

**Used by:**
- `app/services/content_classifier.py` — `PreClassifierService.classify_video()`

---

## Backend: `app/utils/input_sanitizer.py`

### `sanitize_input(text, max_length, field_name, allow_suspicious_patterns, allow_control_chars) -> str`
Core sanitization function. Validates, escapes, and truncates user text before LLM prompt interpolation.

### `sanitize_claim_text(claim_text) -> str`
Convenience wrapper for claim text sanitization (max 5000 chars).

### `sanitize_perspective_value(perspective_value) -> str`
Convenience wrapper for perspective value sanitization (max 50 chars).

### `sanitize_evidence_text(evidence_text) -> str`
Convenience wrapper for evidence text sanitization (max 10000 chars).

### `sanitize_context(context) -> str`
Convenience wrapper for context text sanitization (max 2000 chars). Returns `""` for empty/None input.

### `sanitize_metadata_field(text, field_name="Metadata field", max_length=1000) -> str`
Sanitizes client-extracted YouTube metadata fields (title, channel, tags, description snippet).

### `sanitize_category_string(category) -> str`
Sanitizes YouTube category names (max 100 chars).

### `sanitize_quote_evidence(quote) -> str`
Sanitizes exact transcript quote evidence strings from the Alethiology agent (max 1500 chars).

### `sanitize_quote_evidences(quotes) -> list[str]`
Iterates over transcript quote evidence strings, applies `sanitize_quote_evidence()`, filters out any quotes that fail sanitization or raise `SanitizationError`, and returns clean quotes.

**Used by:**
- `app/services/alethiology_service.py` — `AlethiologyService.analyze_alethiology()`

### `sanitize_video_metadata(metadata) -> dict[str, str]`
Extracts and sanitizes all string fields within a `VideoMetadata` object (or returns clean empty strings if None). Uses generator expressions for tag joining to eliminate intermediate heap list allocations.

**Returns:**
Dictionary with keys: `title`, `channel_name`, `category_name`, `description_snippet`, `tags`.

**Used by:**
- `app/services/content_classifier.py` — `PreClassifierService.classify_video()`

### `wrap_user_data(data, label="USER DATA", nonce=None) -> str`
Wraps user data in dynamic nonce-delimited sections.

---

## Backend: `app/utils/video_utils.py`

### `extract_video_id(url) -> str`
Extracts a YouTube video ID from standard, embed, short URL, and `/v/` formats. Raises `ValueError` for invalid URLs.

**Used by:**
- `app/services/claim_extractor.py` — `ClaimExtractor.extract_video_id()`
- `app/main.py` — `create_analysis_job()`, `process_analysis()`

---

## Frontend: `src/utils/alethiology.ts`

### `getTheoryColorClass(theory: TruthTheoryType) -> string`

**Purpose:** Maps canonical truth theory types (`Correspondence`, `Coherence`, `Pragmatic`, `Perspectivism`, `Consensus`, `Deflationary`) to their corresponding CSS class names for styling badge chips and cards in the UI via an $O(1)$ static `THEORY_PREFIX_MAP` monomorphic record lookup.

**Used by:**
- `frontend/src/components/EpistemicLensCard.tsx`

---

## Chrome Extension: `video-utils.js` / `video-utils-script.js`

### `isValidVideoId(id) -> boolean`
Validates that a string is a well-formed 11-character YouTube video ID.

### `extractVideoIdFromUrl(url) -> string | null`
Extracts a YouTube video ID from a URL. Supports `?v=`, `/shorts/`, `/embed/`, `/v/`, `youtu.be`, and hash fragment formats.

---

## Chrome Extension: `logging-utils.js` / `logging-utils-script.js`

Shared structured logging utilities with log-level filtering (`debug`, `info`, `warn`, `error`). Both module and script variants are provided for ES module imports and manifest injection respectively.

---

## Chrome Extension: `config.js` / `config-script.js`

Shared configuration constants (API URLs, timeouts, feature flags). Both module and script variants are provided.

---

## Chrome Extension: `timeline-utils.js` / `timeline-utils-script.js`

Timeline formatting and timestamp conversion utilities for video playback synchronization.
