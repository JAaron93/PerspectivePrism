# Helper Functions Reference

> Centralized documentation of all reusable helper functions across Perspective Prism.

---

## Backend: `app/utils/llm_utils.py`

### `get_validated_api_key(settings_obj=None) -> str`

**Purpose:** Extracts and validates the Gemini/LLM API key from Pydantic settings, sets `os.environ["GEMINI_API_KEY"]` for ADK model clients.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `settings_obj` | `Any \| None` | `None` | Optional custom settings instance. Defaults to `app.core.config.settings`. |

**Returns:** The validated API key string.

**Raises:** `ValueError` if neither `GEMINI_API_KEY` nor `LLM_API_KEY` is configured.

**Used by:**
- `app/services/claim_extractor.py` — `ClaimExtractor.__init__()`
- `app/services/analysis_service.py` — `AnalysisService.__init__()`

---

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

---

## Backend: `app/utils/prompt_helpers.py`

### `build_user_data_prompt(data, instruction) -> str`

**Purpose:** Builds a prompt string with user data wrapped at the beginning inside `===USER DATA START===` / `===USER DATA END===` delimiters, followed by the task instruction. Supports both raw string and dictionary formats.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `data` | `str \| dict[str, str]` | User data as a pre-formatted string or a dictionary of labeled fields. |
| `instruction` | `str` | Directive instruction for the LLM. |

**Returns:** Formatted prompt string.

**Used by:**
- `app/services/claim_extractor.py` — `ClaimExtractor.extract_claims()`
- `app/services/analysis_service.py` — `AnalysisService.analyze_perspective()`, `AnalysisService.analyze_bias_and_deception()`

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

### `wrap_user_data(data, label) -> str`
Wraps user data in `===USER DATA START===` / `===USER DATA END===` delimiters.

---

## Backend: `app/utils/video_utils.py`

### `extract_video_id(url) -> str`
Extracts a YouTube video ID from standard, embed, short URL, and `/v/` formats. Raises `ValueError` for invalid URLs.

**Used by:**
- `app/services/claim_extractor.py` — `ClaimExtractor.extract_video_id()`
- `app/main.py` — `create_analysis_job()`, `process_analysis()`

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
