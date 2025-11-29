# Theater Mode - Manual Testing Guide

## Overview

This guide provides step-by-step instructions for manually testing the Perspective Prism extension in YouTube's theater mode.

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

## What is Theater Mode?

**Theater Mode** is a YouTube viewing mode that:
- Expands the video player horizontally
- Keeps the page layout visible (unlike fullscreen)
- Moves description and comments below the player
- Can be toggled with the theater button (□) or 't' key

**Why Test This?**
- DOM structure may differ from standard layout
- Button injection points may change
- Panel positioning needs verification
- Mode switching must be handled gracefully

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

### Step 3: Activate Theater Mode
```bash
1. Click the theater mode button (□) in player controls
   OR press 't' key
2. Observe video player expand horizontally
3. Verify page layout adjusts
```

### Step 4: Test Button Injection
```bash
1. Look for "Analyze Video" button below video
2. Verify button is visible and styled correctly
3. Verify button is clickable
```

### Step 5: Test Analysis
```bash
1. Click "Analyze Video" button
2. Wait for analysis to complete
3. Verify panel displays on right side
4. Verify panel does not overlap video
5. Close panel with X button
```

**Result**: [ ] Pass [ ] Fail

---

## Comprehensive Testing (30-Minute Test)

### Test 1: Initial Button Injection

**Objective**: Verify button injects correctly when page loads in theater mode

**Steps**:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Navigate to test video
3. Immediately click theater mode button (before page fully loads)
4. Wait for page to stabilize
5. Look for Analyze button

**Expected**:
- ✅ Button appears within 2 seconds
- ✅ Button positioned in action bar
- ✅ Button styling matches YouTube
- ✅ No duplicate buttons

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 2: Mode Switching (Standard → Theater)

**Objective**: Verify button persists when switching from standard to theater mode

**Steps**:
1. Navigate to test video (standard mode)
2. Verify Analyze button is present
3. Click theater mode button (□)
4. Observe button during transition
5. Verify button after transition

**Expected**:
- ✅ Button visible before switch
- ✅ Button remains visible during switch
- ✅ Button visible after switch
- ✅ No duplicate buttons
- ✅ Button remains functional

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 3: Mode Switching (Theater → Standard)

**Objective**: Verify button persists when switching from theater to standard mode

**Steps**:
1. Navigate to test video
2. Activate theater mode
3. Verify Analyze button is present
4. Click theater mode button (□) again
5. Observe button during transition
6. Verify button after transition

**Expected**:
- ✅ Button visible before switch
- ✅ Button remains visible during switch
- ✅ Button visible after switch
- ✅ No duplicate buttons
- ✅ Button remains functional

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 4: Panel Display in Theater Mode

**Objective**: Verify analysis panel displays correctly in theater mode

**Steps**:
1. Navigate to test video in theater mode
2. Click Analyze button
3. Wait for analysis to complete
4. Observe panel position and size
5. Verify panel content

**Expected**:
- ✅ Panel appears on right side
- ✅ Panel does not overlap video
- ✅ Panel is scrollable
- ✅ Panel content displays correctly
- ✅ Close button works

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 5: Panel During Mode Switch

**Objective**: Verify panel behavior when switching modes while panel is open

**Steps**:
1. Navigate to test video (standard mode)
2. Click Analyze button
3. Wait for panel to open
4. Switch to theater mode (panel still open)
5. Observe panel behavior
6. Switch back to standard mode
7. Observe panel behavior

**Expected**:
- ✅ Panel remains visible during switches
- ✅ Panel content remains intact
- ✅ Panel repositions smoothly
- ✅ No visual glitches
- ✅ Panel remains functional

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 6: SPA Navigation in Theater Mode

**Objective**: Verify button re-injection when navigating between videos in theater mode

**Steps**:
1. Navigate to test video
2. Activate theater mode
3. Verify Analyze button present
4. Click on a recommended video
5. Wait for navigation to complete
6. Verify theater mode persists
7. Verify Analyze button re-injected

**Expected**:
- ✅ Theater mode persists after navigation
- ✅ Old button removed
- ✅ New button injected
- ✅ No duplicate buttons
- ✅ Button functional on new video

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 7: Dark Mode + Theater Mode

**Objective**: Verify extension works correctly with dark theme in theater mode

**Steps**:
1. Enable YouTube dark mode (Settings → Appearance → Dark theme)
2. Navigate to test video
3. Activate theater mode
4. Verify button styling
5. Click Analyze button
6. Verify panel styling

**Expected**:
- ✅ Button matches dark theme
- ✅ Button text readable
- ✅ Panel uses dark theme
- ✅ Panel text readable
- ✅ Sufficient color contrast

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 8: Keyboard Navigation

**Objective**: Verify keyboard shortcuts work in theater mode

**Steps**:
1. Navigate to test video in theater mode
2. Press Tab until Analyze button has focus
3. Press Enter to activate
4. Verify panel opens
5. Press Tab to cycle through panel elements
6. Press Escape to close panel
7. Verify focus returns to button

**Expected**:
- ✅ Tab reaches Analyze button
- ✅ Enter activates button
- ✅ Panel opens
- ✅ Tab cycles within panel
- ✅ Escape closes panel
- ✅ Focus returns to button

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 9: Responsive Behavior

**Objective**: Verify extension works at different window sizes in theater mode

**Steps**:
1. Navigate to test video in theater mode
2. Resize window to 1920px width
3. Verify button and panel
4. Resize window to 1280px width
5. Verify button and panel
6. Resize window to 1024px width
7. Verify button and panel

**Expected**:
- ✅ Button visible at all widths
- ✅ Panel visible at all widths
- ✅ Panel may overlay video at narrow widths (acceptable)
- ✅ Content remains readable

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

### Test 10: Error Handling

**Objective**: Verify error states display correctly in theater mode

**Steps**:
1. Stop backend server
2. Navigate to test video in theater mode
3. Click Analyze button
4. Wait for error
5. Verify error message
6. Click "Open Settings" button
7. Verify settings page opens

**Expected**:
- ✅ Error message displays
- ✅ Error message is clear
- ✅ "Open Settings" button works
- ✅ "Retry" button works (after restarting backend)

**Actual**: _______________

**Result**: [ ] Pass [ ] Fail

---

## Edge Case Testing

### Edge Case 1: Rapid Mode Switching

**Steps**:
1. Navigate to test video
2. Click theater button 5 times rapidly
3. Observe button behavior
4. Check console for errors

**Expected**: No errors, button remains functional

**Result**: [ ] Pass [ ] Fail

---

### Edge Case 2: Analysis During Mode Switch

**Steps**:
1. Navigate to test video (standard mode)
2. Click Analyze button
3. Immediately switch to theater mode (while loading)
4. Wait for analysis to complete
5. Verify results display correctly

**Expected**: Analysis completes, results display correctly

**Result**: [ ] Pass [ ] Fail

---

### Edge Case 3: Multiple Videos in Sequence

**Steps**:
1. Navigate to Video 1 in theater mode
2. Analyze Video 1
3. Navigate to Video 2 (theater mode persists)
4. Analyze Video 2
5. Navigate to Video 3
6. Analyze Video 3
7. Check memory usage

**Expected**: No memory leaks, all analyses work

**Result**: [ ] Pass [ ] Fail

---

## Debugging Tips

### Button Not Appearing?

**Check**:
1. Open DevTools (F12)
2. Go to Console tab
3. Look for errors with `[Perspective Prism]` prefix
4. Check if selectors are found:
   ```javascript
   console.log(document.querySelector('#top-level-buttons-computed'));
   console.log(document.querySelector('#menu-container'));
   console.log(document.querySelector('#info-contents'));
   ```

**If all selectors return null**:
- YouTube may have changed their DOM structure
- Inspect the action buttons area manually
- Document the new selector
- Report as a bug

---

### Panel Not Displaying?

**Check**:
1. Open DevTools (F12)
2. Go to Console tab
3. Look for errors during panel creation
4. Check if panel element exists:
   ```javascript
   console.log(document.getElementById('pp-analysis-panel'));
   ```
5. Check if Shadow DOM is attached:
   ```javascript
   const panel = document.getElementById('pp-analysis-panel');
   console.log(panel?.shadowRoot);
   ```

---

### Panel Overlapping Video?

**Check**:
1. Open DevTools (F12)
2. Go to Elements tab
3. Inspect panel element
4. Check computed styles:
   - `position: fixed`
   - `right: 20px`
   - `top: 60px`
   - `z-index: 9999`
5. Verify video player dimensions
6. Document overlap issue with screenshot

---

## Performance Monitoring

### Memory Usage

**Steps**:
1. Open DevTools (F12)
2. Go to Memory tab
3. Take heap snapshot before test
4. Perform 10 mode switches
5. Take heap snapshot after test
6. Compare snapshots

**Expected**: < 2 MB increase

**Actual**: _______________

---

### Timing

**Measure**:
1. Button injection time: _____ ms (expected < 500ms)
2. Mode switch time: _____ ms (expected < 200ms)
3. Panel render time: _____ ms (expected < 300ms)
4. Analysis time (cached): _____ ms (expected < 500ms)
5. Analysis time (fresh): _____ s (expected < 10s)

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
- YouTube layout: Theater Mode

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

