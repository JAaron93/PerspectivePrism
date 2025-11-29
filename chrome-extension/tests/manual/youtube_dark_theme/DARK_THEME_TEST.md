# Dark Theme Manual Testing Guide

## Overview
This document provides a comprehensive manual testing checklist for verifying that the Perspective Prism Chrome Extension works correctly with YouTube's dark theme.

## Prerequisites
- Chrome browser with the extension loaded (unpacked)
- Backend server running (for full analysis testing)
- YouTube account (optional, but recommended for consistent theme settings)

## Test Environment Setup

### Enable YouTube Dark Theme
1. Navigate to YouTube (https://www.youtube.com)
2. Click on your profile icon (top right)
3. Click "Appearance"
4. Select "Dark theme"
5. Verify the page background turns dark (#0f0f0f or similar)

### Verify Dark Mode Detection
The extension detects dark mode by checking:
- `document.documentElement.hasAttribute('dark')` OR
- `document.documentElement.getAttribute('theme') === 'dark'`

You can verify this in the browser console:
```javascript
// Should return true when dark theme is enabled
document.documentElement.hasAttribute('dark') || 
document.documentElement.getAttribute('theme') === 'dark'
```

## Test Cases

### 1. Analysis Button - Dark Theme Styling

**Test Steps:**
1. Navigate to any YouTube video (e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ)
2. Wait for the "Analyze Video" button to appear near the video controls
3. Verify button styling matches dark theme

**Expected Results:**
- ✅ Button background: `#272727` (dark gray)
- ✅ Button text color: `#f1f1f1` (light gray)
- ✅ Button is clearly visible against YouTube's dark background
- ✅ Button hover state: background changes to `#3f3f3f`
- ✅ Button focus outline: `#aecbfa` (light blue)

**Success State (after analysis):**
- ✅ Background: `#0d5224` (dark green)
- ✅ Text color: `#81c995` (light green)

**Error State:**
- ✅ Background: `#8c1816` (dark red)
- ✅ Text color: `#f6aea9` (light red/pink)

### 2. Analysis Panel - Dark Theme Styling

**Test Steps:**
1. Click the "Analyze Video" button
2. Wait for the analysis panel to appear on the right side
3. Verify panel styling matches dark theme

**Expected Results:**

**Panel Container:**
- ✅ Background: `#212121` (dark gray)
- ✅ Text color: `#f1f1f1` (light gray)
- ✅ Border/shadow visible against dark background

**Panel Header:**
- ✅ Background: `#181818` (darker gray)
- ✅ Title text: `#f1f1f1` (light gray)
- ✅ Border bottom: `#3f3f3f` (medium gray)

**Badges:**
- ✅ "Cached" badge: background `#3d2e00`, text `#fdd663` (yellow)
- ✅ "Fresh" badge: background `#0d5224`, text `#81c995` (green)

**Header Buttons (Refresh & Close):**
- ✅ Icon color: `#aaaaaa` (medium gray)
- ✅ Hover background: `#3f3f3f`
- ✅ Focus outline: `#aecbfa` (light blue)

### 3. Claim Cards - Dark Theme Styling

**Test Steps:**
1. With the analysis panel open and results displayed
2. Examine the claim cards styling
3. Interact with claims (hover, expand/collapse)

**Expected Results:**

**Claim Card:**
- ✅ Background: `#181818` (dark gray)
- ✅ Border: `#3f3f3f` (medium gray)
- ✅ Claim text: `#f1f1f1` (light gray)
- ✅ Hover: box-shadow visible, border changes to `#4f4f4f`

**Claim Header:**
- ✅ Hover background: `#272727`
- ✅ Focus outline: `#aecbfa` (light blue)
- ✅ Toggle button color: `#aaaaaa`

**Assessment Badges:**
- ✅ High confidence: background `#0d5224`, text `#81c995` (green)
- ✅ Medium confidence: background `#3d2e00`, text `#fdd663` (yellow)
- ✅ Low confidence: background `#8c1816`, text `#f28b82` (red)

### 4. Perspectives Section - Dark Theme Styling

**Test Steps:**
1. Expand a claim to view perspectives
2. Verify perspective styling

**Expected Results:**

**Section Title:**
- ✅ Color: `#aaaaaa` (medium gray)

**Perspective Rows:**
- ✅ Border bottom: `#3f3f3f`
- ✅ Perspective name: `#aaaaaa`

**Confidence Bars:**
- ✅ Background (empty): `#3f3f3f`
- ✅ Fill color: `#aecbfa` (light blue)
- ✅ Percentage text: `#aaaaaa`

### 5. Bias Indicators - Dark Theme Styling

**Test Steps:**
1. Scroll to the bias indicators section in an expanded claim
2. Verify styling of tags and deception score

**Expected Results:**

**Bias Tags:**
- ✅ Background: `#3f3f3f`
- ✅ Text color: `#aaaaaa`

**Deception Score:**
- ✅ Container background: `#3d2e00` (dark yellow)
- ✅ Label color: `#fdd663` (yellow)
- ✅ Score bar background: `#3f3f3f`
- ✅ Score fill: `#f28b82` (red)
- ✅ Score text: `#f28b82` (red)

### 6. Loading State - Dark Theme Styling

**Test Steps:**
1. Click "Analyze Video" on a new video
2. Observe the loading state styling

**Expected Results:**

**Spinner:**
- ✅ Border color: `#3f3f3f`
- ✅ Border top color: `#aecbfa` (animated)

**Loading Message:**
- ✅ Text color: `#f1f1f1`
- ✅ Submessage color: `#aaaaaa`

**Cancel Button:**
- ✅ Background: `#3f3f3f`
- ✅ Text color: `#f1f1f1`
- ✅ Hover background: `#4f4f4f`
- ✅ Focus outline: `#aecbfa`

### 7. Error State - Dark Theme Styling

**Test Steps:**
1. Trigger an error (e.g., disconnect backend, analyze video without transcript)
2. Verify error state styling

**Expected Results:**

**Error Title:**
- ✅ Color: `#f28b82` (light red)

**Error Message:**
- ✅ Color: `#aaaaaa` (medium gray)

**Retry Button:**
- ✅ Background: `#aecbfa` (light blue)
- ✅ Text color: `#0f0f0f` (dark)
- ✅ Hover background: `#8ab4f8`

**Close Button:**
- ✅ Background: `#3f3f3f`
- ✅ Text color: `#f1f1f1`
- ✅ Hover background: `#4f4f4f`

### 8. Empty State - Dark Theme Styling

**Test Steps:**
1. Analyze a video that returns no claims
2. Verify empty state styling

**Expected Results:**
- ✅ Text color: `#aaaaaa` (medium gray)
- ✅ Message is clearly readable

### 9. Refresh Overlay - Dark Theme Styling

**Test Steps:**
1. Click the refresh button on a cached result
2. Observe the refresh overlay styling

**Expected Results:**
- ✅ Overlay background: `rgba(33, 33, 33, 0.95)` (semi-transparent dark)
- ✅ Previous results visible underneath
- ✅ Loading spinner visible

### 10. Scrollbar - Dark Theme Styling

**Test Steps:**
1. Open a panel with many claims (requires scrolling)
2. Verify scrollbar styling

**Expected Results:**
- ✅ Scrollbar thumb: `#4f4f4f` (medium gray)
- ✅ Scrollbar thumb hover: `#6f6f6f` (lighter gray)
- ✅ Scrollbar track: transparent
- ✅ Scrollbar is visible and usable

### 11. Color Contrast - WCAG AA Compliance

**Test Steps:**
1. Use a color contrast checker tool (e.g., WebAIM Contrast Checker)
2. Verify key text/background combinations meet WCAG AA (4.5:1 minimum)

**Expected Results:**
- ✅ Panel text (`#f1f1f1`) on panel background (`#212121`): ≥ 4.5:1
- ✅ Button text (`#f1f1f1`) on button background (`#272727`): ≥ 4.5:1
- ✅ Claim text (`#f1f1f1`) on card background (`#181818`): ≥ 4.5:1
- ✅ All interactive elements meet contrast requirements

### 12. Theme Switching - Dynamic Updates

**Test Steps:**
1. With the extension active and panel open
2. Switch YouTube theme from dark to light
3. Observe if the extension updates

**Expected Results:**
- ⚠️ **Known Limitation:** Panel may not update dynamically
- ✅ Closing and reopening the panel should apply the correct theme
- ✅ Navigating to a new video should apply the correct theme

**Note:** Dynamic theme switching may require a MutationObserver on the `<html>` element's attributes. This is a potential enhancement.

### 13. Cross-Browser Compatibility (Dark Theme)

**Test Steps:**
1. Test in Chrome (primary target)
2. Test in Brave (Chromium-based)
3. Test in Edge (Chromium-based)

**Expected Results:**
- ✅ Dark theme detection works in all browsers
- ✅ Styling is consistent across browsers
- ✅ No visual glitches or rendering issues

## Common Issues and Troubleshooting

### Issue: Button appears in light mode despite dark theme
**Diagnosis:**
- Check if `html[dark]` attribute is present: `document.documentElement.hasAttribute('dark')`
- Check browser console for CSS loading errors

**Solution:**
- Ensure `content.css` is loaded (check manifest.json)
- Verify YouTube's dark theme is actually enabled
- Try refreshing the page

### Issue: Panel appears in light mode despite dark theme
**Diagnosis:**
- Check if `dark-mode` class is applied to panel: Inspect the panel's host element
- Verify dark mode detection logic in content.js

**Solution:**
- Check console for errors in `createAnalysisPanel()` function
- Verify Shadow DOM is created correctly
- Ensure panel styles include dark mode CSS

### Issue: Colors don't match YouTube's theme exactly
**Diagnosis:**
- YouTube may have updated their color palette
- Extension uses fixed color values

**Solution:**
- Update color values in `content.css` and `panel-styles.js`
- Reference YouTube's current dark theme colors
- Test with updated colors

## Test Completion Checklist

- [ ] All button states tested in dark theme
- [ ] All panel states tested in dark theme
- [ ] All claim card elements tested in dark theme
- [ ] All perspectives and bias indicators tested in dark theme
- [ ] Loading, error, and empty states tested in dark theme
- [ ] Color contrast verified (WCAG AA)
- [ ] Scrollbar styling verified
- [ ] Theme switching behavior documented
- [ ] Cross-browser compatibility verified
- [ ] No visual glitches or rendering issues
- [ ] All interactive elements clearly visible and usable

## Sign-off

**Tester Name:** ___________________________

**Date:** ___________________________

**Result:** ☐ Pass ☐ Fail (with issues documented)

**Notes:**
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________

## Screenshots

Attach screenshots of:
1. Analysis button in dark theme (idle, success, error states)
2. Analysis panel header in dark theme
3. Expanded claim with perspectives in dark theme
4. Bias indicators and deception score in dark theme
5. Loading state in dark theme
6. Error state in dark theme

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-XX  
**Extension Version:** 1.0.0
