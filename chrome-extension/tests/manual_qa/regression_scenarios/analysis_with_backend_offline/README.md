# Analysis with Backend Offline - Test Suite

## Overview

This test suite verifies that the YouTube Chrome Extension handles backend connection failures gracefully, providing clear error messages and recovery options when the Perspective Prism backend is offline or unreachable.

## Test Objectives

1. Verify error detection when backend is offline
2. Validate user-friendly error messages
3. Test retry functionality
4. Verify recovery when backend comes back online
5. Ensure extension remains responsive during failures
6. Validate timeout handling (120 seconds)
7. Test settings navigation from error state

## Files in This Directory

### 📄 TEST_PLAN.md

Comprehensive test plan with detailed scenarios, steps, and expected results. Use this as your primary testing guide.

**When to use**: Before starting manual testing to understand all scenarios.

### 📄 TEST_RESULTS_TEMPLATE.md

Template for documenting test execution results. Copy this file and fill it out during testing.

**When to use**: During and after test execution to record results.

### 📄 README.md (this file)

Overview and quick reference guide for the test suite.

## Quick Start

### Prerequisites

1. Extension installed and loaded in Chrome
2. Backend URL configured in settings
3. Access to start/stop backend server
4. Chrome DevTools open (F12)

### Running the Tests

#### Option 1: Interactive HTML Test Page

```bash
# Open in Chrome
open chrome-extension/test-backend-offline.html
```

Follow the step-by-step instructions in the interactive test page.

#### Option 2: Manual Testing with Test Plan

1. Open `TEST_PLAN.md`
2. Follow each scenario in order
3. Copy `TEST_RESULTS_TEMPLATE.md` to `TEST_RESULTS_[DATE].md`
4. Document your findings in the results file

#### Option 3: Quick Smoke Test

```bash
# 1. Stop backend
pkill -f uvicorn

# 2. Navigate to YouTube video
# https://www.youtube.com/watch?v=dQw4w9WgXcQ

# 3. Click "Analyze Video" button

# 4. Verify error message:
# "Cannot connect to Perspective Prism. Check your backend URL in settings."

# 5. Start backend
cd backend && uvicorn app.main:app --reload

# 6. Click "Retry" button

# 7. Verify analysis completes successfully
```

## Test Scenarios Summary

| #   | Scenario                             | Priority | Duration |
| --- | ------------------------------------ | -------- | -------- |
| 1   | Backend Offline Before Analysis      | High     | ~30s     |
| 2   | Backend Goes Offline During Analysis | High     | ~30s     |
| 3   | Recovery After Backend Comes Online  | High     | ~45s     |
| 4   | Invalid Backend URL Configuration    | Medium   | ~60s     |
| 5   | Network Timeout Simulation           | Medium   | ~120s    |
| 6   | Multiple Retry Attempts              | Medium   | ~90s     |
| 7   | Settings Link Functionality          | Low      | ~45s     |

**Total Estimated Time**: ~7-10 minutes

## Expected Error Messages

| Scenario                | Error Message                                                              |
| ----------------------- | -------------------------------------------------------------------------- |
| Connection Failure      | "Cannot connect to Perspective Prism. Check your backend URL in settings." |
| Timeout (120s)          | "The analysis took too long. Please try again later."                      |
| Server Error (5xx)      | "Our servers are experiencing issues. Please try again later."             |
| Too Many Requests (429) | "Too many requests. Please wait a moment and try again."                   |
| Invalid Data            | "The analysis data received was invalid. Please try again."                |

## Common Issues and Solutions

### Issue: Backend won't stop

```bash
ps aux | grep uvicorn
kill -9 <PID>
```

### Issue: Extension not responding

1. Go to `chrome://extensions/`
2. Find "Perspective Prism"
3. Click "Reload"
4. Refresh YouTube page

### Issue: Error message not appearing

1. Check console for JavaScript errors
2. Verify backend URL is configured
3. Check network tab in DevTools
4. Ensure extension has proper permissions

### Issue: Can't reproduce timeout

1. Use Chrome DevTools Network throttling
2. Set to "Offline" or custom slow profile
3. Or use a proxy tool to simulate slow network

## Acceptance Criteria

All tests must pass these criteria:

- ✅ Extension detects backend offline condition
- ✅ Clear, user-friendly error messages displayed
- ✅ Error messages match expected text
- ✅ Retry functionality works correctly
- ✅ Settings link opens options page
- ✅ Extension recovers when backend comes online
- ✅ No console errors or exceptions
- ✅ Extension remains responsive
- ✅ Timeout handling works (120s)
- ✅ No memory leaks
- ✅ Error states cleaned up properly
- ✅ Multiple retries work as expected

## Related Requirements

This test suite validates:

- **Requirement 6.1**: Backend unreachable error handling
- **Requirement 6.4**: Error logging (sanitized, no sensitive data)
- **Requirement 6.5**: Retry functionality
- **Requirement 3.2**: Timeout handling (120 seconds)

See: `.kiro/specs/youtube-chrome-extension/requirements.md`

## Related Design Sections

- Error Handling (Design Document Section 3.3)
- Client Error Formatting (Design Document - `formatUserError`)
- Retry Logic (Design Document - `shouldRetryError`)

See: `.kiro/specs/youtube-chrome-extension/design.md`

## Test History

| Date   | Tester | Result      | Notes                  |
| ------ | ------ | ----------- | ---------------------- |
| [Date] | [Name] | [Pass/Fail] | [Link to results file] |

## Reporting Issues

When reporting issues found during testing:

1. **Create a detailed bug report** including:
   - Test scenario number
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots/recordings
   - Console errors
   - Browser and extension versions

2. **Severity levels**:
   - **Critical**: Extension crashes, data loss, security issue
   - **High**: Core functionality broken, poor user experience
   - **Medium**: Feature partially works, workaround available
   - **Low**: Minor UI issue, cosmetic problem

3. **Include environment details**:
   - Chrome version
   - Extension version
   - Backend version
   - Operating system
   - Network conditions

## Additional Resources

### Interactive Test Page

`chrome-extension/test-backend-offline.html` - Step-by-step interactive testing

### Manual Testing Guide

`chrome-extension/MANUAL_TESTING_GUIDE.md` - Complete manual testing documentation

### Integration Tests

`chrome-extension/tests/integration/error-handling.spec.js` - Automated error handling tests

### Design Document

`.kiro/specs/youtube-chrome-extension/design.md` - Technical design and error handling specifications

## Contributing

To improve this test suite:

1. Add new scenarios to `TEST_PLAN.md`
2. Update expected error messages if they change
3. Document new edge cases discovered
4. Add screenshots/recordings to help future testers
5. Update acceptance criteria as requirements evolve

## Questions or Issues?

- Check the Manual Testing Guide for troubleshooting
- Review the Design Document for technical details
- Consult the Requirements Document for acceptance criteria
- Open an issue in the project repository

---

**Last Updated**: 11-30-2025
**Test Suite Version**: 1.0  
**Maintained By**: Development Team
