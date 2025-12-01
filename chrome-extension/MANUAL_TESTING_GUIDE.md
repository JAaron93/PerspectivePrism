# Manual Testing Guide

This guide provides instructions for manually testing the YouTube Chrome Extension, particularly for scenarios that are difficult to automate.

## Quick Start

1. **Load the Extension**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `chrome-extension` directory

2. **Configure Backend**
   - Click the extension icon in Chrome toolbar
   - Click "Open Settings"
   - Enter your backend URL (e.g., `http://localhost:8000`)
   - Click "Test Connection" to verify
   - Click "Save Settings"

3. **Test on YouTube**
   - Navigate to any YouTube video
   - Look for the "Analyze Video" button near the video controls
   - Click to trigger analysis

## Test Files

The extension includes several HTML test files for manual verification:

### Backend Offline Testing

- **File**: `test-backend-offline.html`
- **Purpose**: Comprehensive test scenarios for backend connection failures
- **How to use**: Open the file in Chrome and follow the step-by-step instructions

### Other Test Files

- `test-analysis.html` - Analysis flow testing
- `test-button-styles.html` - Button appearance verification
- `test-cache.html` - Cache functionality testing
- `test-cache-size-monitoring.html` - Cache size monitoring and eviction testing
- `test-cancel-analysis.html` - Analysis cancellation testing
- `test-config.html` - Configuration validation testing
- `test-connection.html` - Backend connection testing
- `test-light-theme-verification.html` - Light theme compatibility
- `test-onboarding.html` - First-time user experience
- `test-options-integration.html` - Settings page integration
- `test-options-validation.html` - Settings validation
- `test-page-load-performance.html` - Measures page load performance metrics (Navigation Timing API)
- `test-panel-styles.html` - Analysis panel styling
- `test-policy-version.html` - Privacy policy versioning
- `test-popup-options-styles.html` - Popup styling
- `test-popup-states.html` - Popup state management
- `test-welcome.html` - Welcome page testing

## Backend Offline Testing Scenarios

### Scenario 1: Backend Offline Before Analysis

1. Stop the backend server: `pkill -f uvicorn`
2. Navigate to a YouTube video
3. Click "Analyze Video"
4. **Expected**: Error message "Cannot connect to Perspective Prism. Check your backend URL in settings."
5. **Verify**: Retry and Settings buttons are present

### Scenario 2: Backend Goes Offline During Analysis

1. Start backend: `cd backend && uvicorn app.main:app --reload`
2. Navigate to a YouTube video
3. Click "Analyze Video"
4. Immediately stop backend: `pkill -f uvicorn`
5. **Expected**: Connection error appears after timeout
6. **Verify**: Extension doesn't crash or freeze

### Scenario 3: Recovery After Backend Comes Online

1. With backend offline, trigger analysis (should fail)
2. Start backend: `cd backend && uvicorn app.main:app --reload`
3. Click "Retry" button
4. **Expected**: Analysis completes successfully
5. **Verify**: Results display correctly

### Scenario 4: Invalid Backend URL

1. Open extension settings
2. Set backend URL to invalid address: `http://invalid-backend.local:8000`
3. Save and navigate to YouTube video
4. Click "Analyze Video"
5. **Expected**: Connection error with settings suggestion
6. **Verify**: "Open Settings" button opens options page

### Scenario 5: Network Timeout

1. Open Chrome DevTools (F12) → Network tab
2. Set throttling to "Offline"
3. Trigger analysis
4. **Expected**: After 120 seconds, timeout error appears
5. **Verify**: Extension remains responsive

## Error Messages Reference

| Scenario           | Expected Error Message                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| Connection Failure | "Cannot connect to Perspective Prism. Check your backend URL in settings." |
| Timeout            | "The analysis took too long. Please try again later."                      |
| Server Error (5xx) | "Our servers are experiencing issues. Please try again later."             |
| No Transcript      | "This video cannot be analyzed. It may not have a transcript available."   |
| Invalid Video      | "Video not found or unavailable."                                          |

## Acceptance Criteria Checklist

- [ ] Extension detects backend offline condition
- [ ] Clear, user-friendly error messages displayed
- [ ] Retry functionality works correctly
- [ ] Settings link/button opens options page
- [ ] Extension recovers when backend comes back online
- [ ] No console errors or exceptions
- [ ] Extension remains responsive during failures
- [ ] Timeout handling works correctly (120s)

## Browser Compatibility Testing

Test the extension on:

- [ ] Chrome (latest version)
- [ ] Chrome (previous version)
- [ ] Brave browser
- [ ] Other Chromium-based browsers

## YouTube Layout Variants

Test on different YouTube layouts:

- [ ] Desktop standard layout
- [ ] Desktop theater mode
- [ ] Desktop fullscreen mode
- [ ] Mobile layout (m.youtube.com)
- [ ] Embedded videos (youtube-nocookie.com)
- [ ] YouTube Shorts
- [ ] Dark theme
- [ ] Light theme

## Accessibility Testing

- [ ] Keyboard navigation (Tab, Arrow keys, Escape)
- [ ] Screen reader compatibility (NVDA/JAWS)
- [ ] Focus management (trap, return)
- [ ] Color contrast (WCAG AA compliance)
- [ ] Touch targets (44x44px minimum)

## Performance Testing

### Quick Checklist

- [ ] Extension memory usage (<10MB) - See `MEMORY_PROFILING.md`
- [x] Page load impact (<100ms) - See `PAGE_LOAD_PERFORMANCE_TESTING.md`
- [ ] Analysis response time (<5s for cached)
- [x] Cache size monitoring - See `tests/manual_qa/performance_testing/cache_size_monitoring.md`

### Page Load Performance Testing

**Objective**: Verify that the extension adds less than 100ms to YouTube page load time (Requirement 8.2).

**Quick Test**:

1. Open `test-page-load-performance.html` in Chrome
2. Follow the on-screen instructions for automated or manual testing
3. Compare page load times with and without the extension enabled

**Detailed Guide**: See `PAGE_LOAD_PERFORMANCE_TESTING.md` for comprehensive testing procedures, including:

- Chrome DevTools Performance Profiler method (recommended)
- Navigation Timing API automated measurements
- Lighthouse Performance Audit
- Expected results and pass/fail criteria
- Optimization recommendations

**Expected Result**: Extension overhead < 100ms on both DOMContentLoaded and Load events.

**Current Optimizations**:

- Content script runs at `document_idle` (after page load)
- All operations are async and non-blocking
- Lazy initialization of UI components
- Debounced MutationObserver (500ms)
- Minimal initial execution footprint

### Cache Size Monitoring

**Objective**: Verify that storage usage is tracked over time, eviction events are logged, and cache hit/miss rates are monitored correctly (Requirement 8.5).

**Quick Test**:

1. Open `test-cache-size-monitoring.html` in Chrome
2. Use the interactive test page to simulate cache operations
3. Verify metrics are tracked and displayed correctly

**Detailed Guide**: See `tests/manual_qa/performance_testing/cache_size_monitoring.md` for comprehensive testing procedures, including:

- Cache hit/miss rate tracking
- Storage usage monitoring over time
- Quota level detection (normal/warning/critical)
- Eviction event logging
- Metrics persistence and reset

**Expected Results**:

- Cache hit/miss rates calculated correctly
- Storage usage tracked with quota snapshots
- Eviction events logged with details (video IDs, freed space, reason)
- Metrics persist across browser sessions
- Quota levels trigger at correct thresholds (80% warning, 95% critical)

**Monitoring Features**:

- MetricsTracker keeps last 100 entries for each metric type
- QuotaManager monitors storage and triggers LRU eviction
- Real-time quota usage visualization with color-coded progress bar
- Detailed eviction event history with timestamps

## Reporting Issues

When reporting issues, include:

1. Chrome version
2. Extension version
3. Backend URL (sanitized)
4. Steps to reproduce
5. Expected vs actual behavior
6. Console errors (if any)
7. Screenshots/screen recordings

## Tips for Effective Testing

1. **Clear Cache Between Tests**: Use the "Clear Cache" button in settings to ensure clean state
2. **Check Console**: Always have DevTools open to catch JavaScript errors
3. **Test Edge Cases**: Try rapid clicking, navigation during loading, etc.
4. **Document Everything**: Take notes on unexpected behavior
5. **Test Incrementally**: Verify each scenario before moving to the next

## Common Issues and Solutions

### Button Not Appearing

- Refresh the page
- Check if YouTube layout changed
- Verify extension is enabled
- Check console for injection errors

### Analysis Stuck in Loading

- Check backend is running
- Verify network connectivity
- Check for console errors
- Try canceling and retrying

### Settings Not Saving

- Check browser storage permissions
- Try clearing extension data
- Verify URL format is correct

### Panel Not Displaying Results

- Check if data is cached (clear cache and retry)
- Verify backend response format
- Check console for validation errors

## Automated Testing

For automated tests, run:

```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:coverage       # Coverage report
```

## Contact

For questions or issues with testing, refer to the project documentation or contact the development team.
