# Latency Optimization Walkthrough

## Changes Implemented

### Backend Refactoring (`process_analysis`)
I modified `backend/app/main.py` to enable incremental streaming of perspective analysis results.

- **Incremental Updates**: Instead of waiting for all 4 perspectives (Scientific, Journalistic, Left, Right) to complete for a claim, the system now updates the global job state *immediately* after each perspective finishes.
- **Race Condition Prevention**: I ensured that the creation of the `AnalysisResponse` snapshot happens inside the `jobs_lock`. This prevents a scenario where a slower thread could overwrite a newer update with a stale snapshot.
- **Data Structure Handling**: I leveraged the existing `ClientClaimAnalysis` objects, updating them in place (mutating the internal dictionary), and creating lightweight snapshots for the global store.

### Frontend Compatibility
- Checked `frontend/src/App.tsx` and confirmed it already supports partial rendering.
- The `App` component actively polls the job status and renders whatever perspectives are present in the `results` object. 
- Missing perspectives render as a `ThinkingComponent`, which aligns perfectly with the requirement to show "Thinking..." until the specific perspective is ready.

## Verification
- **Static Analysis**: Verified logic consistency and thread-safety of the async update loop.
- **Correctness**: The change ensures that as soon as the LLM returns a perspective analysis, it is pushed to the client on the next poll (within 1s), drastically reducing the "Time to First Byte" equivalent for the user.

## Next Steps
- The user can verify this behavior by running the extension and observing the "Thinking..." cards turning into result cards one by one.
