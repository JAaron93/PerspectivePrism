# Reusable Helper Functions Reference

This document catalogs the utility modules and reusable helper functions extracted to keep the codebase DRY (Don't Repeat Yourself). All developers should check this guide first before implementing custom parsing, formatting, or service clients.

---

## 1. Backend Utilities (`backend/app/utils`)

### [LLMClient](file:///Users/pretermodernist/.gemini/antigravity/worktrees/PerspectivePrism/refactor-dry-helper-functions/backend/app/utils/llm_client.py)
A centralized wrapper for OpenAI client operations, including fallback logic and circuit breaking features.

*   **Location**: `app.utils.llm_client.LLMClient`
*   **Purpose**: Manages OpenAI connection lifecycle, handles backup provider switching, and controls circuit-breaking transitions (`CLOSED` → `OPEN` → `HALF-OPEN`).
*   **Key Methods**:
    *   `call_llm(prompt: str, system_prompt: str = None, timeout: float = 60.0) -> str`: Calls the active LLM provider returning the raw JSON string response.
    *   `execute_with_fallback(...)`: Standardized execution path that implements the circuit-breaker logic.
*   **Usage**: Used by `ClaimExtractor` and `AnalysisService`.

### [Video Utilities](file:///Users/pretermodernist/.gemini/antigravity/worktrees/PerspectivePrism/refactor-dry-helper-functions/backend/app/utils/video_utils.py)
YouTube video URL extraction helper.

*   **Location**: `app.utils.video_utils`
*   **Purpose**: Extract YouTube Video IDs from various URL patterns (standard watch pages, embed links, youtu.be short URLs).
*   **Key Functions**:
    *   `extract_video_id(url: str) -> str`: Extracts the 11-character video ID from a YouTube link, throwing `ValueError` for invalid formats.
*   **Usage**: Used in API routers and during claim processing in `main.py`.

---

## 2. Frontend Utilities (`frontend/src/utils`)

### [Time Utilities](file:///Users/pretermodernist/.gemini/antigravity/worktrees/PerspectivePrism/refactor-dry-helper-functions/frontend/src/utils/time.ts)
Time formatting utilities.

*   **Location**: `src/utils/time.ts`
*   **Purpose**: Consistent visual formatting of video timestamps.
*   **Key Functions**:
    *   `formatTimestamp(start: number | null, end: number | null): string`: Converts seconds to a user-friendly `MM:SS` (or `MM:SS - MM:SS` for ranges) format.
*   **Usage**: Used in `App.tsx` claim list views.

---

## 3. Chrome Extension Utilities (`chrome-extension`)

### [Video Utilities (Module / Script)](file:///Users/pretermodernist/.gemini/antigravity/worktrees/PerspectivePrism/refactor-dry-helper-functions/chrome-extension/video-utils.js)
Unified video URL parsing and validation library for content scripts and popups.

*   **Location**:
    *   ES Module: `video-utils.js` (for sidepanel module imports)
    *   Vanilla Script: `video-utils-script.js` (for direct manifest content script injection)
*   **Purpose**: Validates video ID formats and extracts IDs from standard URLs, shorts, legacy `/v/` paths, and hash fragment variables.
*   **Key Functions**:
    *   `isValidVideoId(id: string): boolean`: Validates YouTube 11-char ID character constraints.
    *   `extractVideoIdFromUrl(url: string): string | null`: Extracts ID or returns null if invalid.
*   **Usage**: Registered in `manifest.json` before `content.js` and loaded dynamically by `popup.html`.
