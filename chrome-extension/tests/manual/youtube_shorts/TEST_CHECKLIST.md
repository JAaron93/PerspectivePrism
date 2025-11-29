# YouTube Shorts Testing Checklist

## Quick Reference

This is a condensed checklist for testing YouTube Shorts support. See README.md for detailed test procedures.

## Pre-Test Setup

- [ ] Extension loaded in Chrome developer mode
- [ ] Backend server running and configured
- [ ] Test Shorts URLs identified
- [ ] Browser console open for debugging

## Core Functionality Tests

### Desktop Shorts (`https://www.youtube.com/shorts/[ID]`)

- [ ] **Video ID Extraction**
  - [ ] Video ID extracted from `/shorts/` path
  - [ ] Correct 11-character ID logged in console
  - [ ] Extraction strategy logged as "shorts path"

- [ ] **Button Injection**
  - [ ] Button appears in Shorts interface
  - [ ] Button visible and properly positioned
  - [ ] Button doesn't overlap video content
  - [ ] Selector used: ________________

- [ ] **Button States**
  - [ ] Idle state displays correctly
  - [ ] Loading state shows spinner
  - [ ] Success state after analysis
  - [ ] Error state on failure

- [ ] **Analysis Panel**
  - [ ] Panel appears on right side
  - [ ] Panel doesn't overlap vertical video
  - [ ] Panel is scrollable
  - [ ] Panel has proper z-index
  - [ ] Close button works

- [ ] **Navigation**
  - [ ] Up arrow navigates to previous Short
  - [ ] Down arrow navigates to next Short
  - [ ] Panel closes/updates on navigation
  - [ ] Button re-appears for new Short
  - [ ] Video ID updates correctly

- [ ] **Keyboard Shortcuts**
  - [ ] Tab navigates panel elements
  - [ ] Escape closes panel
  - [ ] Arrow keys still navigate Shorts
  - [ ] Focus returns to button on close

- [ ] **Caching**
  - [ ] First analysis shows loading
  - [ ] Second analysis shows cached results (<500ms)
  - [ ] Cache indicator displays timestamp
  - [ ] Refresh button bypasses cache

### Mobile Shorts (`https://m.youtube.com/shorts/[ID]`)

- [ ] **Video ID Extraction**
  - [ ] Video ID extracted from mobile URL
  - [ ] Correct extraction logged

- [ ] **Button Injection**
  - [ ] Button appears on mobile layout
  - [ ] Button accessible via touch
  - [ ] Button sized appropriately for touch (44x44px min)

- [ ] **Touch Interaction**
  - [ ] Tap triggers analysis
  - [ ] Swipe up/down navigates Shorts
  - [ ] No interference with native gestures

- [ ] **Panel Display**
  - [ ] Panel displays on mobile viewport
  - [ ] Panel doesn't block video
  - [ ] Panel scrollable on mobile

## Error Handling

- [ ] **Backend Offline**
  - [ ] Error message displays
  - [ ] Can retry analysis
  - [ ] Extension remains functional

- [ ] **No Transcript**
  - [ ] Appropriate error message
  - [ ] User informed why analysis failed

- [ ] **Invalid Config**
  - [ ] Settings prompt shown
  - [ ] User guided to configuration

## Edge Cases

- [ ] **Rapid Navigation**
  - [ ] Fast swiping between Shorts
  - [ ] No race conditions
  - [ ] Cleanup handlers run correctly

- [ ] **Auto-play**
  - [ ] Extension doesn't interfere with auto-play
  - [ ] Videos play normally

- [ ] **Consent Flow**
  - [ ] Consent dialog appears on first analysis
  - [ ] Consent persists across Shorts
  - [ ] Denial blocks analysis

## Performance

- [ ] **Load Time**
  - [ ] Content script loads quickly
  - [ ] No noticeable delay in Shorts loading

- [ ] **Memory Usage**
  - [ ] Extension memory <10MB
  - [ ] No memory leaks during navigation

- [ ] **Responsiveness**
  - [ ] Button responds immediately to clicks
  - [ ] Panel opens/closes smoothly
  - [ ] No lag during Shorts navigation

## Browser Compatibility

- [ ] Chrome (latest)
- [ ] Chrome (previous version)
- [ ] Edge (Chromium)
- [ ] Brave

## Test Results

**Date**: _______________  
**Tester**: _______________  
**Extension Version**: 1.0.0  
**Backend Version**: _______________

**Overall Status**: ⬜ Pass / ⬜ Fail / ⬜ Partial

**Issues Found**:
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

**Notes**:
_______________________________________________
_______________________________________________
_______________________________________________

## Sign-off

- [ ] All critical tests passed
- [ ] Issues documented
- [ ] Ready for production

**Approved by**: _______________  
**Date**: _______________
