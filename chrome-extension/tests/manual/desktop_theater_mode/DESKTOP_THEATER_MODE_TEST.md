# Desktop Theater Mode - Visual Test Documentation

## Layout Overview

This document provides visual documentation of the Perspective Prism extension on YouTube's desktop theater mode layout.

---

## Test Environment

**YouTube URL**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`  
**Layout Type**: Desktop Theater Mode  
**Screen Resolution**: 1920x1080  
**Browser**: Chrome (latest)  
**Theme**: Light (default)

---

## What is Theater Mode?

Theater mode is activated by clicking the "Theater mode" button (rectangle icon) in YouTube's video player controls. In theater mode:
- The video player expands horizontally to fill more screen width
- The page layout remains visible (unlike fullscreen)
- The video description and comments move below the player
- The DOM structure may change, affecting button injection points

**Activation**: Click the theater mode button (□) in the player controls, or press 't' key

---

## Visual Test Points

### 1. Button Injection Location in Theater Mode

```
┌─────────────────────────────────────────────────────────────────┐
│  YouTube Header (Logo, Search, User)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                             │ │
│  │                                                             │ │
│  │                                                             │ │
│  │              Video Player (Expanded Width)                  │ │
│  │                                                             │ │
│  │                                                             │ │
│  │                                                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Video Title: "Rick Astley - Never Gonna Give You Up"          │
│  123,456 views • Jan 1, 2024                                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [👍 Like] [👎 Dislike] [💬 Comment] [🔗 Share] [⋯ More] │  │
│  │  [🔍 Analyze Video] ← EXTENSION BUTTON INJECTED HERE     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Channel Info                                                    │
│  Description...                                                  │
│  Comments...                                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Expected Injection Point**: `#top-level-buttons-computed` (same as standard layout)  
**Fallback Selectors**: `#menu-container`, `#info-contents`  
**Position**: After YouTube's native action buttons  
**Styling**: Matches YouTube's button design

---

### 2. Button Visibility After Mode Switch

#### Scenario A: Standard → Theater Mode
```
1. Load video in standard mode
   [🔍 Analyze Video] ← Button present

2. Click theater mode button (□)
   Video expands...
   [🔍 Analyze Video] ← Button should remain visible

3. Verify button position
   ✓ Button still in action bar
   ✓ No duplicate buttons
   ✓ Button remains clickable
```

#### Scenario B: Theater → Standard Mode
```
1. Load video in theater mode
   [🔍 Analyze Video] ← Button present

2. Click theater mode button (□) again
   Video contracts...
   [🔍 Analyze Video] ← Button should remain visible

3. Verify button position
   ✓ Button still in action bar
   ✓ No duplicate buttons
   ✓ Button remains clickable
```

---

### 3. Analysis Panel Layout in Theater Mode

```
┌─────────────────────────────────────────────────────────────────┐
│  YouTube Video Page (Theater Mode)                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                             │ │
│  │                                                             │ │
│  │         Video Player (Expanded - Theater Mode)              │ │
│  │                                                             │ │
│  │                                                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [🔍 Analyze Video]                                             │
│                                                                  │
│  Video Description...                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                              ┌──────────────────┐
                                              │ Perspective      │×
                                              │ Prism Analysis   │
                                              ├──────────────────┤
                                              │                  │
                                              │ Video: dQw4w9... │
                                              │ Analyzed: 2m ago │
                                              │                  │
                                              │ [🔄 Refresh]     │
                                              │                  │
                                              ├──────────────────┤
                                              │ Claims Found: 3  │
                                              ├──────────────────┤
                                              │                  │
                                              │ ▼ Claim 1        │
                                              │   "The video..." │
                                              │                  │
                                              │   Scientific: ✓  │
                                              │   Confidence: 85%│
                                              │                  │
                                              │ ▶ Claim 2        │
                                              │                  │
                                              │ ▶ Claim 3        │
                                              │                  │
                                              └──────────────────┘
```

**Panel Specifications**:
- Position: Fixed right side (same as standard mode)
- Width: 400px
- Max Height: 80vh
- Z-index: 9999
- Top offset: 60px (below YouTube header)
- Right offset: 20px
- Overflow: Scroll (vertical)
- Shadow DOM: Yes (style isolation)

**Critical Check**: Panel should NOT overlap the expanded video player

---

### 4. Panel Positioning Verification

#### Test: Panel Does Not Obscure Video

```
Theater Mode Layout:
┌─────────────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                             │ │
│  │         Video Player (Expanded)                             │ │
│  │         Should be fully visible                             │ │
│  │                                                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [Action Buttons]                          [Panel positioned    │
│                                             to the right,       │
│  Description...                             not overlapping     │
│                                             video]              │
└─────────────────────────────────────────────────────────────────┘
```

**Verification Steps**:
1. Open video in theater mode
2. Trigger analysis to show panel
3. Verify panel is positioned to the right of the video
4. Verify panel does not overlap video content
5. Verify panel is scrollable if content exceeds viewport

**Expected Result**: ✅ Panel visible, video fully visible, no overlap

---

### 5. Mode Switching with Panel Open

#### Test Sequence:

**Step 1: Open Panel in Standard Mode**
```
Standard Layout:
┌──────────────────────────────────────┐
│  [Video Player]                      │
│                                      │
│  [🔍 Analyze Video]                  │
│                                      │
│  Description...                      │
└──────────────────────────────────────┘
                    [Panel Open →]
```

**Step 2: Switch to Theater Mode**
```
Theater Layout:
┌─────────────────────────────────────────────────┐
│  [Video Player - Expanded]                      │
│                                                 │
│  [🔍 Analyze Video]                             │
│                                                 │
│  Description...                                 │
└─────────────────────────────────────────────────┘
                              [Panel Repositions →]
```

**Expected Behavior**:
- ✅ Panel remains visible during transition
- ✅ Panel content remains intact
- ✅ Panel position adjusts smoothly
- ✅ No visual glitches or flickering
- ✅ Panel remains functional (scrolling, buttons work)

**Step 3: Switch Back to Standard Mode**
```
Standard Layout:
┌──────────────────────────────────────┐
│  [Video Player]                      │
│                                      │
│  [🔍 Analyze Video]                  │
│                                      │
│  Description...                      │
└──────────────────────────────────────┘
                    [Panel Repositions →]
```

**Expected Behavior**:
- ✅ Panel remains visible during transition
- ✅ Panel content remains intact
- ✅ Panel position adjusts smoothly
- ✅ No visual glitches or flickering

---

### 6. Responsive Behavior in Theater Mode

#### Window Width: 1920px (Full Desktop)
```
┌─────────────────────────────────────────────────────────────────┐
│  [Video Player - Theater Mode Full Width]      [Panel 400px]    │
│                                                                  │
│  Plenty of space for both video and panel                       │
└─────────────────────────────────────────────────────────────────┘
```
**Status**: ✅ Optimal layout

#### Window Width: 1280px (Smaller Desktop)
```
┌──────────────────────────────────────────────────────────┐
│  [Video Player - Theater]           [Panel 400px]        │
│                                                          │
│  Video may be slightly narrower but still visible       │
└──────────────────────────────────────────────────────────┘
```
**Status**: ✅ Acceptable layout

#### Window Width: 1024px (Tablet Landscape)
```
┌────────────────────────────────────────────┐
│  [Video Player]        [Panel 400px]       │
│                                            │
│  Panel may partially overlap video         │
└────────────────────────────────────────────┘
```
**Status**: ⚠️ Panel may overlap video (acceptable for desktop, user can close panel)

**Note**: Theater mode is primarily a desktop feature. On smaller screens, panel overlay is acceptable as users can close the panel to view the video.

---

### 7. DOM Selector Investigation

#### Selectors to Verify in Theater Mode:

**Primary Selector**: `#top-level-buttons-computed`
```javascript
const container = document.querySelector('#top-level-buttons-computed');
console.log('Primary selector found:', container !== null);
```

**Fallback 1**: `#menu-container`
```javascript
const container = document.querySelector('#menu-container');
console.log('Fallback 1 found:', container !== null);
```

**Fallback 2**: `#info-contents`
```javascript
const container = document.querySelector('#info-contents');
console.log('Fallback 2 found:', container !== null);
```

#### Expected Results:
- ✅ At least one selector should match
- ✅ Button should inject successfully
- ✅ Button should be visible in the UI

#### If Injection Fails:

**Investigation Steps**:
1. Open Chrome DevTools (F12)
2. Go to Elements tab
3. Inspect the action buttons area
4. Look for the container element
5. Note the actual selector used by YouTube
6. Document findings below:

```
Actual selector found: _______________________
Parent element: _______________________
Sibling elements: _______________________
Recommended new selector: _______________________
```

---

### 8. Navigation Testing in Theater Mode

#### Test: SPA Navigation

**Scenario**: Navigate between videos while in theater mode

```
Step 1: Open Video A in theater mode
   [🔍 Analyze Video] ← Button present

Step 2: Click on recommended Video B
   YouTube navigates (SPA)
   Theater mode persists
   [🔍 Analyze Video] ← Button should re-inject

Step 3: Verify button state
   ✓ Old button removed
   ✓ New button injected
   ✓ No duplicate buttons
   ✓ Button functional
```

**Expected Behavior**:
- ✅ Button is removed from Video A
- ✅ Button is re-injected for Video B
- ✅ Theater mode state persists
- ✅ No duplicate buttons
- ✅ Previous analysis panel is closed

---

### 9. Dark Mode + Theater Mode

#### Visual Test: Dark Theme in Theater Mode

```
┌─────────────────────────────────────────────────────────────────┐
│  YouTube Header (Dark)                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                             │ │
│  │         Video Player (Theater Mode)                         │ │
│  │         (Dark background)                                   │ │
│  │                                                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [🔍 Analyze Video] ← Should use dark theme styling            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                              ┌──────────────────┐
                                              │ Perspective      │×
                                              │ Prism Analysis   │
                                              │ (Dark Theme)     │
                                              ├──────────────────┤
                                              │                  │
                                              │ Claims...        │
                                              │                  │
                                              └──────────────────┘
```

**Verification**:
- ✅ Button matches YouTube's dark theme
- ✅ Panel uses dark mode styles
- ✅ Text is readable (sufficient contrast)
- ✅ All UI elements visible
- ✅ No color contrast issues

**Color Contrast Requirements** (WCAG AA):
- Normal text: 4.5:1 minimum
- Large text: 3:1 minimum
- UI components: 3:1 minimum

---

### 10. Performance in Theater Mode

#### Timing Measurements:

**Button Injection**:
```
Page load → Button injection: _____ ms
Expected: < 500ms
Status: [ ] Pass [ ] Fail
```

**Mode Switch**:
```
Click theater button → Button visible: _____ ms
Expected: < 200ms
Status: [ ] Pass [ ] Fail
```

**Panel Rendering**:
```
Click analyze → Panel visible: _____ ms
Expected: < 300ms (cached), < 10s (fresh)
Status: [ ] Pass [ ] Fail
```

#### Memory Usage:

```
Extension idle (theater mode): _____ MB
Panel open (theater mode): _____ MB
After 5 mode switches: _____ MB
Expected: < 10 MB
Status: [ ] Pass [ ] Fail
```

---

### 11. Accessibility in Theater Mode

#### Keyboard Navigation:

**Test Sequence**:
```
1. Tab to Analyze button
   ✓ Button receives focus
   ✓ Focus indicator visible

2. Press Enter/Space
   ✓ Panel opens
   ✓ Focus moves to close button

3. Press Tab
   ✓ Focus cycles through panel elements
   ✓ Focus stays within panel

4. Press Escape
   ✓ Panel closes
   ✓ Focus returns to Analyze button
```

**Expected Result**: ✅ All keyboard shortcuts work in theater mode

#### Screen Reader Testing:

**Announcements**:
```
On button focus:
> "Analyze video for claims and perspectives, button"

On panel open:
> "Dialog opened. Perspective Prism Analysis. 3 claims found."

On mode switch:
> (No announcement - mode switch is visual only)
```

**Expected Result**: ✅ Screen reader announces correctly

---

### 12. Edge Cases

#### Edge Case 1: Rapid Mode Switching
```
Test: Click theater button rapidly (5 times in 2 seconds)
Expected: 
- ✅ Button remains visible
- ✅ No duplicate buttons
- ✅ No JavaScript errors
- ✅ Extension remains functional

Actual Result: [ ] Pass [ ] Fail
Notes: _______________________
```

#### Edge Case 2: Panel Open During Mode Switch
```
Test: Open panel, then switch modes while panel is visible
Expected:
- ✅ Panel remains open
- ✅ Panel repositions correctly
- ✅ Panel content intact
- ✅ Panel remains functional

Actual Result: [ ] Pass [ ] Fail
Notes: _______________________
```

#### Edge Case 3: Analysis in Progress During Mode Switch
```
Test: Start analysis, switch to theater mode while loading
Expected:
- ✅ Loading state persists
- ✅ Analysis completes successfully
- ✅ Results display correctly
- ✅ No errors in console

Actual Result: [ ] Pass [ ] Fail
Notes: _______________________
```

---

## Test Completion Checklist

### Button Injection
- [ ] Button injects in theater mode
- [ ] Button uses correct selector
- [ ] Button styling matches YouTube
- [ ] Button visible after mode switch (standard → theater)
- [ ] Button visible after mode switch (theater → standard)
- [ ] No duplicate buttons after mode switches

### Panel Display
- [ ] Panel displays correctly in theater mode
- [ ] Panel positioned correctly (right side)
- [ ] Panel does not overlap video
- [ ] Panel scrollable when needed
- [ ] Panel remains visible during mode switches
- [ ] Panel content intact after mode switches

### Functionality
- [ ] Analysis works in theater mode
- [ ] Cache hit/miss behavior correct
- [ ] Refresh button works
- [ ] Close button works
- [ ] Claim expansion works
- [ ] Error handling works

### Navigation
- [ ] SPA navigation handled correctly
- [ ] Button re-injects on video change
- [ ] Previous panel closes on navigation
- [ ] Theater mode state persists across navigation

### Responsive Behavior
- [ ] Layout acceptable at 1920px width
- [ ] Layout acceptable at 1280px width
- [ ] Layout acceptable at 1024px width
- [ ] Panel overlay acceptable on smaller screens

### Accessibility
- [ ] Keyboard navigation works
- [ ] Tab cycling works
- [ ] Escape key closes panel
- [ ] Focus management correct
- [ ] Screen reader announcements correct
- [ ] ARIA attributes present

### Performance
- [ ] Button injection < 500ms
- [ ] Mode switch < 200ms
- [ ] Panel render < 300ms (cached)
- [ ] Memory usage < 10 MB
- [ ] No memory leaks

### Dark Mode
- [ ] Button matches dark theme
- [ ] Panel uses dark theme
- [ ] Text readable (contrast)
- [ ] All elements visible

### Edge Cases
- [ ] Rapid mode switching handled
- [ ] Panel open during mode switch handled
- [ ] Analysis in progress during mode switch handled

---

## Known Issues

### Issue 1: [Title]
**Description**: 
_______________________

**Severity**: [ ] Critical [ ] High [ ] Medium [ ] Low

**Steps to Reproduce**:
1. _______________________
2. _______________________
3. _______________________

**Expected**: _______________________
**Actual**: _______________________

**Workaround**: _______________________

**Status**: [ ] Open [ ] In Progress [ ] Fixed

---

### Issue 2: [Title]
**Description**: 
_______________________

**Severity**: [ ] Critical [ ] High [ ] Medium [ ] Low

**Steps to Reproduce**:
1. _______________________
2. _______________________
3. _______________________

**Expected**: _______________________
**Actual**: _______________________

**Workaround**: _______________________

**Status**: [ ] Open [ ] In Progress [ ] Fixed

---

## Recommendations

Based on testing, the following recommendations are made:

### Selector Strategy
- [ ] Current selectors work in theater mode
- [ ] Additional selectors needed: _______________________
- [ ] Selector priority should be adjusted: _______________________

### Panel Positioning
- [ ] Current positioning works well
- [ ] Adjust top offset: _______________________
- [ ] Adjust right offset: _______________________
- [ ] Add responsive breakpoints: _______________________

### User Experience
- [ ] Add theater mode detection
- [ ] Adjust panel size for theater mode
- [ ] Add animation for mode transitions
- [ ] Other: _______________________

---

## Test Summary

**Date**: _______________________  
**Tester**: _______________________  
**Extension Version**: _______________________  
**Browser Version**: _______________________  
**YouTube Version**: _______________________

**Tests Passed**: _____ / _____  
**Tests Failed**: _____ / _____  
**Tests Skipped**: _____ / _____

**Overall Result**:
- [ ] ✅ ALL TESTS PASSED - Ready for production
- [ ] ⚠️ MINOR ISSUES - Acceptable for release with notes
- [ ] ❌ MAJOR ISSUES - Requires fixes before release
- [ ] 🚫 CRITICAL ISSUES - Blocks release

**Approval**:
- [ ] Approved for release
- [ ] Approved with conditions: _______________________
- [ ] Not approved - requires fixes

**Reviewer Signature**: _______________________

---

## Conclusion

[Summary of test results and overall assessment of theater mode compatibility]

_______________________
_______________________
_______________________

**Next Steps**:
1. _______________________
2. _______________________
3. _______________________

