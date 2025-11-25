# Implementation Plan - Client Refactor for Async API

## Goal
Refactor the Chrome Extension client to communicate with the updated asynchronous backend API. The current client expects a synchronous response from `/analyze`, but the backend now uses a job-based pattern (`/analyze/jobs`).

## User Review Required
> [!IMPORTANT]
> **Backend Requirement**: The backend must be running for the extension to work.
> **CORS Configuration**: The backend `.env` must allow the extension's origin. For development, we recommend setting `BACKEND_CORS_ORIGINS=["*"]`.

## Proposed Changes

### Chrome Extension

#### [MODIFY] [client.js](file:///Users/pretermodernist/PerspectivePrismMVP/chrome-extension/client.js)
- Update `makeAnalysisRequest` to:
    1.  POST to `/analyze/jobs` with `{ url: videoUrl }`.
    2.  Receive `job_id`.
    3.  Call `pollJobStatus(jobId)`.
- Add `pollJobStatus(jobId)` method:
    - Loop with delay (e.g., 1s, then 2s...).
    - GET `/analyze/jobs/{jobId}`.
    - Check `status`:
        - `COMPLETED`: Return `result`.
        - `FAILED`: Throw error with `error` message.
        - `PENDING` / `PROCESSING`: Continue polling.
    - Handle timeouts (overall timeout).
- Update `logError` to properly stringify objects to avoid `[object Object]`.

## Verification Plan

### Automated Tests
- Update `test-cache.html`? No, that mocks storage.
- We might need a `test-client.html` that mocks `fetch` to simulate the job flow.

### Manual Verification
1.  **Start Backend**: User must run `uvicorn app.main:app --reload`.
2.  **Configure CORS**: User must update `.env`.
3.  **Test Extension**:
    - Click "Analyze".
    - Verify client sends POST to `/analyze/jobs`.
    - Verify client polls status.
    - Verify final result is displayed.