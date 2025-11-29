# YouTube Shorts Manual Testing Guide

## Overview

This guide covers manual testing of the Perspective Prism extension on YouTube Shorts pages. YouTube Shorts uses a unique vertical video format with swipe navigation, requiring specific testing to ensure the extension works correctly without interfering with the native Shorts experience.

## Test Environment

### Prerequisites
- Chrome browser with extension loaded in developer mode
- Backend server running at configured URL
- Valid YouTube Shorts URLs for testing

### Test URLs

Use these YouTube Shorts URLs for testing:
- Example 1: `https://www.youtube.com/shorts/[SHORT_ID]`
- Example 2: `https://m.youtube.com/shorts/[SHORT_ID]` (mobile)

**Note**: Replace `[SHORT_ID]` with actual Shorts video IDs. You can find Shorts by:
1. Going to youtube.com/shorts
2. Browsing the Shorts feed
3. Looking for URLs with `/shorts/` in the path

## YouTube Shorts Layout Characteristics

### Desktop Shorts Layout
- **Vertical video format**: 9:16 aspect ratio (portrait)
- **Centered player**: Video centered on screen with black bars on sides
- **Minimal controls**: Like, dislike, comment, share buttons on right side
- **Swipe navigation**: Up/down arrow keys or scroll to navigate between Shorts
- **Auto-play**: Videos auto-play when scrolled into view

### Mobile Shorts Layout
- **Full-screen vertical**: Video fills entire mobile viewport
- **Touch gestures**: Swipe up/down to navigate between videos
- **Overlay controls**: Controls overlay the video
- **Compact UI**: Minimal interface to maximize video space

## Test Scenarios

### 1. Video ID Extraction

**Objective**: Verify the extension correctly extracts video IDs from Shorts URLs

**Steps**:
1. Navigate to a YouTube Shorts URL: `https://www.youtube.com/shorts/[SHORT_ID]`
2. Open browser console (F12)
3. Look for log message: `[Perspective Prism] Extracted Video ID via shorts path: [SHORT_ID]`

**Expected Results**:
- ✅ Video ID extracted successfully
- ✅ Log shows "shorts path" extraction strategy
- ✅ Video ID is exactly 11 characters (alphanumeric with - and _)

**Status**: ⬜ Not Tested

---

### 2. Content Script Injection

**Objective**: Verify the content script loads on Shorts pages

**Steps**:
1. Navigate to a YouTube Shorts URL
2. Open browser console (F12)
3. Look for initialization logs from content.js
4. Check that `window.ppPrintMetrics` function exists

**Expected Results**:
- ✅ Content script loads without errors
- ✅ Initialization logs appear in console
- ✅ Extension functions are available

**Status**: ⬜ Not Tested

---

### 3. Button Injection

**Objective**: Verify the Analysis Button appears in the Shorts interface

**Steps**:
1. Navigate to a YouTube Shorts URL
2. Wait for page to fully load
3. Look for the "Analyze with Perspective Prism" button
4. Check button position relative to Shorts controls

**Expected Results**:
- ✅ Button appears in the Shorts interface
- ✅ Button is visible and not hidden behind other elements
- ✅ Button styling matches YouTube's design language
- ✅ Button doesn't overlap video content
- ✅ Button position is consistent across different Shorts

**Possible Injection Points**:
- Near the right-side action buttons (like, dislike, comment, share)
- Below the video player
- In the description/info area

**Status**: ⬜ Not Tested

**Notes**: _Document which selector was used for injection_

---

### 4. Button Interaction

**Objective**: Verify button click triggers analysis correctly

**Steps**:
1. Click the Analysis Button on a Shorts page
2. Observe button state changes
3. Wait for analysis to complete

**Expected Results**:
- ✅ Button shows loading state (spinner)
- ✅ Analysis request sent to backend
- ✅ Button updates to success/error state based on result
- ✅ No console errors during interaction

**Status**: ⬜ Not Tested

---

### 5. Analysis Panel Display

**Objective**: Verify the Analysis Panel displays correctly on Shorts pages

**Steps**:
1. Trigger analysis on a Shorts page
2. Wait for analysis to complete
3. Observe panel appearance and positioning

**Expected Results**:
- ✅ Panel appears on the right side of the screen
- ✅ Panel doesn't overlap the vertical video
- ✅ Panel is scrollable if content exceeds viewport height
- ✅ Panel has proper z-index (appears above Shorts UI)
- ✅ Panel styling is consistent with other layouts

**Shorts-Specific Considerations**:
- Panel should not interfere with the centered vertical video
- Panel should work with black bars on sides (desktop)
- Panel should be accessible on narrower viewports

**Status**: ⬜ Not Tested

---

### 6. Swipe Navigation Compatibility

**Objective**: Verify extension doesn't interfere with Shorts swipe navigation

**Steps**:
1. Open a Shorts page with analysis panel visible
2. Use arrow keys (desktop) or swipe gestures (mobile) to navigate to next/previous Short
3. Observe extension behavior during navigation

**Expected Results**:
- ✅ Swipe navigation works normally (up/down arrows or touch swipe)
- ✅ Panel closes or updates when navigating to new Short
- ✅ Button re-appears for new Short
- ✅ No interference with YouTube's native navigation
- ✅ Video ID updates correctly for new Short

**Status**: ⬜ Not Tested

---

### 7. Keyboard Navigation

**Objective**: Verify keyboard shortcuts work on Shorts pages

**Steps**:
1. Open analysis panel on a Shorts page
2. Test keyboard shortcuts:
   - Tab: Navigate through panel elements
   - Escape: Close panel
   - Arrow keys: Should still navigate Shorts (not trapped in panel)

**Expected Results**:
- ✅ Tab cycles through panel elements
- ✅ Escape closes panel
- ✅ Arrow keys navigate Shorts (not captured by panel)
- ✅ Focus returns to button when panel closes

**Status**: ⬜ Not Tested

---

### 8. Cache Functionality

**Objective**: Verify caching works correctly for Shorts

**Steps**:
1. Analyze a Short (cache miss)
2. Navigate away and return to the same Short
3. Trigger analysis again (should be cache hit)

**Expected Results**:
- ✅ First analysis shows loading state
- ✅ Second analysis shows cached results immediately (<500ms)
- ✅ Cache indicator shows "Cached" timestamp
- ✅ Refresh button allows bypassing cache

**Status**: ⬜ Not Tested

---

### 9. Mobile Shorts Testing

**Objective**: Verify extension works on mobile Shorts URLs

**Steps**:
1. Navigate to `https://m.youtube.com/shorts/[SHORT_ID]`
2. Repeat tests 1-8 on mobile layout
3. Test touch interactions

**Expected Results**:
- ✅ Video ID extraction works on m.youtube.com
- ✅ Button appears in mobile Shorts layout
- ✅ Touch tap triggers analysis
- ✅ Panel displays correctly on mobile viewport
- ✅ Touch swipe navigation still works

**Status**: ⬜ Not Tested

---

### 10. Error Handling

**Objective**: Verify error states display correctly on Shorts

**Steps**:
1. Test with backend offline
2. Test with Short that has no transcript
3. Test with invalid configuration

**Expected Results**:
- ✅ Error messages display clearly
- ✅ Error state doesn't break Shorts navigation
- ✅ User can retry or dismiss error
- ✅ Extension recovers gracefully

**Status**: ⬜ Not Tested

---

## Known Issues and Limitations

### Potential Issues
1. **Selector Compatibility**: Shorts may use different DOM selectors than regular videos
2. **Auto-play Interference**: Extension should not interfere with Shorts auto-play
3. **Rapid Navigation**: Fast swiping between Shorts may cause race conditions
4. **Vertical Layout**: Panel positioning needs to work with portrait video format

### Workarounds
- If button doesn't appear, check console for selector failures
- If panel overlaps video, adjust CSS for Shorts-specific layout
- If navigation breaks, ensure cleanup handlers run on video change

## Test Results Summary

| Test Scenario | Status | Notes |
|--------------|--------|-------|
| 1. Video ID Extraction | ⬜ | |
| 2. Content Script Injection | ⬜ | |
| 3. Button Injection | ⬜ | |
| 4. Button Interaction | ⬜ | |
| 5. Analysis Panel Display | ⬜ | |
| 6. Swipe Navigation | ⬜ | |
| 7. Keyboard Navigation | ⬜ | |
| 8. Cache Functionality | ⬜ | |
| 9. Mobile Shorts | ⬜ | |
| 10. Error Handling | ⬜ | |

**Overall Status**: ⬜ Not Started

## Next Steps

1. Complete all test scenarios
2. Document any issues found
3. Create bug reports for failures
4. Update implementation if needed
5. Mark task as complete in tasks.md

## References

- Design Document: `.kiro/specs/youtube-chrome-extension/design.md`
- Requirements: `.kiro/specs/youtube-chrome-extension/requirements.md`
- Content Script: `chrome-extension/content.js`
- Manifest: `chrome-extension/manifest.json`
