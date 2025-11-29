# Manual Testing Guide for Perspective Prism Chrome Extension

## Overview
This guide provides instructions for manually testing the Perspective Prism Chrome extension across different YouTube layouts and scenarios.

## Prerequisites

### 1. Extension Setup
```bash
# Navigate to chrome-extension directory
cd chrome-extension

# Install dependencies (for test utilities)
npm install

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the chrome-extension directory
```

### 2. Backend Setup
```bash
# Start the backend server
cd backend
source venv/bin/activate
uvicorn app.main:app --reload

# Backend should be running on http://localhost:8000
```

### 3. Extension Configuration
1. Click the extension icon in Chrome toolbar
2. Click "Open Settings"
3. Set Backend URL to `http://localhost:8000`
4. Click "Test Connection" to verify
5. Click "Save Settings"

---

## Testing Checklist

### YouTube Layout Variants

#### ✅ Desktop Standard Layout (COMPLETED)
**Test URL**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`

**Key Test Points**:
- [ ] Button injects in `#top-level-buttons-computed`
- [ ] Button styling matches YouTube UI
- [ ] Analysis panel appears on right side
- [ ] Panel is scrollable
- [ ] Keyboard navigation works (Tab, Escape)
- [ ] Cache functionality works
- [ ] SPA navigation re-injects button

**Status**: ✅ PASS (100% - All tests passing)
**Results**: See `manual-test-results.md`

---

#### ⬜ Desktop Theater Mode
**Test URL**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (click Theater Mode button)

**Key Test Points**:
- [ ] Button remains visible in theater mode
- [ ] Button position adapts to theater layout
- [ ] Panel doesn't overlap video player
- [ ] Panel z-index correct
- [ ] Switching between modes works smoothly

**Expected Behavior**:
- Button should remain in controls area
- Panel should appear on right side (not over video)
- No layout breaks when toggling theater mode

---

#### ⬜ Desktop Fullscreen Mode
**Test URL**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (press F or click Fullscreen)

**Key Test Points**:
- [ ] Button behavior in fullscreen
- [ ] Panel accessibility in fullscreen
- [ ] Exit fullscreen doesn't break extension
- [ ] Controls overlay interaction

**Expected Behavior**:
- Button may be hidden in fullscreen (YouTube hides controls)
- Panel should be accessible if opened before fullscreen
- Extension should recover gracefully when exiting fullscreen

---

#### ⬜ Mobile Layout (m.youtube.com)
**Test URL**: `https://m.youtube.com/watch?v=dQw4w9WgXcQ`

**Key Test Points**:
- [ ] Button injects on mobile layout
- [ ] Button position appropriate for mobile
- [ ] Panel adapts to mobile viewport
- [ ] Touch interactions work
- [ ] Responsive design functions

**Expected Behavior**:
- Button should inject in mobile controls
- Panel should be full-width or overlay on mobile
- Touch targets should be 44x44px minimum

---

#### ⬜ Embedded Videos (youtube-nocookie.com)
**Test URL**: Create test page with embedded video
```html
<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>
```

**Key Test Points**:
- [ ] Extension detects embedded videos
- [ ] Button injects in embed player
- [ ] Panel displays correctly in embed context
- [ ] Cross-origin restrictions handled

**Expected Behavior**:
- Extension should work in embeds if permissions allow
- May have limitations due to iframe restrictions

---

#### ⬜ YouTube Shorts
**Test URL**: `https://www.youtube.com/shorts/[SHORT_ID]`

**Key Test Points**:
- [ ] Video ID extraction from Shorts URL
- [ ] Button injection in Shorts layout
- [ ] Panel positioning for vertical video
- [ ] Swipe navigation compatibility

**Expected Behavior**:
- Video ID should extract from `/shorts/` path
- Button should appear in Shorts controls
- Panel should not interfere with swipe gestures

---

#### ⬜ YouTube Dark Theme
**Test URL**: Any YouTube video with dark theme enabled

**Key Test Points**:
- [ ] Button styling matches dark theme
- [ ] Panel uses dark theme colors
- [ ] Text contrast meets WCAG AA
- [ ] Icons visible in dark mode

**Expected Behavior**:
- Extension should detect and adapt to dark theme
- All text should be readable (contrast ratio ≥ 4.5:1)
- Panel background should match YouTube's dark theme

---

#### ⬜ YouTube Light Theme
**Test URL**: Any YouTube video with light theme enabled

**Key Test Points**:
- [ ] Button styling matches light theme
- [ ] Panel uses light theme colors
- [ ] Text contrast meets WCAG AA
- [ ] Icons visible in light mode

**Expected Behavior**:
- Extension should work with default light theme
- All text should be readable
- Panel background should match YouTube's light theme

---

## Browser Compatibility Testing

### ⬜ Chrome (Latest)
- Version: _______
- Test Date: _______
- Status: _______

### ⬜ Chrome (Previous Version)
- Version: _______
- Test Date: _______
- Status: _______

### ⬜ Edge (Chromium-based)
- Version: _______
- Test Date: _______
- Status: _______

### ⬜ Brave
- Version: _______
- Test Date: _______
- Status: _______

---

## Regression Testing Scenarios

### ⬜ Button Injection After SPA Navigation
**Steps**:
1. Load video A
2. Verify button appears
3. Click on video B (SPA navigation)
4. Verify button re-appears
5. Repeat 5 times

**Expected**: Button always appears, no duplicates

---

### ⬜ Panel State Persistence During Navigation
**Steps**:
1. Open analysis panel
2. Navigate to new video
3. Verify panel closes
4. Verify no memory leaks

**Expected**: Panel closes cleanly, no orphaned elements

---

### ⬜ Service Worker Recovery After Termination
**Steps**:
1. Start analysis
2. Terminate service worker (chrome://serviceworker-internals/)
3. Wait for analysis to complete
4. Verify results appear

**Expected**: Analysis resumes after worker restart

---

### ⬜ Cache Persistence Across Browser Restarts
**Steps**:
1. Analyze video
2. Close browser completely
3. Reopen browser
4. Navigate to same video
5. Verify cached results load

**Expected**: Cache persists, results load instantly

---

### ⬜ Consent Persistence Across Devices (Sync)
**Steps**:
1. Grant consent on Device A
2. Sign in to Chrome on Device B
3. Wait for sync
4. Verify consent synced

**Expected**: Consent preference syncs via chrome.storage.sync

---

### ⬜ Privacy Policy Version Update Flow
**Steps**:
1. Set policy version to 1.0.0
2. Update policy version to 1.1.0
3. Trigger analysis
4. Verify re-consent dialog appears

**Expected**: User prompted to accept new policy version

---

### ⬜ Long-Running Analysis (>15s) with Cancel
**Steps**:
1. Trigger analysis on long video
2. Wait 15 seconds
3. Click "Cancel" button
4. Verify analysis stops

**Expected**: Analysis aborts, panel closes

---

### ⬜ Multiple Videos Analyzed in Sequence
**Steps**:
1. Analyze video A
2. Navigate to video B
3. Analyze video B
4. Navigate to video C
5. Analyze video C
6. Check cache stats

**Expected**: All analyses complete, cache grows correctly

---

### ⬜ Rapid Navigation Between Videos
**Steps**:
1. Navigate to video A
2. Immediately navigate to video B
3. Immediately navigate to video C
4. Verify no errors

**Expected**: Extension handles rapid navigation gracefully

---

### ⬜ Analysis with Backend Offline
**Steps**:
1. Stop backend server
2. Trigger analysis
3. Verify error message
4. Start backend
5. Click retry

**Expected**: Clear error, retry works after backend starts

---

## Accessibility Testing

### ⬜ Keyboard Navigation
**Test with keyboard only (no mouse)**:
- [ ] Tab through all interactive elements
- [ ] Arrow keys navigate claims (if implemented)
- [ ] Escape closes panel
- [ ] Enter/Space activates buttons
- [ ] Focus visible on all elements

---

### ⬜ Screen Reader Testing (NVDA/JAWS)
**Test with screen reader**:
- [ ] Button announces correctly
- [ ] Panel announces when opened
- [ ] Claims announce with proper structure
- [ ] State changes announced
- [ ] Error messages announced

---

### ⬜ Focus Management
**Test focus behavior**:
- [ ] Focus moves to panel on open
- [ ] Focus trapped within panel
- [ ] Focus returns to button on close
- [ ] No focus lost during interactions

---

### ⬜ Color Contrast (WCAG AA)
**Test with contrast checker**:
- [ ] Button text: ≥ 4.5:1
- [ ] Panel text: ≥ 4.5:1
- [ ] Error messages: ≥ 4.5:1
- [ ] Links: ≥ 4.5:1

---

### ⬜ Touch Targets
**Test on touch device or with touch emulation**:
- [ ] Button: ≥ 44x44px
- [ ] Close button: ≥ 44x44px
- [ ] Expand buttons: ≥ 44x44px
- [ ] All interactive elements: ≥ 44x44px

---

## Performance Testing

### ⬜ Extension Memory Usage
**Monitor in chrome://extensions/ → Details → Inspect views**:
- [ ] Idle: < 10MB
- [ ] With panel open: < 15MB
- [ ] After 10 navigations: < 20MB

---

### ⬜ Page Load Impact
**Measure with Chrome DevTools Performance tab**:
- [ ] Content script injection: < 100ms
- [ ] Button injection: < 50ms
- [ ] Total page load impact: < 100ms

---

### ⬜ Analysis Response Time
**Measure with console timestamps**:
- [ ] Cached analysis: < 500ms
- [ ] Fresh analysis: 5-15s (varies by video)
- [ ] Cache hit rate: > 80% (after initial analyses)

---

### ⬜ Cache Size Monitoring
**Check chrome.storage.local usage**:
- [ ] 10 videos: < 5MB
- [ ] 50 videos: < 25MB
- [ ] 100 videos: < 50MB
- [ ] Eviction works when quota exceeded

---

## Test Reporting

### Test Session Template
```markdown
## Test Session: [Layout/Feature Name]
**Date**: YYYY-MM-DD
**Tester**: [Name]
**Browser**: [Browser Name] [Version]
**Extension Version**: [Version]

### Test Results
- Total Tests: X
- Passed: X
- Failed: X
- Blocked: X

### Issues Found
1. [Issue description]
   - Severity: Critical/High/Medium/Low
   - Steps to reproduce: ...
   - Expected: ...
   - Actual: ...

### Screenshots
[Attach screenshots if applicable]

### Notes
[Any additional observations]
```

---

## Issue Severity Levels

### Critical
- Extension crashes
- Data loss
- Security vulnerability
- Complete feature failure

### High
- Major functionality broken
- Workaround difficult
- Affects many users

### Medium
- Feature partially broken
- Workaround available
- Affects some users

### Low
- Minor visual issue
- Easy workaround
- Affects few users

---

## Tips for Effective Manual Testing

1. **Clear Extension Data Between Tests**
   - Go to chrome://extensions/
   - Click "Remove" on extension
   - Reload extension
   - This ensures clean state

2. **Use Incognito Mode for Consent Testing**
   - Incognito doesn't sync storage
   - Good for testing first-time experience

3. **Monitor Console for Errors**
   - Keep DevTools open
   - Check both page console and extension console
   - Look for warnings and errors

4. **Test with Real Videos**
   - Use variety of video lengths
   - Test with different content types
   - Some videos may not have transcripts

5. **Document Everything**
   - Take screenshots of issues
   - Record video for complex bugs
   - Note exact steps to reproduce

6. **Test Edge Cases**
   - Very long videos (>2 hours)
   - Videos without transcripts
   - Private/unlisted videos
   - Age-restricted videos

---

## Automated Test Integration

While this guide focuses on manual testing, complement with automated tests:

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Generate coverage report
npm run test:coverage
```

---

## Sign-off Checklist

Before marking a layout as "tested and approved":

- [ ] All test points passed
- [ ] No critical or high severity issues
- [ ] Performance within acceptable limits
- [ ] Accessibility requirements met
- [ ] Test results documented
- [ ] Screenshots captured
- [ ] Issues filed (if any)

---

## Contact

For questions about manual testing:
- Review design.md for expected behavior
- Review requirements.md for acceptance criteria
- Check existing test results in manual-test-results.md
