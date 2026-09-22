# Test Plan: Analysis with Backend Offline

## Test ID
`REGRESSION-009`

## Test Category
Regression Testing - Error Handling

## Priority
High

## Description
Verify that the extension handles backend connection failures gracefully, providing clear error messages and recovery options when the Perspective Prism backend is offline or unreachable.

## Prerequisites
- [ ] Chrome extension is installed and loaded
- [ ] Backend URL is configured in extension settings
- [ ] You have access to start/stop the backend server
- [ ] You are on a YouTube video page (e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ)
- [ ] Chrome DevTools is open (F12) to monitor console errors

## Test Environment
- **Browser**: Chrome (latest version)
- **Extension Version**: [Record version]
- **Backend URL**: [Record configured URL]
- **Test Date**: [Record date]
- **Tester**: [Record name]

---

## Test Scenarios

### Scenario 1: Backend Offline Before Analysis

**Objective**: Verify error handling when backend is offline before user initiates analysis.

**Steps**:
1. Stop the backend server:
   ```bash
   pkill -f uvicorn
   ```
2. Navigate to a YouTube video page
3. Wait for the "Analyze Video" button to appear
4. Click the "Analyze Video" button
5. Observe the loading state
6. Wait for error message to appear

**Expected Results**:
- [ ] Analysis panel opens and shows loading state initially
- [ ] After connection failure (typically 2-5 seconds), error message appears
- [ ] Error message displays: "Cannot connect to Perspective Prism. Check your backend URL in settings."
- [ ] Panel shows "Retry" button
- [ ] Panel shows "Open Settings" button/link
- [ ] No JavaScript errors in console
- [ ] Extension remains responsive

**Actual Results**:
```
[Record observations here]
```

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Notes**:
```
[Record any additional observations]
```

---

### Scenario 2: Backend Goes Offline During Analysis

**Objective**: Verify error handling when backend becomes unavailable mid-request.

**Steps**:
1. Start the backend server:
   ```bash
   cd backend && source venv/bin/activate && uvicorn app.main:app --reload
   ```
2. Navigate to a YouTube video page
3. Click "Analyze Video" button
4. Immediately (within 2-3 seconds) stop the backend server:
   ```bash
   pkill -f uvicorn
   ```
5. Observe the behavior

**Expected Results**:
- [ ] Loading state continues for a moment
- [ ] After connection failure detected, error message appears
- [ ] Error message indicates connection problem
- [ ] Retry button is available
- [ ] Extension does not crash or freeze
- [ ] No unhandled promise rejections in console

**Actual Results**:
```
[Record observations here]
```

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Notes**:
```
[Record any additional observations]
```

---

### Scenario 3: Recovery After Backend Comes Back Online

**Objective**: Verify that the extension can recover and complete analysis after backend becomes available again.

**Steps**:
1. With backend offline, trigger an analysis (should fail with error)
2. Verify error message is displayed
3. Start the backend server:
   ```bash
   cd backend && source venv/bin/activate && uvicorn app.main:app --reload
   ```
4. Wait for backend to be fully ready (check http://localhost:8000/health)
5. Click the "Retry" button in the error panel

**Expected Results**:
- [ ] Loading state appears after clicking Retry
- [ ] Analysis completes successfully
- [ ] Results are displayed in the panel
- [ ] No lingering error states
- [ ] Results are cached for future use

**Actual Results**:
```
[Record observations here]
```

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Notes**:
```
[Record any additional observations]
```

---

### Scenario 4: Invalid Backend URL Configuration

**Objective**: Verify error handling when backend URL is configured to an invalid/unreachable address.

**Steps**:
1. Open extension settings (right-click extension icon → Options)
2. Change backend URL to an invalid address:
   ```
   http://invalid-backend-url.local:8000
   ```
3. Click "Save Settings"
4. Navigate to a YouTube video page
5. Click "Analyze Video" button
6. Observe the error handling

**Expected Results**:
- [ ] Connection fails (DNS resolution or timeout)
- [ ] Error message suggests checking settings
- [ ] "Open Settings" button is prominent
- [ ] Clicking "Open Settings" opens the options page
- [ ] Error is logged to console with sanitized information (no sensitive data)

**Actual Results**:
```
[Record observations here]
```

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Notes**:
```
[Record any additional observations]
```

---

### Scenario 5: Network Timeout Simulation

**Objective**: Verify timeout handling when network connection is extremely slow or hanging.

**Steps**:
1. Open Chrome DevTools (F12) → Network tab
2. Set throttling to "Offline" or create custom profile with extreme delay
3. Navigate to a YouTube video page
4. Click "Analyze Video" button
5. Observe behavior over time (up to 120 seconds)

**Expected Results**:
- [ ] Loading state persists during timeout period
- [ ] After 120 seconds (timeout), error message appears
- [ ] Error message: "The analysis took too long. Please try again later."
- [ ] Extension remains responsive (not frozen)
- [ ] User can close panel and retry
- [ ] Timeout is properly cleaned up (no memory leaks)

**Actual Results**:
```
[Record observations here]
```

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Notes**:
```
[Record any additional observations]
```

---

### Scenario 6: Multiple Retry Attempts

**Objective**: Verify retry logic works correctly with multiple attempts.

**Steps**:
1. Ensure backend is offline
2. Navigate to a YouTube video page
3. Click "Analyze Video" button
4. Wait for error message
5. Click "Retry" button (should fail again)
6. Click "Retry" button again (should fail again)
7. Start backend server
8. Click "Retry" button (should succeed)

**Expected Results**:
- [ ] Each retry attempt shows loading state
- [ ] Failed retries show error message
- [ ] Error messages are consistent
- [ ] Successful retry displays results
- [ ] No duplicate requests are sent
- [ ] Retry count is properly tracked (max 2 retries per design)

**Actual Results**:
```
[Record observations here]
```

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Notes**:
```
[Record any additional observations]
```

---

### Scenario 7: Settings Link Functionality

**Objective**: Verify that the "Open Settings" link/button works correctly from error state.

**Steps**:
1. Trigger an analysis with backend offline (should fail)
2. Verify error message is displayed
3. Click the "Open Settings" button/link in the error panel
4. Verify settings page opens
5. Update backend URL to correct value
6. Save settings
7. Return to YouTube video page
8. Click "Analyze Video" button again

**Expected Results**:
- [ ] "Open Settings" button is visible in error state
- [ ] Clicking button opens extension options page
- [ ] Settings page loads correctly
- [ ] Can update backend URL
- [ ] Settings save successfully
- [ ] After fixing URL, analysis works correctly

**Actual Results**:
```
[Record observations here]
```

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Notes**:
```
[Record any additional observations]
```

---

## Error Message Verification

Verify that the following error messages appear in the correct scenarios:

| Scenario | Expected Error Message | Verified |
|----------|----------------------|----------|
| Connection Failure (fetch error) | "Cannot connect to Perspective Prism. Check your backend URL in settings." | ⬜ |
| Timeout (120s) | "The analysis took too long. Please try again later." | ⬜ |
| Server Error (5xx) | "Our servers are experiencing issues. Please try again later." | ⬜ |
| Too Many Requests (429) | "Too many requests. Please wait a moment and try again." | ⬜ |
| Invalid Data | "The analysis data received was invalid. Please try again." | ⬜ |

---

## Console Error Verification

**Check Chrome DevTools Console for**:
- [ ] No unhandled promise rejections
- [ ] No JavaScript errors
- [ ] Proper error logging (sanitized, no sensitive data)
- [ ] Clear error context for debugging

**Sample Expected Console Output**:
```
[PerspectivePrismClient] Submitting job for dQw4w9WgXcQ
[PerspectivePrismClient] Request failed: TypeError: Failed to fetch
[PerspectivePrismClient] Retry attempt 1/2 for dQw4w9WgXcQ
```

---

## Acceptance Criteria

All of the following must be true for this test to pass:

- [ ] Extension detects backend offline condition
- [ ] Clear, user-friendly error messages are displayed
- [ ] Error messages match the expected text
- [ ] Retry functionality works correctly
- [ ] Settings link/button opens options page
- [ ] Extension recovers when backend comes back online
- [ ] No console errors or unhandled exceptions
- [ ] Extension remains responsive during failures
- [ ] Timeout handling works correctly (120s)
- [ ] No memory leaks or resource issues
- [ ] Error states are properly cleaned up
- [ ] Multiple retry attempts work as expected

---

## Test Results Summary

**Total Scenarios**: 7  
**Passed**: ___  
**Failed**: ___  
**Blocked**: ___  

**Overall Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Critical Issues Found**:
```
[List any critical issues]
```

**Non-Critical Issues Found**:
```
[List any non-critical issues]
```

**Recommendations**:
```
[List any recommendations for improvement]
```

---

## Sign-Off

**Tester Name**: ___________________  
**Date**: ___________________  
**Signature**: ___________________  

**Reviewer Name**: ___________________  
**Date**: ___________________  
**Signature**: ___________________  

---

## Appendix: Troubleshooting

### Backend Won't Stop
```bash
# Find and kill all uvicorn processes
ps aux | grep uvicorn
kill -9 <PID>
```

### Backend Won't Start
```bash
# Check if port 8000 is already in use
lsof -i :8000
# Kill process using port 8000
kill -9 <PID>
```

### Extension Not Responding
1. Open `chrome://extensions/`
2. Find "Perspective Prism"
3. Click "Reload" button
4. Refresh YouTube page

### Clear Extension State
```javascript
// Run in DevTools console on YouTube page
chrome.storage.local.clear();
chrome.storage.sync.clear();
```

---

## Related Documentation

- Design Document: `.kiro/specs/youtube-chrome-extension/design.md`
- Requirements: `.kiro/specs/youtube-chrome-extension/requirements.md` (Requirement 6)
- Manual Testing Guide: `chrome-extension/MANUAL_TESTING_GUIDE.md`
- Interactive Test Page: `chrome-extension/test-backend-offline.html`
