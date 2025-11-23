# Refactoring to Async Job Flow

## Goal
Replace the current synchronous long-polling analysis request with an asynchronous job-based flow. This will prevent timeouts for long-running analyses and provide a better user experience with progress feedback.

## User Review Required
> [!IMPORTANT]
> This is a breaking API change. The `POST /analyze` endpoint will be replaced/augmented with `POST /analyze/jobs` and `GET /analyze/jobs/{job_id}`. The frontend will need to be updated to support this new flow.

## Proposed Changes

### Backend (`backend/app/main.py`)
1.  **Introduce `JobStore`**: A simple in-memory dictionary to store job status and results.
    ```python
    jobs = {} # {job_id: {"status": "pending"|"processing"|"completed"|"failed", "result": ..., "error": ...}}
    ```
2.  **Create Background Task Function**: Move the core logic of `analyze_video` into a new `process_analysis(job_id, request)` function.
3.  **Add `POST /analyze/jobs`**:
    - Generates a UUID `job_id`.
    - Initializes job state in `jobs`.
    - Starts `process_analysis` as a background task using `asyncio.create_task`.
    - Returns `{"job_id": "..."}`.
4.  **Add `GET /analyze/jobs/{job_id}`**:
    - Looks up `job_id` in `jobs`.
    - Returns the current status and result (if completed).

### Frontend (`frontend/src/App.tsx`)
1.  **Update `handleSubmit`**:
    - Call `POST /analyze/jobs` to get a `job_id`.
    - Set state to `loading` and store `job_id`.
2.  **Implement Polling**:
    - Use `useEffect` or a recursive function to poll `GET /analyze/jobs/{job_id}` every 2 seconds.
    - Update UI based on status:
        - `pending`/`processing`: Show "Processing..." (maybe with a spinner).
        - `completed`: Set results and stop polling.
        - `failed`: Set error and stop polling.
3.  **Update UI**:
    - Show a clear "Processing" state.
    - Handle the new async flow errors.

## Verification Plan

### Automated Tests
- **Backend**:
    - Create a test script `tests/test_async_flow.py` (or run manually via curl) to:
        1.  POST to create a job.
        2.  Poll status until completion.
        3.  Verify result structure.

### Manual Verification
- **Browser Test**:
    - Open the app.
    - Submit a video URL.
    - Verify the UI shows "Processing" immediately.
    - Verify the UI eventually shows results without a timeout error.
    - Check Network tab to see the polling requests.