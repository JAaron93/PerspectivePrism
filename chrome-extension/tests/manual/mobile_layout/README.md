# Mobile Layout Testing (m.youtube.com)

## Overview

This directory contains manual testing documentation for the Perspective Prism Chrome extension on YouTube's mobile web layout (`m.youtube.com`).

## Test Environment

- **URL Pattern**: `https://m.youtube.com/watch?v=*`
- **Browser**: Chrome (desktop with mobile emulation or actual mobile device)
- **Extension Version**: 1.0.0

## Mobile-Specific Considerations

### 1. DOM Structure Differences
Mobile YouTube (`m.youtube.com`) has a significantly different DOM structure compared to desktop:
- Different container selectors for video controls
- Simplified UI with fewer elements
- Touch-optimized button sizes
- Different navigation patterns

### 2. Button Injection Strategy
The extension uses a fallback selector strategy that should work on mobile:
1. Primary: `#top-level-buttons-computed` (may not exist on mobile)
2. Fallback 1: `#menu-container` (may not exist on mobile)
3. Fallback 2: `#info-contents` (more likely to exist on mobile)

### 3. Responsive Design
The extension includes mobile-specific CSS:
- Button: Reduced padding (0 12px) and min-width (120px) for screens < 768px
- Panel: Full-width with reduced margins for screens < 480px
- Touch targets: Minimum 44x44px for accessibility

### 4. Touch Interactions
Mobile devices use touch instead of mouse:
- Tap instead of click
- No hover states (`:hover` doesn't work the same way)
- Touch targets must be large enough (44x44px minimum)

## Test Scenarios

### Scenario 1: Button Injection on Mobile Layout
**Objective**: Verify the analysis button injects correctly on mobile YouTube

**Steps**:
1. Open Chrome DevTools
2. Enable device emulation (e.g., iPhone 12 Pro, Pixel 5)
3. Navigate to `https://m.youtube.com/watch?v=dQw4w9WgXcQ`
4. Wait for page to load completely
5. Look for the "Analyze Claims" button

**Expected Results**:
- Button appears in the video controls area
- Button is visible and not overlapping other elements
- Button size is appropriate for touch (minimum 44x44px)
- Button text is readable

**Actual Results**: [To be filled during testing]

### Scenario 2: Panel Display on Mobile
**Objective**: Verify the analysis panel displays correctly on mobile viewport

**Steps**:
1. With mobile emulation enabled, click the "Analyze Claims" button
2. Wait for analysis to complete
3. Observe panel layout and positioning

**Expected Results**:
- Panel appears and is fully visible
- Panel width adapts to mobile viewport (full-width or near full-width)
- Panel content is scrollable if needed
- Close button is accessible
- Text is readable at mobile font sizes

**Actual Results**: [To be filled during testing]

### Scenario 3: Touch Interactions
**Objective**: Verify all interactive elements work with touch

**Steps**:
1. Tap the "Analyze Claims" button
2. Tap the close button on the panel
3. Tap to expand/collapse claims
4. Tap the refresh button

**Expected Results**:
- All tap interactions work correctly
- No accidental double-taps or missed taps
- Touch targets are large enough (44x44px minimum)
- Visual feedback on tap (if applicable)

**Actual Results**: [To be filled during testing]

### Scenario 4: Keyboard Navigation on Mobile
**Objective**: Verify keyboard navigation works on mobile devices with external keyboards

**Steps**:
1. Connect external keyboard to mobile device (or use desktop emulation)
2. Navigate to video page
3. Tab to the "Analyze Claims" button
4. Press Enter to activate
5. Use Tab to navigate within panel
6. Press Escape to close panel

**Expected Results**:
- Tab navigation works correctly
- Focus indicators are visible
- Enter/Space activate buttons
- Escape closes panel

**Actual Results**: [To be filled during testing]

### Scenario 5: Mobile Navigation (SPA)
**Objective**: Verify button persists across mobile navigation

**Steps**:
1. On mobile YouTube, watch a video
2. Click "Analyze Claims"
3. Navigate to another video using YouTube's mobile navigation
4. Verify button re-appears

**Expected Results**:
- Button disappears when navigating away
- Button re-appears on new video page
- No duplicate buttons
- Panel closes on navigation

**Actual Results**: [To be filled during testing]

### Scenario 6: Portrait vs Landscape Orientation
**Objective**: Verify extension works in both orientations

**Steps**:
1. Test in portrait mode (default mobile)
2. Rotate device to landscape mode
3. Verify button and panel adapt correctly

**Expected Results**:
- Button remains visible in both orientations
- Panel adapts to available space
- No layout breaks or overlaps

**Actual Results**: [To be filled during testing]

### Scenario 7: Small Screen Devices (< 360px)
**Objective**: Verify extension works on very small screens

**Steps**:
1. Emulate small device (e.g., iPhone SE, Galaxy Fold)
2. Navigate to video page
3. Test button injection and panel display

**Expected Results**:
- Button adapts to small screen (may wrap text or reduce size)
- Panel uses full available width
- Content remains readable
- No horizontal scrolling

**Actual Results**: [To be filled during testing]

## Known Issues

### Issue 1: Mobile Selector Compatibility
**Description**: Mobile YouTube may use different selectors than desktop
**Impact**: Button may not inject if selectors don't match
**Workaround**: Extension uses fallback selectors
**Status**: To be verified during testing

### Issue 2: Touch Target Size
**Description**: Default button size may be too small for comfortable touch
**Impact**: Users may have difficulty tapping button
**Workaround**: CSS includes mobile-specific sizing
**Status**: To be verified during testing

### Issue 3: Panel Positioning
**Description**: Fixed positioning may not work well on mobile
**Impact**: Panel may overlap content or be partially off-screen
**Workaround**: Responsive CSS adjusts panel for mobile
**Status**: To be verified during testing

## Testing Checklist

- [ ] Button injects on mobile layout
- [ ] Button is visible and accessible
- [ ] Button size is appropriate for touch (44x44px minimum)
- [ ] Panel displays correctly on mobile viewport
- [ ] Panel is scrollable if content exceeds viewport
- [ ] Touch interactions work (tap, swipe)
- [ ] Keyboard navigation works (with external keyboard)
- [ ] Button persists across mobile navigation
- [ ] Works in portrait orientation
- [ ] Works in landscape orientation
- [ ] Works on small screens (< 360px)
- [ ] Dark mode works on mobile
- [ ] No layout breaks or overlaps
- [ ] Performance is acceptable on mobile

## Test Results Summary

**Test Date**: [To be filled]
**Tester**: [To be filled]
**Browser**: Chrome [version]
**Device**: [device name or emulation]

### Pass/Fail Summary
- Total Tests: 14
- Passed: [To be filled]
- Failed: [To be filled]
- Blocked: [To be filled]

### Critical Issues
[To be filled during testing]

### Recommendations
[To be filled during testing]

## Next Steps

After completing mobile layout testing:
1. Document any issues found
2. Create bug reports for critical issues
3. Update CSS/JS if needed for mobile compatibility
4. Proceed to test embedded videos layout
5. Test YouTube Shorts layout

## References

- [YouTube Mobile Web](https://m.youtube.com)
- [Touch Target Size Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [Mobile Web Best Practices](https://developers.google.com/web/fundamentals/design-and-ux/principles)
- [Chrome DevTools Device Mode](https://developer.chrome.com/docs/devtools/device-mode/)
