# Desktop Fullscreen Mode - Comprehensive Test Document

## Test Overview

**Test Type**: Manual Functional Testing  
**Component**: Perspective Prism Chrome Extension  
**Layout**: YouTube Desktop Fullscreen Mode  
**Version**: 1.0.0  
**Date**: **\*\***\_\_\_**\*\***  
**Tester**: **\*\***\_\_\_**\*\***

---

## Executive Summary

This document provides comprehensive testing procedures for the Perspective Prism Chrome extension in YouTube's desktop fullscreen mode. Fullscreen mode presents unique challenges as YouTube hides most UI elements and the extension must handle transitions gracefully.

### Key Testing Focus Areas

1. **Pre-Fullscreen State**: Button injection and panel functionality
2. **Fullscreen Transition**: Panel persistence during mode change
3. **In-Fullscreen Behavior**: Panel accessibility and interaction
4. **Exit Fullscreen**: Extension state recovery
5. **Edge Cases**: Rapid toggling, navigation, keyboard handling

---

## Test Environment

### Hardware Requirements

- **Processor**: Modern multi-core CPU
- **RAM**: 8GB minimum
- **Display**: 1920x1080 or higher resolution
- **Input**: Keyboard and mouse

### Software Requirements

- **Browser**: Google Chrome (latest stable version)
- **OS**: Windows 10/11, macOS 10.15+, or Linux
- **Extension**: Perspective Prism (loaded in developer mode)
- **Backend**: Perspective Prism backend server running

### Test Data

- **Primary Test Video**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- **Alternative Videos**: Any YouTube video with transcript
- **Backend URL**: `http://localhost:8000` (or configured URL)

---

## Fullscreen Mode Characteristics

Fullscreen mode is activated by clicking the fullscreen button (⛶) in YouTube's video player controls or pressing the 'f' key. In fullscreen mode:

- The video player expands to fill the entire screen
- All page UI elements are hidden (sidebar, description, comments)
- Browser UI is hidden (address bar, tabs, bookmarks bar)
- Video controls appear as an overlay on mouse movement
- Controls auto-hide after a few seconds of inactivity
- The DOM structure remains largely the same, but visibility changes

### Implications for Extension

1. **Button Visibility**: The Analyze button is hidden when controls are hidden
2. **Panel Persistence**: The panel must remain visible if opened before fullscreen
3. **Z-Index Management**: Panel must appear above fullscreen video
4. **State Recovery**: Extension must recover gracefully when exiting fullscreen
5. **Keyboard Handling**: Escape key must close panel first, then exit fullscreen

---

## Test Procedures

### Test Suite 1: Pre-Fullscreen Functionality

#### Test 1.1: Button Injection in Standard Mode

**Objective**: Verify button injects correctly before entering fullscreen

**Prerequisites**:

- Extension loaded
- Backend running
- YouTube video page loaded

**Steps**:

1. Navigate to test video URL
2. Wait for page to fully load (video player visible)
3. Locate the Analyze button in the action buttons area
4. Verify button styling matches YouTube's design
5. Verify button has proper ARIA attributes

**Expected Results**:

- ✅ Button appears within 2 seconds of page load
- ✅ Button positioned in `#top-level-buttons-computed` or fallback container
- ✅ Button has `data-pp-analysis-button="true"` attribute
- ✅ Button has proper ARIA label: "Analyze video claims"
- ✅ Button styling matches YouTube's button style
- ✅ No duplicate buttons present

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 1.2: Panel Display in Standard Mode

**Objective**: Verify panel displays correctly before entering fullscreen

**Prerequisites**:

- Test 1.1 passed
- Button visible

**Steps**:

1. Click the Analyze button
2. Observe loading state
3. Wait for analysis to complete (up to 2 minutes)
4. Verify panel appears on right side
5. Verify panel content displays correctly
6. Keep panel open for next test

**Expected Results**:

- ✅ Loading spinner appears immediately
- ✅ Panel appears on right side of screen
- ✅ Panel has fixed position (right: 20px, top: 60px)
- ✅ Panel displays analysis results
- ✅ Panel is scrollable
- ✅ Panel has close button (X)
- ✅ Panel has refresh button (🔄)
- ✅ Panel content is readable

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

### Test Suite 2: Fullscreen Transition

#### Test 2.1: Enter Fullscreen with Panel Open

**Objective**: Verify panel persists when entering fullscreen

**Prerequisites**:

- Test 1.2 passed
- Panel open with analysis results

**Steps**:

1. Verify panel is open and visible
2. Click the fullscreen button (⛶) in video controls
   OR press 'f' key
3. Observe panel during transition
4. Wait for fullscreen mode to activate
5. Verify panel state after transition

**Expected Results**:

- ✅ Panel remains visible during transition
- ✅ Panel remains visible in fullscreen mode
- ✅ Panel content remains intact (no re-render)
- ✅ Panel z-index is above video (9999)
- ✅ Panel position remains fixed
- ✅ Panel is still scrollable
- ✅ Panel buttons (close, refresh) remain functional

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 2.2: Enter Fullscreen Without Panel

**Objective**: Verify extension behavior when entering fullscreen without panel

**Prerequisites**:

- Extension loaded
- Video page loaded
- Panel NOT open

**Steps**:

1. Navigate to test video
2. Verify Analyze button is visible
3. Do NOT click the button
4. Press 'f' to enter fullscreen
5. Move mouse to show controls overlay
6. Observe button visibility
7. Press Escape to exit fullscreen
8. Verify button reappears

**Expected Results**:

- ✅ Button visible before fullscreen
- ✅ Button hidden in fullscreen (YouTube hides controls)
- ✅ Button may appear in controls overlay (acceptable)
- ✅ Button reappears after exiting fullscreen
- ✅ Button remains functional after exit
- ✅ No duplicate buttons

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

### Test Suite 3: In-Fullscreen Behavior

#### Test 3.1: Panel Interaction in Fullscreen

**Objective**: Verify panel remains fully interactive in fullscreen

**Prerequisites**:

- Test 2.1 passed
- Panel open in fullscreen mode

**Steps**:

1. Verify panel is visible in fullscreen
2. Move mouse over panel
3. Scroll panel content up and down
4. Click on a claim to expand/collapse
5. Click the refresh button
6. Wait for refresh to complete
7. Click the close button

**Expected Results**:

- ✅ Panel receives mouse events
- ✅ Scrolling works smoothly
- ✅ Expand/collapse animations work
- ✅ Refresh button triggers re-analysis
- ✅ Refresh overlay displays correctly
- ✅ Close button closes panel
- ✅ Panel doesn't interfere with video controls

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 3.2: Keyboard Navigation in Fullscreen

**Objective**: Verify keyboard shortcuts work correctly in fullscreen

**Prerequisites**:

- Panel open in fullscreen mode

**Steps**:

1. Verify panel is visible in fullscreen
2. Press Tab key multiple times
3. Observe focus cycling through panel elements
4. Press Escape key once
5. Verify panel closes
6. Press Escape key again
7. Verify fullscreen exits

**Expected Results**:

- ✅ Tab cycles through focusable elements in panel
- ✅ Focus visible on each element (outline)
- ✅ Focus cycles back to first element after last
- ✅ First Escape closes panel
- ✅ Second Escape exits fullscreen
- ✅ No keyboard trap
- ✅ Focus management works correctly

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 3.3: Controls Overlay Interaction

**Objective**: Verify panel and controls overlay don't conflict

**Prerequisites**:

- Panel open in fullscreen mode

**Steps**:

1. Verify panel is visible
2. Move mouse away from panel and controls
3. Wait for controls to auto-hide (3-5 seconds)
4. Verify panel remains visible
5. Move mouse to show controls
6. Click on video controls (play/pause, volume)
7. Verify controls work
8. Click on panel
9. Verify panel interaction works

**Expected Results**:

- ✅ Panel remains visible when controls hide
- ✅ Controls auto-hide doesn't affect panel
- ✅ Video controls work normally
- ✅ Panel interaction works normally
- ✅ No z-index conflicts
- ✅ No click-through issues

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

### Test Suite 4: Exit Fullscreen

#### Test 4.1: Exit Fullscreen with Panel Open

**Objective**: Verify panel and extension state when exiting fullscreen

**Prerequisites**:

- Panel open in fullscreen mode

**Steps**:

1. Verify panel is visible in fullscreen
2. Press Escape key to exit fullscreen
3. Observe panel during transition
4. Wait for standard mode to restore
5. Verify panel position and state
6. Verify button state
7. Close panel
8. Click button again to test functionality

**Expected Results**:

- ✅ Panel remains visible during exit transition
- ✅ Panel repositions to standard location (right: 20px, top: 60px)
- ✅ Panel content remains intact
- ✅ Panel remains functional
- ✅ Button remains visible
- ✅ Button remains functional
- ✅ No JavaScript errors in console
- ✅ No duplicate elements

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 4.2: Exit Fullscreen Without Panel

**Objective**: Verify button state when exiting fullscreen without panel

**Prerequisites**:

- In fullscreen mode
- Panel NOT open

**Steps**:

1. Enter fullscreen mode (panel not open)
2. Verify button is hidden (controls hidden)
3. Press Escape to exit fullscreen
4. Wait for standard mode to restore
5. Verify button reappears
6. Click button to test functionality
7. Verify analysis works

**Expected Results**:

- ✅ Button hidden in fullscreen
- ✅ Button reappears within 500ms of exit
- ✅ Button positioned correctly
- ✅ Button functional
- ✅ Analysis works normally
- ✅ No duplicate buttons

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

### Test Suite 5: Edge Cases

#### Test 5.1: Rapid Fullscreen Toggling

**Objective**: Verify extension handles rapid mode switching

**Prerequisites**:

- Extension loaded
- Video page loaded

**Steps**:

1. Navigate to test video
2. Click Analyze button and wait for results
3. Press 'f' to enter fullscreen
4. Immediately press 'f' to exit
5. Repeat steps 3-4 five times rapidly
6. Verify panel state
7. Verify button state
8. Check console for errors

**Expected Results**:

- ✅ Panel remains stable
- ✅ Button remains stable
- ✅ No duplicate elements created
- ✅ No JavaScript errors
- ✅ Extension remains functional
- ✅ No memory leaks

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 5.2: Analysis During Fullscreen Transition

**Objective**: Verify analysis works when triggered during transition

**Prerequisites**:

- Extension loaded
- Video page loaded

**Steps**:

1. Navigate to test video
2. Click Analyze button
3. Immediately press 'f' (while loading)
4. Verify loading state in fullscreen
5. Wait for analysis to complete
6. Verify results display correctly
7. Exit fullscreen
8. Verify panel persists

**Expected Results**:

- ✅ Loading state visible in fullscreen
- ✅ Analysis completes successfully
- ✅ Results display in fullscreen
- ✅ Panel remains functional
- ✅ Exit fullscreen works correctly

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 5.3: Fullscreen Navigation

**Objective**: Verify extension handles video navigation in fullscreen

**Prerequisites**:

- In fullscreen mode

**Steps**:

1. Enter fullscreen mode
2. Move mouse to show controls
3. Navigate to another video while in fullscreen using one of these methods:
   - Keyboard shortcuts (e.g., press 'N' or 'Shift+N' for next video)
   - Manually change the URL to a different video ID
   - Use browser back/forward navigation keys
   - _Alternative: Skip test - YouTube UI unavailable in fullscreen_
4. Wait for navigation to complete
5. Verify fullscreen persists
6. Exit fullscreen
7. Verify button re-injected for new video
8. Test button functionality

**Expected Results**:

- ✅ Fullscreen persists after navigation
- ✅ Old panel closed (if open)
- ✅ Extension state reset for new video
- ✅ Button visible after exit
- ✅ Button functional on new video
- ✅ No duplicate buttons

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 5.4: Browser Fullscreen vs Video Fullscreen

**Objective**: Verify extension handles different fullscreen types

**Prerequisites**:

- Extension loaded
- Video page loaded

**Steps**:

1. Navigate to test video
2. Open analysis panel
3. Press F11 (browser fullscreen)
4. Verify panel visibility
5. Press F11 to exit
6. Verify panel state
7. Press 'f' (video fullscreen)
8. Verify panel visibility
9. Press Escape to exit
10. Compare behaviors

**Expected Results**:

- ✅ Panel visible in browser fullscreen (F11)
- ✅ Panel visible in video fullscreen ('f')
- ✅ Both fullscreen types handled correctly
- ✅ Extension recovers from both types
- ✅ No conflicts between fullscreen types

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 5.5: Close Panel in Fullscreen

**Objective**: Verify panel can be closed and reopened in fullscreen

**Prerequisites**:

- Panel open in fullscreen mode

**Steps**:

1. Verify panel is visible in fullscreen
2. Click the close button (X)
3. Verify panel closes
4. Exit fullscreen
5. Verify button is visible
6. Click button to reopen panel
7. Enter fullscreen again
8. Verify panel visible in fullscreen

**Expected Results**:

- ✅ Panel closes in fullscreen
- ✅ Button visible after exit
- ✅ Panel can be reopened
- ✅ Panel persists in fullscreen on second entry
- ✅ No state corruption

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 5.6: Refresh in Fullscreen

**Objective**: Verify refresh functionality works in fullscreen

**Prerequisites**:

- Panel open in fullscreen with cached results

**Steps**:

1. Analyze a video (get cached results)
2. Enter fullscreen mode
3. Verify "Cached" badge visible
4. Click refresh button (🔄)
5. Observe refresh overlay
6. Wait for fresh analysis
7. Verify "Fresh" badge appears
8. Verify results update
9. Exit fullscreen
10. Verify panel state

**Expected Results**:

- ✅ Refresh button works in fullscreen
- ✅ Refresh overlay displays correctly
- ✅ Fresh analysis completes
- ✅ Results update in fullscreen
- ✅ Badge changes from "Cached" to "Fresh"
- ✅ Panel remains functional after exit

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

### Test Suite 6: Accessibility

#### Test 6.1: Screen Reader Compatibility

**Objective**: Verify screen reader can access panel in fullscreen

**Prerequisites**:

- Screen reader installed (NVDA, JAWS, or VoiceOver)
- Panel open in fullscreen

**Steps**:

1. Enable screen reader
2. Enter fullscreen with panel open
3. Navigate to panel using screen reader
4. Verify panel content is announced
5. Navigate through claims
6. Verify ARIA labels are read
7. Test interactive elements

**Expected Results**:

- ✅ Panel is discoverable by screen reader
- ✅ Panel title announced
- ✅ Claims announced with proper labels
- ✅ Interactive elements have labels
- ✅ State changes announced
- ✅ Focus management works

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail [ ] N/A (No screen reader)

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 6.2: High Contrast Mode

**Objective**: Verify panel is usable in high contrast mode

**Prerequisites**:

- High contrast mode enabled (OS level)

**Steps**:

1. Enable high contrast mode
2. Navigate to test video
3. Open analysis panel
4. Enter fullscreen
5. Verify panel visibility
6. Verify text readability
7. Verify button visibility
8. Test interactions

**Expected Results**:

- ✅ Panel visible in high contrast
- ✅ Text readable
- ✅ Buttons visible
- ✅ Sufficient contrast
- ✅ Borders visible
- ✅ Interactive elements distinguishable

**Actual Results**: **\*\***\_\_\_**\*\***

**Status**: [ ] Pass [ ] Fail [ ] N/A (No high contrast)

**Notes**: **\*\***\_\_\_**\*\***

---

### Test Suite 7: Performance

#### Test 7.1: Memory Usage

**Objective**: Measure memory impact of fullscreen transitions

**Prerequisites**:

- Chrome DevTools open

**Steps**:

1. Open DevTools (F12)
2. Go to Memory tab
3. Take heap snapshot (baseline)
4. Perform 10 fullscreen enter/exit cycles
5. Take heap snapshot (after)
6. Compare snapshots
7. Calculate memory increase

**Expected Results**:

- ✅ Memory increase < 2 MB
- ✅ No memory leaks detected
- ✅ Detached DOM nodes < 10

**Actual Results**:

- Baseline: **\_** MB
- After: **\_** MB
- Increase: **\_** MB

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

#### Test 7.2: Transition Performance

**Objective**: Measure timing of fullscreen transitions

**Prerequisites**:

- Chrome DevTools open

**Steps**:

1. Open DevTools (F12)
2. Go to Performance tab
3. Start recording
4. Enter fullscreen
5. Exit fullscreen
6. Stop recording
7. Analyze timeline

**Expected Results**:

- ✅ Fullscreen enter < 100ms
- ✅ Fullscreen exit < 100ms
- ✅ Panel reposition < 50ms
- ✅ No layout thrashing
- ✅ No forced reflows

**Actual Results**:

- Enter time: **\_** ms
- Exit time: **\_** ms
- Reposition time: **\_** ms

**Status**: [ ] Pass [ ] Fail

**Notes**: **\*\***\_\_\_**\*\***

---

## Test Results Summary

### Test Execution Summary

**Total Tests**: 23  
**Tests Passed**: **\_**  
**Tests Failed**: **\_**  
**Tests Skipped**: **\_**

### Test Suite Results

| Suite                  | Tests | Passed | Failed | Pass Rate |
| ---------------------- | ----- | ------ | ------ | --------- |
| Pre-Fullscreen         | 2     | \_\_\_ | \_\_\_ | \_\_\_%   |
| Fullscreen Transition  | 2     | \_\_\_ | \_\_\_ | \_\_\_%   |
| In-Fullscreen Behavior | 3     | \_\_\_ | \_\_\_ | \_\_\_%   |
| Exit Fullscreen        | 2     | \_\_\_ | \_\_\_ | \_\_\_%   |
| Edge Cases             | 6     | \_\_\_ | \_\_\_ | \_\_\_%   |
| Accessibility          | 2     | \_\_\_ | \_\_\_ | \_\_\_%   |
| Performance            | 2     | \_\_\_ | \_\_\_ | \_\_\_%   |

### Critical Issues

**Count**: \_\_\_

| ID  | Description | Severity | Status |
| --- | ----------- | -------- | ------ |
|     |             |          |        |

### High Priority Issues

**Count**: \_\_\_

| ID  | Description | Severity | Status |
| --- | ----------- | -------- | ------ |
|     |             |          |        |

### Medium Priority Issues

**Count**: \_\_\_

| ID  | Description | Severity | Status |
| --- | ----------- | -------- | ------ |
|     |             |          |        |

### Low Priority Issues

**Count**: \_\_\_

| ID  | Description | Severity | Status |
| --- | ----------- | -------- | ------ |
|     |             |          |        |

---

## Recommendations

### For Production Release

- [ ] All critical tests must pass
- [ ] At least 95% of high priority tests must pass
- [ ] No critical or high severity bugs
- [ ] Performance metrics within acceptable range
- [ ] Accessibility requirements met

### Known Limitations

Document any known limitations of fullscreen mode:

1. ***
2. ***
3. ***

### Future Improvements

Suggest improvements for fullscreen mode support:

1. ***
2. ***
3. ***

---

## Sign-Off

### Tester Sign-Off

**Name**: ******\_\_\_******
**Date**: ******\_\_\_******
**Signature**: ******\_\_\_******

**Recommendation**: [ ] Approve [ ] Approve with conditions [ ] Reject

**Comments**:

---

---

---

### Reviewer Sign-Off

**Name**: ******\_\_\_******
**Date**: ******\_\_\_******
**Signature**: ******\_\_\_******

**Recommendation**: [ ] Approve [ ] Approve with conditions [ ] Reject

**Comments**:

---

---

---

---

## Appendix

### Test Environment Details

**Browser**: Chrome ******\_\_\_******
**OS**: ******\_\_\_******
**Screen Resolution**: ******\_\_\_******
**Extension Version**: ******\_\_\_******
**Backend Version**: ******\_\_\_******

### Test Data

**Videos Tested**:

1. ***
2. ***
3. ***

### Console Logs

Attach relevant console logs if issues were found.

### Screenshots

Attach screenshots of any issues or notable behaviors.

---

**Document Version**: 1.0  
**Last Updated**: ******\_\_\_******
**Next Review Date**: ******\_\_\_******
