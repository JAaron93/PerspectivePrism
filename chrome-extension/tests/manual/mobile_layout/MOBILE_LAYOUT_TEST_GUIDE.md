# Mobile Layout Testing Guide

## Quick Start

This guide provides step-by-step instructions for testing the Perspective Prism extension on YouTube's mobile web layout.

## Prerequisites

### Option 1: Desktop Browser with Mobile Emulation (Recommended for initial testing)
1. Chrome browser (latest version)
2. Extension loaded in developer mode
3. Chrome DevTools knowledge

### Option 2: Actual Mobile Device
1. Android device with Chrome browser
2. Extension installed (requires Chrome for Android to support extensions)
3. Note: iOS Safari does not support Chrome extensions

## Setup Instructions

### Desktop with Mobile Emulation

1. **Open Chrome DevTools**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)

2. **Enable Device Emulation**
   - Click the device toolbar icon (or press `Cmd+Shift+M` / `Ctrl+Shift+M`)
   - Select a mobile device from the dropdown (e.g., "iPhone 12 Pro", "Pixel 5")
   - Or create a custom device with specific dimensions

3. **Configure Emulation Settings**
   - **Dimensions**: Try multiple sizes
     - Small: 360x640 (iPhone SE)
     - Medium: 390x844 (iPhone 12 Pro)
     - Large: 412x915 (Pixel 5)
   - **Device pixel ratio**: 2x or 3x
   - **User agent**: Mobile (should be automatic)

4. **Navigate to Mobile YouTube**
   - Go to `https://m.youtube.com`
   - Or directly to a video: `https://m.youtube.com/watch?v=dQw4w9WgXcQ`

### Actual Mobile Device

1. **Install Chrome for Android**
   - Download from Google Play Store

2. **Enable Developer Mode**
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times to enable developer options

3. **Enable USB Debugging**
   - Go to Settings > Developer Options
   - Enable "USB Debugging"

4. **Connect to Desktop**
   - Connect device via USB
   - Open Chrome on desktop
   - Navigate to `chrome://inspect`
   - Select your device

5. **Load Extension**
   - Note: Chrome for Android has limited extension support
   - May need to use desktop Chrome with remote debugging

## Test Execution

### Test 1: Button Injection

**Objective**: Verify the "Analyze Claims" button appears on mobile layout

**Steps**:
1. Navigate to `https://m.youtube.com/watch?v=dQw4w9WgXcQ`
2. Wait for page to fully load (video player visible)
3. Scroll to video controls area
4. Look for "Analyze Claims" button

**What to Check**:
- [ ] Button is visible
- [ ] Button is not overlapping other elements
- [ ] Button text is readable
- [ ] Button icon (🔍) is visible
- [ ] Button size appears appropriate for touch

**Screenshot**: Take screenshot of button location

**Notes**:
- If button doesn't appear, check browser console for errors
- Try refreshing the page
- Verify extension is enabled

**Expected Selector**: Button should inject into one of:
- `#top-level-buttons-computed`
- `#menu-container`
- `#info-contents`

**Debugging**:
```javascript
// Run in console to check which selector exists
console.log('top-level-buttons:', document.querySelector('#top-level-buttons-computed'));
console.log('menu-container:', document.querySelector('#menu-container'));
console.log('info-contents:', document.querySelector('#info-contents'));
```

### Test 2: Button Touch Interaction

**Objective**: Verify button responds correctly to touch

**Steps**:
1. Tap the "Analyze Claims" button
2. Observe button state change
3. Observe panel appearance

**What to Check**:
- [ ] Button responds to tap (no delay)
- [ ] Button shows loading state (⏳ icon, "Analyzing..." text)
- [ ] Button is disabled during analysis
- [ ] No accidental double-tap triggers

**Touch Target Size**:
- Measure button dimensions (should be at least 44x44px)
- Use DevTools to inspect computed styles

**Debugging**:
```javascript
// Check button dimensions
const btn = document.querySelector('[data-pp-analysis-button="true"]');
if (btn) {
  const rect = btn.getBoundingClientRect();
  console.log('Button size:', rect.width, 'x', rect.height);
}
```

### Test 3: Panel Display

**Objective**: Verify analysis panel displays correctly on mobile

**Steps**:
1. Trigger analysis (tap button)
2. Wait for loading state
3. Wait for results to appear
4. Observe panel layout

**What to Check**:
- [ ] Panel appears on screen
- [ ] Panel is fully visible (not cut off)
- [ ] Panel width is appropriate for mobile (full-width or near full-width)
- [ ] Panel height doesn't exceed viewport
- [ ] Panel content is scrollable
- [ ] Close button (×) is visible and accessible
- [ ] Refresh button (🔄) is visible and accessible

**Panel Positioning**:
- Desktop: Fixed position, right side
- Mobile: Should adapt to full-width or centered

**Debugging**:
```javascript
// Check panel dimensions and position
const panel = document.getElementById('pp-analysis-panel');
if (panel) {
  const rect = panel.getBoundingClientRect();
  console.log('Panel position:', rect.top, rect.left);
  console.log('Panel size:', rect.width, 'x', rect.height);
  console.log('Viewport size:', window.innerWidth, 'x', window.innerHeight);
}
```

### Test 4: Panel Content Readability

**Objective**: Verify panel content is readable on mobile

**Steps**:
1. Open panel with analysis results
2. Read claim text
3. Check perspective labels
4. Check confidence bars
5. Check bias indicators

**What to Check**:
- [ ] Claim text is readable (font size appropriate)
- [ ] Perspective labels are not truncated
- [ ] Confidence bars are visible
- [ ] Confidence percentages are readable
- [ ] Bias tags are readable
- [ ] Deception score is visible
- [ ] No text overflow or wrapping issues

**Font Sizes** (from CSS):
- Desktop: 14px (claim text), 13px (perspectives)
- Mobile (< 480px): 13px (claim text), 12px (perspectives)

### Test 5: Panel Scrolling

**Objective**: Verify panel scrolls correctly when content exceeds viewport

**Steps**:
1. Open panel with multiple claims (3+ claims)
2. Try to scroll within panel
3. Verify scrolling is smooth

**What to Check**:
- [ ] Panel content scrolls independently
- [ ] Page doesn't scroll when scrolling panel
- [ ] Scroll indicator is visible (if applicable)
- [ ] Scrolling is smooth (no lag)
- [ ] Header stays fixed at top (if designed that way)

**Debugging**:
```javascript
// Check if panel is scrollable
const content = document.querySelector('#pp-analysis-panel').shadowRoot.querySelector('.content');
if (content) {
  console.log('Content height:', content.scrollHeight);
  console.log('Visible height:', content.clientHeight);
  console.log('Is scrollable:', content.scrollHeight > content.clientHeight);
}
```

### Test 6: Expand/Collapse Claims

**Objective**: Verify claim expand/collapse works on mobile

**Steps**:
1. Open panel with results
2. Tap on a claim header to collapse
3. Tap again to expand
4. Repeat for multiple claims

**What to Check**:
- [ ] Tap on claim header toggles expand/collapse
- [ ] Toggle button (▼/▶) changes correctly
- [ ] Animation is smooth
- [ ] aria-expanded attribute updates
- [ ] No layout shifts or jumps

### Test 7: Close Panel

**Objective**: Verify panel can be closed on mobile

**Steps**:
1. Open panel
2. Tap close button (×)
3. Verify panel closes

**What to Check**:
- [ ] Close button is tappable (44x44px minimum)
- [ ] Panel closes immediately
- [ ] Panel is removed from DOM
- [ ] Focus returns to button (if applicable)

### Test 8: Refresh Analysis

**Objective**: Verify refresh button works on mobile

**Steps**:
1. Open panel with cached results
2. Tap refresh button (🔄)
3. Wait for refresh to complete

**What to Check**:
- [ ] Refresh button is tappable
- [ ] Refresh overlay appears
- [ ] Loading spinner is visible
- [ ] Fresh results replace cached results
- [ ] Badge changes from "Cached" to "Fresh"

### Test 9: Mobile Navigation

**Objective**: Verify button persists across mobile navigation

**Steps**:
1. On video page, verify button is present
2. Tap on another video in recommendations
3. Wait for new video to load
4. Verify button re-appears

**What to Check**:
- [ ] Button disappears when navigating away
- [ ] Button re-appears on new video page
- [ ] No duplicate buttons
- [ ] Panel closes on navigation
- [ ] Video ID updates correctly

**Debugging**:
```javascript
// Check current video ID
const videoId = new URLSearchParams(window.location.search).get('v');
console.log('Current video ID:', videoId);
```

### Test 10: Orientation Change

**Objective**: Verify extension works in both portrait and landscape

**Steps**:
1. Start in portrait mode
2. Open panel
3. Rotate device to landscape
4. Verify panel adapts
5. Rotate back to portrait

**What to Check**:
- [ ] Panel remains visible in landscape
- [ ] Panel width adapts to landscape viewport
- [ ] No layout breaks
- [ ] Content remains readable
- [ ] Button remains accessible

**Viewport Sizes**:
- Portrait: 390x844 (iPhone 12 Pro)
- Landscape: 844x390

### Test 11: Small Screen (< 360px)

**Objective**: Verify extension works on very small screens

**Steps**:
1. Set viewport to 320x568 (iPhone SE)
2. Navigate to video page
3. Test button and panel

**What to Check**:
- [ ] Button is visible (may be smaller)
- [ ] Button text is readable
- [ ] Panel uses full available width
- [ ] Content is readable
- [ ] No horizontal scrolling
- [ ] Touch targets are still adequate

**CSS Breakpoints**:
- < 480px: Mobile styles
- < 360px: Extra small styles (if defined)

### Test 12: Dark Mode

**Objective**: Verify dark mode works on mobile

**Steps**:
1. Enable dark mode on YouTube
   - Tap profile icon
   - Tap "Settings"
   - Tap "Appearance"
   - Select "Dark theme"
2. Navigate to video page
3. Test button and panel

**What to Check**:
- [ ] Button uses dark mode colors
- [ ] Panel uses dark mode colors
- [ ] Text is readable in dark mode
- [ ] Contrast is sufficient
- [ ] No white flashes or color mismatches

**Dark Mode Detection**:
```javascript
// Check if dark mode is active
const isDark = document.documentElement.hasAttribute('dark') || 
               document.documentElement.getAttribute('theme') === 'dark';
console.log('Dark mode:', isDark);
```

### Test 13: Performance

**Objective**: Verify extension performs well on mobile

**Steps**:
1. Open Chrome DevTools Performance tab
2. Start recording
3. Navigate to video page
4. Trigger analysis
5. Stop recording
6. Analyze performance

**What to Check**:
- [ ] Page load time not significantly impacted
- [ ] Button injection is fast (< 500ms)
- [ ] Panel rendering is smooth (60fps)
- [ ] No memory leaks
- [ ] No excessive CPU usage

**Performance Metrics**:
- Button injection: < 500ms
- Panel render: < 100ms
- Memory usage: < 10MB

### Test 14: Error Handling

**Objective**: Verify error states work on mobile

**Steps**:
1. Disconnect from internet
2. Tap "Analyze Claims" button
3. Observe error state

**What to Check**:
- [ ] Error panel displays correctly
- [ ] Error message is readable
- [ ] Retry button is accessible
- [ ] Close button works
- [ ] Button returns to idle state after close

## Common Issues and Solutions

### Issue: Button Doesn't Appear

**Possible Causes**:
1. Selectors don't match mobile DOM
2. Extension not loaded
3. Content script not injected

**Solutions**:
1. Check browser console for errors
2. Verify extension is enabled
3. Check manifest.json matches pattern
4. Inspect DOM to find correct selectors

**Debugging**:
```javascript
// Check if content script loaded
console.log('Content script loaded:', typeof extractVideoId !== 'undefined');

// Check if button exists
console.log('Button exists:', document.querySelector('[data-pp-analysis-button="true"]'));

// Check available containers
['#top-level-buttons-computed', '#menu-container', '#info-contents'].forEach(sel => {
  console.log(sel, ':', document.querySelector(sel));
});
```

### Issue: Button Too Small

**Possible Causes**:
1. CSS not loading
2. Responsive styles not applying
3. YouTube CSS overriding

**Solutions**:
1. Check computed styles in DevTools
2. Verify media queries are working
3. Increase specificity of CSS rules

**Debugging**:
```javascript
// Check button computed styles
const btn = document.querySelector('[data-pp-analysis-button="true"]');
if (btn) {
  const styles = window.getComputedStyle(btn);
  console.log('Width:', styles.width);
  console.log('Height:', styles.height);
  console.log('Padding:', styles.padding);
}
```

### Issue: Panel Off-Screen

**Possible Causes**:
1. Fixed positioning not working on mobile
2. Panel width exceeds viewport
3. Z-index issues

**Solutions**:
1. Use responsive positioning
2. Set max-width to viewport width
3. Adjust z-index

**Debugging**:
```javascript
// Check panel position
const panel = document.getElementById('pp-analysis-panel');
if (panel) {
  const rect = panel.getBoundingClientRect();
  console.log('Panel left:', rect.left);
  console.log('Panel right:', rect.right);
  console.log('Viewport width:', window.innerWidth);
  console.log('Is off-screen:', rect.right > window.innerWidth || rect.left < 0);
}
```

### Issue: Touch Not Working

**Possible Causes**:
1. Touch events not registered
2. Element not clickable (z-index)
3. Pointer-events disabled

**Solutions**:
1. Add touch event listeners
2. Adjust z-index
3. Check pointer-events CSS

**Debugging**:
```javascript
// Test touch events
const btn = document.querySelector('[data-pp-analysis-button="true"]');
if (btn) {
  btn.addEventListener('touchstart', () => console.log('Touch start'));
  btn.addEventListener('touchend', () => console.log('Touch end'));
  btn.addEventListener('click', () => console.log('Click'));
}
```

## Test Report Template

```markdown
# Mobile Layout Test Report

**Date**: [YYYY-MM-DD]
**Tester**: [Name]
**Browser**: Chrome [version]
**Device**: [Device name or emulation settings]
**Extension Version**: 1.0.0

## Test Results

### Test 1: Button Injection
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]
- **Screenshot**: [Link or attachment]

### Test 2: Button Touch Interaction
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

### Test 3: Panel Display
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]
- **Screenshot**: [Link or attachment]

### Test 4: Panel Content Readability
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

### Test 5: Panel Scrolling
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

### Test 6: Expand/Collapse Claims
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

### Test 7: Close Panel
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

### Test 8: Refresh Analysis
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

### Test 9: Mobile Navigation
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

### Test 10: Orientation Change
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

### Test 11: Small Screen (< 360px)
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

### Test 12: Dark Mode
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]
- **Screenshot**: [Link or attachment]

### Test 13: Performance
- **Status**: ✅ Pass / ❌ Fail
- **Metrics**: [Load time, memory usage, etc.]

### Test 14: Error Handling
- **Status**: ✅ Pass / ❌ Fail
- **Notes**: [Any observations]

## Summary

**Total Tests**: 14
**Passed**: [X]
**Failed**: [X]
**Pass Rate**: [X%]

## Critical Issues

[List any critical issues that block mobile usage]

## Recommendations

[List any improvements or fixes needed]

## Conclusion

[Overall assessment of mobile compatibility]
```

## Next Steps

After completing mobile layout testing:

1. **Document Results**
   - Fill out test report
   - Take screenshots of key states
   - Note any issues or bugs

2. **File Issues**
   - Create GitHub issues for bugs
   - Prioritize critical issues
   - Assign to appropriate team members

3. **Update Code**
   - Fix any mobile-specific bugs
   - Improve responsive styles if needed
   - Update selectors if mobile DOM differs

4. **Retest**
   - Verify fixes work
   - Run regression tests
   - Test on multiple devices

5. **Update Documentation**
   - Update README with mobile support status
   - Document any mobile-specific limitations
   - Update user guide with mobile instructions

6. **Proceed to Next Layout**
   - Test embedded videos (youtube-nocookie.com)
   - Test YouTube Shorts
   - Complete remaining manual testing checklist
