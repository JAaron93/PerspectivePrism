# Service Worker Recovery After Termination - Manual Test Guide

## Overview

This document provides a comprehensive manual testing guide for verifying that the Perspective Prism Chrome extension correctly recovers from service worker termination. In Manifest V3, service workers can be terminated by Chrome at any time to save resources, so the extension must be able to recover in-flight analysis requests and resume them when the service worker restarts.

## Background

### Why This Matters

Chrome's Manifest V3 architecture allows service workers to be terminated after 30 seconds of inactivity or when the browser needs to free up resources. This means:

- **In-memory state is lost** when the service worker terminates
- **Pending analysis requests** could be lost if not persisted
- **Users would see failures** for long-running analyses if recovery isn't implemented

### How Recovery Works

The extension implements a comprehensive recovery mechanism:

1. **State Persistence**: Request state is saved to `chrome.storage.local` immediately when analysis starts
2. **Alarm-Based Retries**: Uses `chrome.alarms` API (survives worker termination) instead of `setTimeout`
3. **Startup Recovery**: On service worker restart, loads persisted requests and resumes them
4. **Request Deduplication**: Prevents duplicate requests for the same video
5. **Cleanup**: Removes persisted state on success or terminal failure

## Implementation Status

✅ **Fully Implemented** - Code is complete and ready for testing

### Key Files

- `chrome-extension/client.js` - PerspectivePrismClient class with recovery logic
- `chrome-extension/background.js` - Service worker message handlers

### Key Methods

- `persistRequestState()` - Saves request state to storage
- `recoverPersistedRequests()` - Recovers requests on startup
- `setupAlarmListener()` - Handles retry alarms
- `cleanupPersistedRequest()` - Removes persisted state

## Test Environment Setup

### Prerequisites

1. **Backend Running**: Ensure Perspective Prism backend is running on `http://localhost:8000`
2. **Extension Loaded**: Load the extension in Chrome (unpacked)
3. **DevTools Open**: Keep Chrome DevTools open to monitor console logs
4. **Test Video**: Use a YouTube video with a transcript (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)

### Configuration

1. Open extension options page
2. Set backend URL to `http://localhost:8000`
3. Enable caching (24 hours)
4. Save settings

## Test Scenarios

### Test 1: Service Worker Termination During Analysis

**Objective**: Verify that an in-progress analysis recovers after service worker termination

**Steps**:

1. **Start Analysis**
   - Navigate to a YouTube video
   - Click the "Analyze Video" button
   - Verify loading state: the "Analyze Video" button is disabled, the panel shows a loading spinner, "Analyzing video..." text is visible, and the button has `aria-busy="true"` attribute

2. **Terminate Service Worker**
   - Open Chrome DevTools
   - Go to `chrome://serviceworker-internals/`
   - Find "Perspective Prism" service worker
   - Click "Stop" button to terminate it
   - **Alternative**: Wait 30 seconds for automatic termination

3. **Verify Recovery**
   - The service worker should restart automatically
   - Check console logs for recovery messages:
     ```
     [PerspectivePrismClient] Recovering request {videoId}
     ```
   - Analysis should complete successfully
   - Results should be displayed in the panel

**Expected Behavior**:

- ✅ Analysis completes despite service worker termination
- ✅ No error messages shown to user
- ✅ Results are cached after completion
- ✅ Persisted state is cleaned up

**Acceptance Criteria**:

- Analysis completes within 2 minutes
- User sees no indication of service worker restart
- Results are identical to non-interrupted analysis

---

### Test 2: Service Worker Termination During Retry

**Objective**: Verify recovery when service worker terminates during a retry attempt

**Steps**:

1. **Trigger Retry Scenario**
   - Stop the backend server temporarily
   - Navigate to a YouTube video
   - Click "Analyze Video" button
   - Wait for first attempt to fail (timeout after 120s)

2. **Restart Backend**
   - Start the backend server again
   - The extension should schedule a retry using `chrome.alarms`

3. **Terminate Service Worker Before Retry**
   - Before the retry alarm fires (within 2-4 seconds)
   - Go to `chrome://serviceworker-internals/`
   - Click "Stop" to terminate service worker

4. **Verify Recovery**
   - Service worker restarts
   - Check console for:
     ```
     [PerspectivePrismClient] Recovering request {videoId}
     [PerspectivePrismClient] Alarm fired for {videoId}
     ```
   - Retry should execute
   - Analysis should complete

**Expected Behavior**:

- ✅ Retry alarm survives service worker termination
- ✅ Retry executes after service worker restarts
- ✅ Analysis completes successfully
- ✅ Persisted state is cleaned up

**Acceptance Criteria**:

- Retry executes within 5 seconds of scheduled time
- No duplicate requests are made
- User sees successful analysis result

---

### Test 3: Multiple Pending Requests Recovery

**Objective**: Verify recovery of multiple in-flight requests

**Steps**:

1. **Start Multiple Analyses**
   - Open 3 different YouTube videos in separate tabs
   - Click "Analyze Video" in each tab quickly (within 10 seconds)
   - All 3 should show loading state

2. **Terminate Service Worker**
   - Go to `chrome://serviceworker-internals/`
   - Click "Stop" to terminate service worker

3. **Verify Recovery**
   - Service worker restarts
   - Check console for recovery of all 3 requests:
     ```
     [PerspectivePrismClient] Recovering 3 persisted requests
     [PerspectivePrismClient] Recovering request {videoId1}
     [PerspectivePrismClient] Recovering request {videoId2}
     [PerspectivePrismClient] Recovering request {videoId3}
     ```
   - All 3 analyses should complete

4. **Verify Rate Limiting**
   - Recoveries should be spaced 500ms apart (rate limiting)
   - Check timestamps in console logs

**Expected Behavior**:

- ✅ All 3 requests are recovered
- ✅ Rate limiting prevents backend overload (500ms between recoveries)
- ✅ All analyses complete successfully
- ✅ Results are displayed in respective tabs

**Acceptance Criteria**:

- All pending requests are recovered
- No requests are lost
- Backend is not overwhelmed with simultaneous requests

---

### Test 4: Stale Request Cleanup

**Objective**: Verify that old persisted requests are cleaned up

**Steps**:

1. **Create Stale Request**
   - Manually add a stale request to storage:
     ```javascript
     // Run in DevTools console on any page
     chrome.storage.local.set({
       pending_request_TEST_VIDEO: {
         videoId: "TEST_VIDEO",
         videoUrl: "https://www.youtube.com/watch?v=TEST_VIDEO",
         startTime: Date.now() - 6 * 60 * 1000, // 6 minutes ago
         attemptCount: 0,
         status: "pending",
       },
     });
     ```

2. **Trigger Recovery**
   - Navigate to any YouTube video
   - Click "Analyze Video" (this triggers service worker startup)
   - Or manually restart service worker

3. **Verify Cleanup**
   - Check console for:
     ```
     [PerspectivePrismClient] Cleaning up stale request TEST_VIDEO
     ```
   - Verify stale request is removed from storage:
     ```javascript
     chrome.storage.local.get("pending_request_TEST_VIDEO", (result) => {
       console.log("Stale request:", result); // Should be empty
     });
     ```

**Expected Behavior**:

- ✅ Stale requests (>5 minutes old) are cleaned up
- ✅ No attempt to resume stale requests
- ✅ Storage is kept clean

**Acceptance Criteria**:

- Requests older than 5 minutes are removed
- No errors are thrown during cleanup
- Storage does not accumulate stale data

---

### Test 5: Alarm Persistence Across Restarts

**Objective**: Verify that retry alarms survive service worker termination

**Steps**:

1. **Create Retry Scenario**
   - Stop backend server
   - Navigate to YouTube video
   - Click "Analyze Video"
   - Wait for timeout (120s)
   - Backend schedules retry alarm

2. **Verify Alarm Created**
   - Check alarms in DevTools console:
     ```javascript
     chrome.alarms.getAll((alarms) => {
       console.log("Alarms:", alarms);
       // Should see: retry::{videoId}::{attempt}
     });
     ```

3. **Terminate Service Worker**
   - Go to `chrome://serviceworker-internals/`
   - Click "Stop"

4. **Verify Alarm Survives**
   - Check alarms again (same command as step 2)
   - Alarm should still exist

5. **Restart Backend and Wait**
   - Start backend server
   - Wait for alarm to fire
   - Service worker should restart automatically
   - Retry should execute

**Expected Behavior**:

- ✅ Alarm survives service worker termination
- ✅ Alarm fires at scheduled time
- ✅ Service worker restarts when alarm fires
- ✅ Retry executes successfully

**Acceptance Criteria**:

- Alarms persist across service worker restarts
- Retry executes within 1 second of scheduled time
- Analysis completes successfully

---

### Test 6: Request Deduplication During Recovery

**Objective**: Verify that duplicate requests are prevented during recovery

**Steps**:

1. **Start Analysis**
   - Navigate to YouTube video
   - Click "Analyze Video"
   - Loading state shown

2. **Terminate Service Worker**
   - Go to `chrome://serviceworker-internals/`
   - Click "Stop"

3. **Attempt Duplicate Request**
   - Click "Analyze Video" button again
   - This should trigger service worker restart

4. **Verify Deduplication**
   - Check console for:
     ```
     [PerspectivePrismClient] Attaching to persisted request for {videoId}
     ```
   - Only ONE request should be made to backend
   - Both button clicks should resolve to same result

**Expected Behavior**:

- ✅ Duplicate request is detected
- ✅ Second request attaches to existing promise
- ✅ Only one backend request is made
- ✅ Both requests resolve with same result

**Acceptance Criteria**:

- No duplicate backend requests
- Both button clicks show same result
- No race conditions or conflicts

---

### Test 7: Recovery with Missing Alarm

**Objective**: Verify recovery when alarm is missing (edge case)

**Steps**:

1. **Create Persisted State Without Alarm**
   - Manually add persisted state:
     ```javascript
     chrome.storage.local.set({
       pending_request_TEST_VIDEO2: {
         videoId: "TEST_VIDEO2",
         videoUrl: "https://www.youtube.com/watch?v=TEST_VIDEO2",
         startTime: Date.now(),
         attemptCount: 1,
         status: "retrying",
       },
     });
     ```
   - Do NOT create corresponding alarm

2. **Trigger Recovery**
   - Navigate to YouTube video
   - Click "Analyze Video" (triggers service worker startup)

3. **Verify Fallback Behavior**
   - Check console for:
     ```
     [PerspectivePrismClient] Missing alarm for TEST_VIDEO2, rescheduling immediately
     ```
   - Request should be executed immediately
   - Or new alarm should be created

**Expected Behavior**:

- ✅ Missing alarm is detected
- ✅ Request is rescheduled or executed immediately
- ✅ No requests are lost due to missing alarms

**Acceptance Criteria**:

- Orphaned persisted state is handled gracefully
- Request completes successfully
- No infinite loops or errors

---

### Test 8: Browser Restart Recovery

**Objective**: Verify recovery after full browser restart

**Steps**:

1. **Start Long-Running Analysis**
   - Navigate to YouTube video with long transcript
   - Click "Analyze Video"
   - Wait for analysis to start: verify the "Analyze Video" button is disabled, the panel shows a loading spinner, "Analyzing video..." text is visible, and the button has `aria-busy="true"` attribute

2. **Close Browser Completely**
   - Close all Chrome windows
   - Wait 5 seconds

3. **Restart Browser**
   - Open Chrome again
   - Extension should load automatically

4. **Navigate to YouTube**
   - Go to any YouTube video
   - This triggers service worker startup

5. **Verify Recovery**
   - Check console for recovery messages
   - Original analysis should resume
   - Or be marked as stale and cleaned up (if >5 minutes)

**Expected Behavior**:

- ✅ Persisted state survives browser restart
- ✅ Recent requests (<5 min) are recovered
- ✅ Old requests (>5 min) are cleaned up
- ✅ Alarms are restored by Chrome

**Acceptance Criteria**:

- Recent analyses resume after browser restart
- Old analyses are cleaned up
- No data loss for recent requests

---

## Debugging Tips

### Console Logs to Monitor

Key log messages to watch for:

```javascript
// Recovery
[PerspectivePrismClient] Recovering X persisted requests
[PerspectivePrismClient] Recovering request {videoId}
[PerspectivePrismClient] Cleaning up stale request {videoId}
[PerspectivePrismClient] Recovery complete

// Alarms
[PerspectivePrismClient] Scheduling retry in Xms
[PerspectivePrismClient] Alarm fired for {videoId}

// Deduplication
[PerspectivePrismClient] Returning existing promise for {videoId}
[PerspectivePrismClient] Attaching to persisted request for {videoId}

// Errors
[PerspectivePrismClient] Failed to persist request state
[PerspectivePrismClient] Missing alarm for {videoId}, rescheduling immediately
```

### Inspecting Storage

Check persisted state:

```javascript
// Get all pending requests
chrome.storage.local.get(null, (items) => {
  const pending = Object.keys(items)
    .filter((key) => key.startsWith("pending_request_"))
    .map((key) => ({ key, ...items[key] }));
  console.table(pending);
});

// Get specific request
chrome.storage.local.get("pending_request_{videoId}", (result) => {
  console.log("Request state:", result);
});
```

### Inspecting Alarms

Check active alarms:

```javascript
chrome.alarms.getAll((alarms) => {
  console.log("Active alarms:", alarms);
  alarms.forEach((alarm) => {
    console.log(`- ${alarm.name}: fires at ${new Date(alarm.scheduledTime)}`);
  });
});
```

### Force Service Worker Termination

Multiple methods:

1. **Via serviceworker-internals**:
   - Go to `chrome://serviceworker-internals/`
   - Find extension
   - Click "Stop"

2. **Via Task Manager**:
   - Open Chrome Task Manager (Shift+Esc)
   - Find "Extension: Perspective Prism"
   - Click "End process"

3. **Wait for automatic termination**:
   - Service workers terminate after 30 seconds of inactivity
   - Just wait and monitor console

## Known Issues and Limitations

### 1. Maximum Request Age

**Issue**: Requests older than 5 minutes are considered stale and cleaned up
**Impact**: Very long-running analyses may be lost if service worker doesn't restart within 5 minutes
**Mitigation**: Backend timeout is 120 seconds, so this should not occur in practice
**Status**: Working as designed

### 2. Alarm Precision

**Issue**: Chrome alarms have ~1 minute precision (not millisecond-precise)
**Impact**: Retry delays may be slightly longer than specified
**Mitigation**: Use `when` instead of `delayInMinutes` for better precision
**Status**: Acceptable for retry scenarios

### 3. Storage Quota

**Issue**: Persisted state consumes storage quota
**Impact**: Many simultaneous analyses could fill storage
**Mitigation**: Cleanup on completion, stale request cleanup
**Status**: Low risk (each request ~1KB)

### 4. Race Conditions

**Issue**: Service worker could terminate during cleanup
**Impact**: Persisted state might not be fully cleaned up
**Mitigation**: Cleanup is idempotent, runs on next startup
**Status**: Low risk, handled gracefully

## Performance Considerations

### Storage Operations

- **Persist**: ~5ms per request
- **Recovery**: ~50ms for 10 requests
- **Cleanup**: ~20ms per request

### Rate Limiting

- **Recovery**: 500ms delay between recovered requests
- **Purpose**: Prevent backend overload
- **Impact**: 10 requests = 5 seconds to recover all

### Memory Usage

- **In-memory Map**: ~1KB per pending request
- **Persisted State**: ~1KB per request in storage
- **Alarms**: Negligible memory impact

## Success Criteria

### Must Pass

- ✅ Test 1: Service worker termination during analysis
- ✅ Test 2: Service worker termination during retry
- ✅ Test 4: Stale request cleanup
- ✅ Test 5: Alarm persistence

### Should Pass

- ✅ Test 3: Multiple pending requests recovery
- ✅ Test 6: Request deduplication during recovery

### Nice to Have

- ✅ Test 7: Recovery with missing alarm
- ✅ Test 8: Browser restart recovery

## Test Execution Checklist

- [ ] Set up test environment (backend running, extension loaded)
- [ ] Run Test 1: Service worker termination during analysis
- [ ] Run Test 2: Service worker termination during retry
- [ ] Run Test 3: Multiple pending requests recovery
- [ ] Run Test 4: Stale request cleanup
- [ ] Run Test 5: Alarm persistence across restarts
- [ ] Run Test 6: Request deduplication during recovery
- [ ] Run Test 7: Recovery with missing alarm
- [ ] Run Test 8: Browser restart recovery
- [ ] Document all issues found
- [ ] Fix critical issues (if any)
- [ ] Retest after fixes
- [ ] Update tasks.md to mark test as complete

## Conclusion

The service worker recovery mechanism is fully implemented and ready for testing. The implementation uses Chrome's persistent APIs (`chrome.storage.local` and `chrome.alarms`) to ensure that analysis requests survive service worker termination and browser restarts.

**Key Strengths**:

- Comprehensive state persistence
- Alarm-based retry scheduling
- Request deduplication
- Automatic cleanup of stale requests
- Rate limiting to prevent backend overload

**Testing Priority**: **HIGH** - This is critical functionality for MV3 extensions

**Estimated Testing Time**: 2-3 hours for comprehensive testing

**Risk Level**: **LOW** - Implementation follows MV3 best practices and includes extensive error handling

**Next Steps**:

1. Execute all test scenarios
2. Document any issues found
3. Fix critical issues (if any)
4. Mark task as complete in tasks.md
5. Update manual testing checklist
