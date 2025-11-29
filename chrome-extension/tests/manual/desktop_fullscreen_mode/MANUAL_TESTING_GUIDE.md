# Fullscreen Mode - Manual Testing Guide

## Overview

This guide provides step-by-step instructions for manually testing the Perspective Prism extension in YouTube's fullscreen mode.

---

## Prerequisites

### 1. Extension Setup
- [ ] Extension loaded in Chrome (Developer Mode)
- [ ] Backend configured and running
- [ ] Extension icon visible in Chrome toolbar

### 2. Test Environment
- [ ] Chrome browser (latest version)
- [ ] Screen resolution: 1920x1080 or higher (recommended)
- [ ] YouTube account (optional, but helpful)

### 3. Test Data
- [ ] Test video URL: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- [ ] Alternative videos for navigation testing
- [ ] Backend health check: `http://localhost:8000/health`

---

## What is Fullscreen Mode?

**Fullscreen Mode** is a YouTube viewing mode that:
- Expands the video player to fill the entire screen
- Hides all page UI elements (sidebar, description, comments)
- Hides browser UI (address bar, tabs, bookmarks)
- Can be toggled with the fullscreen button (⛶) or 'f' key
- Shows controls overlay on mouse movement

**Why Test This?**
- Extension UI may be hidden when controls are hidden
- Button injection points are not visible in fullscreen
- Panel must be accessible despite fullscreen constraints
- Exit fullscreen must not break extension state
- Controls overlay interaction needs verification

---

## Quick Start (5-Minute Test)

### Step 1: Load Extension
```bash
1. Open Chrome
2. Go to chrome://extensions/
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select chrome-extension directory
6. Verify extension loaded successfully
```

### Step 2: Navigate to YouTube
```bash
1. Open new tab
2. Go to: https://www.youtube.com/watch?v=dQw4w9WgXcQ
3. Wait for page to load completely
4. Verify video player is visible
```

### Step 3: Test Before Fullscreen
```bash
1. Verify "Analyze Video" button is visible
2. Click "Analyze Video" button
3. Wait for analysis to complete
4. Verify panel displays on right side
5. Keep panel open
```

### Step 4: Enter Fullscreen
```bash
1. Click the fullscreen button (⛶) in player controls
   OR press 'f' key
2. Observe video expand to fill screen
3. Move mouse to show controls overlay
4. Verify panel behavior
```

### Step 5: Test in Fullscreen
```bash
1. Verify panel remains visible (if opened before fullscreen)
2. Move mouse to hide controls
3. Verify panel accessibility
4. Press Escape to exit fullscreen
5. Verify extension state after exit
```

**Result**: [ ] Pass [ ] Fail

---

## Comprehensive Testing (30-Minute Test)

### Test 1: Button Visibility Before Fullscreen

**Objective**: Verify button is visible and functional before entering fullscreen

**Steps**:
1. Navigate to test video (standard mode)
2. Wait for page to fully load
3. Locate Analyze button
4. Verify button styling
5. Click button to test functionality

**Expected**:
- ✅ Button appears within 2 seconds
- ✅ Button positioned in action bar
- ✅ Button styling matches YouTube
- ✅ Button is clickable
- ✅ Analysis works correctly

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 2: Panel Before Fullscreen

**Objective**: Verify panel can be opened before entering fullscreen

**Steps**:
1. Navigate to test video (standard mode)
2. Click Analyze button
3. Wait for analysis to complete
4. Verify panel displays correctly
5. Keep panel open for next test

**Expected**:
- ✅ Panel appears on right side
- ✅ Panel displays analysis results
- ✅ Panel is scrollable
- ✅ Panel content is readable
- ✅ Close button works

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 3: Enter Fullscreen with Panel Open

**Objective**: Verify panel behavior when entering fullscreen while panel is open

**Steps**:
1. Navigate to test video (standard mode)
2. Click Analyze button and wait for results
3. Verify panel is open
4. Click fullscreen button (⛶) or press 'f'
5. Observe panel during transition
6. Verify panel after transition

**Expected**:
- ✅ Panel remains visible during transition
- ✅ Panel remains visible in fullscreen
- ✅ Panel content remains intact
- ✅ Panel is still scrollable
- ✅ Panel close button works
- ✅ Panel z-index above video

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 4: Panel Interaction in Fullscreen

**Objective**: Verify panel remains interactive in fullscreen mode

**Steps**:
1. Enter fullscreen with panel open
2. Move mouse to show controls overlay
3. Click on panel to interact
4. Scroll panel content
5. Click expand/collapse on claims
6. Click refresh button
7. Click close button

**Expected**:
- ✅ Panel receives mouse events
- ✅ Scrolling works
- ✅ Expand/collapse works
- ✅ Refresh button works
- ✅ Close button works
- ✅ Panel doesn't interfere with video controls

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 5: Exit Fullscreen with Panel Open

**Objective**: Verify panel and extension state when exiting fullscreen

**Steps**:
1. Enter fullscreen with panel open
2. Press Escape key to exit fullscreen
3. Observe panel during transition
4. Verify panel after transition
5. Verify button state
6. Verify extension functionality

**Expected**:
- ✅ Panel remains visible during exit
- ✅ Panel repositions correctly
- ✅ Panel content remains intact
- ✅ Button remains visible
- ✅ Button remains functional
- ✅ No JavaScript errors

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 6: Enter Fullscreen Without Panel

**Objective**: Verify extension behavior when entering fullscreen without opening panel

**Steps**:
1. Navigate to test video (standard mode)
2. Do NOT click Analyze button
3. Click fullscreen button (⛶) or press 'f'
4. Move mouse to show controls overlay
5. Observe button visibility
6. Exit fullscreen
7. Verify button is still present

**Expected**:
- ✅ Button hidden in fullscreen (YouTube hides controls)
- ✅ Button may appear in controls overlay (acceptable)
- ✅ Button reappears after exiting fullscreen
- ✅ Button remains functional after exit
- ✅ No duplicate buttons

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 7: Analyze in Fullscreen (If Button Visible)

**Objective**: Verify analysis can be triggered from fullscreen if button is accessible

**Steps**:
1. Navigate to test video
2. Enter fullscreen mode
3. Move mouse to show controls overlay
4. Look for Analyze button
5. If visible, click button
6. Wait for analysis
7. Verify panel displays

**Expected**:
- ✅ If button visible, it's clickable
- ✅ Analysis starts
- ✅ Panel displays in fullscreen
- ✅ Panel is accessible
- ✅ Results display correctly

**Note**: Button may not be visible in fullscreen (YouTube hides controls). This is acceptable behavior.

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail [ ] N/A (Button not visible)

---

### Test 8: Fullscreen Navigation

**Objective**: Verify extension handles video navigation in fullscreen

**Steps**:
1. Navigate to test video
2. Enter fullscreen mode
3. Move mouse to show controls
4. Click on a recommended video (if visible)
5. Wait for navigation to complete
6. Verify fullscreen persists
7. Exit fullscreen
8. Verify button re-injected

**Expected**:
- ✅ Fullscreen persists after navigation
- ✅ Old panel closed (if open)
- ✅ Extension state reset for new video
- ✅ Button visible after exiting fullscreen
- ✅ Button functional on new video

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 9: Keyboard Navigation in Fullscreen

**Objective**: Verify keyboard shortcuts work in fullscreen with panel open

**Steps**:
1. Navigate to test video
2. Open analysis panel
3. Enter fullscreen mode
4. Press Tab to cycle focus
5. Press Escape to close panel
6. Verify panel closes
7. Press Escape again to exit fullscreen
8. Verify focus returns correctly

**Expected**:
- ✅ Tab cycles through panel elements
- ✅ First Escape closes panel
- ✅ Second Escape exits fullscreen
- ✅ Focus management works correctly
- ✅ No keyboard trap

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 10: Rapid Fullscreen Toggling

**Objective**: Verify extension handles rapid fullscreen mode switching

**Steps**:
1. Navigate to test video
2. Open analysis panel
3. Press 'f' to enter fullscreen
4. Immediately press 'f' to exit
5. Repeat 5 times rapidly
6. Verify panel state
7. Verify button state
8. Check console for errors

**Expected**:
- ✅ Panel remains stable
- ✅ Button remains stable
- ✅ No duplicate elements
- ✅ No JavaScript errors
- ✅ Extension remains functional

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 11: Dark Mode + Fullscreen

**Objective**: Verify extension works correctly with dark theme in fullscreen

**Steps**:
1. Enable YouTube dark mode (Settings → Appearance → Dark theme)
2. Navigate to test video
3. Open analysis panel
4. Verify panel uses dark theme
5. Enter fullscreen mode
6. Verify panel styling in fullscreen
7. Exit fullscreen
8. Verify styling remains correct

**Expected**:
- ✅ Panel uses dark theme
- ✅ Panel text readable in fullscreen
- ✅ Sufficient color contrast
- ✅ Styling persists after exit
- ✅ No visual glitches

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 12: Multiple Fullscreen Sessions

**Objective**: Verify extension handles multiple fullscreen sessions

**Steps**:
1. Navigate to Video 1
2. Analyze Video 1
3. Enter fullscreen
4. Exit fullscreen
5. Navigate to Video 2
6. Analyze Video 2
7. Enter fullscreen
8. Exit fullscreen
9. Repeat for Video 3
10. Check memory usage

**Expected**:
- ✅ Each session works correctly
- ✅ No memory leaks
- ✅ No accumulated errors
- ✅ Extension remains responsive
- ✅ Cleanup happens correctly

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

## Edge Case Testing

### Edge Case 1: Analysis During Fullscreen Transition

**Steps**:
1. Navigate to test video
2. Click Analyze button
3. Immediately press 'f' (while loading)
4. Wait for analysis to complete
5. Verify results display in fullscreen

**Expected**: Analysis completes, results display correctly in fullscreen

**Result**: [ ] Pass [ ] Fail

---

### Edge Case 2: Close Panel in Fullscreen

**Steps**:
1. Navigate to test video
2. Open analysis panel
3. Enter fullscreen
4. Close panel using X button
5. Exit fullscreen
6. Verify button state
7. Click button again

**Expected**: Panel closes correctly, button remains functional

**Result**: [ ] Pass [ ] Fail

---

### Edge Case 3: Refresh in Fullscreen

**Steps**:
1. Navigate to test video
2. Analyze video (get cached results)
3. Enter fullscreen
4. Click refresh button in panel
5. Wait for fresh analysis
6. Verify results update in fullscreen

**Expected**: Refresh works, results update correctly

**Result**: [ ] Pass [ ] Fail

---

### Edge Case 4: Browser Fullscreen vs Video Fullscreen

**Steps**:
1. Navigate to test video
2. Press F11 (browser fullscreen)
3. Verify extension behavior
4. Exit browser fullscreen (F11)
5. Press 'f' (video fullscreen)
6. Verify extension behavior
7. Compare behaviors

**Expected**: Extension handles both fullscreen types gracefully

**Result**: [ ] Pass [ ] Fail

---

### Edge Case 5: Fullscreen on Secondary Monitor

**Steps** (requires multi-monitor setup):
1. Navigate to test video
2. Open analysis panel
3. Drag Chrome window to secondary monitor
4. Enter fullscreen mode
5. Verify panel displays on correct monitor
6. Exit fullscreen
7. Verify extension state

**Expected**: Panel displays on correct monitor, no positioning issues

**Result**: [ ] Pass [ ] Fail [ ] N/A (Single monitor)

---

## Debugging Tips

### Panel Not Visible in Fullscreen?

**Check**:
1. Open DevTools (F12) before entering fullscreen
2. Enter fullscreen mode
3. Check Console tab for errors
4. Verify panel element exists:
   ```javascript
   console.log(document.getElementById('pp-analysis-panel'));
   ```
5. Check panel z-index:
   ```javascript
   const panel = document.getElementById('pp-analysis-panel');
   console.log(window.getComputedStyle(panel).zIndex);
   ```
6. Expected z-index: 9999 or higher

**If panel is hidden**:
- Check if YouTube's fullscreen overlay has higher z-index
- Verify panel position is `fixed`
- Check if panel is being removed on fullscreen enter
- Document issue with screenshot

---

### Button Not Reappearing After Exit?

**Check**:
1. Open DevTools (F12)
2. Exit fullscreen
3. Check Console for errors
4. Verify button element:
   ```javascript
   console.log(document.getElementById('pp-analysis-button'));
   console.log(document.querySelector('[data-pp-analysis-button="true"]'));
   ```
5. Check if cleanup ran:
   ```javascript
   // Look for cleanup logs in console
   ```

**If button is missing**:
- Check if navigation detection fired
- Verify MutationObserver is active
- Check if button injection selectors are valid
- Try refreshing the page

---

### Extension Breaks After Fullscreen?

**Check**:
1. Open DevTools (F12)
2. Check Console for errors
3. Check if service worker is active:
   - Go to chrome://extensions/
   - Find Perspective Prism
   - Click "service worker" link
   - Check for errors
4. Verify message passing works:
   ```javascript
   chrome.runtime.sendMessage({type: 'PING'}, console.log);
   ```

**If extension is broken**:
- Reload extension
- Document steps to reproduce
- Check if issue persists after reload
- Report as critical bug

---

## Performance Monitoring

### Memory Usage

**Steps**:
1. Open DevTools (F12)
2. Go to Memory tab
3. Take heap snapshot before test
4. Perform 10 fullscreen enter/exit cycles
5. Take heap snapshot after test
6. Compare snapshots

**Expected**: < 2 MB increase

**Actual**: _______________

---

### Timing

**Measure**:
1. Fullscreen enter time: _____ ms (expected < 100ms)
2. Fullscreen exit time: _____ ms (expected < 100ms)
3. Panel render in fullscreen: _____ ms (expected < 300ms)
4. Button re-injection after exit: _____ ms (expected < 500ms)

---

## Browser-Specific Testing

### Chrome-Specific Behavior

**Test**:
- [ ] Fullscreen API works correctly
- [ ] Controls overlay behavior
- [ ] Escape key handling
- [ ] F11 (browser fullscreen) vs 'f' (video fullscreen)

### Known Limitations

**Document**:
- Button may be hidden in fullscreen (YouTube hides controls)
- Panel must be opened before entering fullscreen for best experience
- Some keyboard shortcuts may be captured by browser
- Fullscreen behavior may vary by OS

---

## Reporting Issues

### Issue Template

```markdown
**Title**: [Brief description]

**Severity**: Critical / High / Medium / Low

**Environment**:
- Extension version: _____
- Browser version: _____
- OS: _____
- YouTube layout: Fullscreen Mode
- Screen resolution: _____

**Steps to Reproduce**:
1. _____
2. _____
3. _____

**Expected Behavior**:
_____

**Actual Behavior**:
_____

**Screenshots/Video**:
[Attach if applicable]

**Console Errors**:
```
[Paste console output]
```

**Additional Context**:
_____
```

---

## Test Summary

**Date**: _______________  
**Tester**: _______________  
**Duration**: _______________

**Tests Passed**: _____ / _____  
**Tests Failed**: _____ / _____

**Critical Issues**: _____  
**High Priority Issues**: _____  
**Medium Priority Issues**: _____  
**Low Priority Issues**: _____

**Overall Assessment**:
- [ ] ✅ Ready for production
- [ ] ⚠️ Minor issues, acceptable for release
- [ ] ❌ Major issues, requires fixes
- [ ] 🚫 Critical issues, blocks release

**Notes**:
_______________________________________________
_______________________________________________
_______________________________________________

**Signature**: _______________
