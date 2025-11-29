# Quick Mobile Layout Test

## 5-Minute Smoke Test

This is a quick smoke test to verify basic mobile functionality. For comprehensive testing, see `MOBILE_LAYOUT_TEST_GUIDE.md`.

## Setup (30 seconds)

1. Open Chrome DevTools (`F12`)
2. Enable device emulation (`Cmd+Shift+M` or `Ctrl+Shift+M`)
3. Select "iPhone 12 Pro" or similar device
4. Navigate to `https://m.youtube.com/watch?v=dQw4w9WgXcQ`

## Quick Tests (4 minutes)

### ✅ Test 1: Button Appears (30 seconds)
- [ ] "Analyze Claims" button is visible
- [ ] Button is not overlapping other elements
- [ ] Button size looks appropriate for touch

**If fails**: Check console for errors, verify extension is loaded

### ✅ Test 2: Button Works (30 seconds)
- [ ] Tap button
- [ ] Loading state appears (⏳ icon)
- [ ] Panel appears after analysis

**If fails**: Check network tab, verify backend is configured

### ✅ Test 3: Panel Display (1 minute)
- [ ] Panel is fully visible on screen
- [ ] Panel width fits mobile viewport
- [ ] Content is readable
- [ ] Can scroll if multiple claims

**If fails**: Check panel CSS, verify responsive styles

### ✅ Test 4: Interactions (1 minute)
- [ ] Tap to expand/collapse claims
- [ ] Tap close button (×) - panel closes
- [ ] Tap refresh button (🔄) - refreshes analysis

**If fails**: Check touch event handlers

### ✅ Test 5: Navigation (1 minute)
- [ ] Navigate to another video
- [ ] Button re-appears on new video
- [ ] No duplicate buttons

**If fails**: Check cleanup logic, verify navigation detection

## Pass/Fail

**Result**: ⬜ Pass / ⬜ Fail

**Issues Found**: [List any issues]

**Time Taken**: [X minutes]

## If All Tests Pass

✅ Mobile layout basic functionality is working!

**Next Steps**:
1. Run comprehensive tests (see `MOBILE_LAYOUT_TEST_GUIDE.md`)
2. Test on actual mobile device
3. Test different screen sizes
4. Test dark mode
5. Test performance

## If Any Test Fails

❌ Mobile layout has issues that need fixing

**Next Steps**:
1. Document the failure in detail
2. Check browser console for errors
3. Review relevant code (content.js, content.css)
4. Fix the issue
5. Retest

## Common Quick Fixes

### Button Doesn't Appear
```javascript
// Check in console:
document.querySelector('#info-contents') // Should exist on mobile
document.querySelector('[data-pp-analysis-button="true"]') // Should be null if not injected
```

### Panel Too Wide
```css
/* Check if responsive styles are applied */
@media (max-width: 480px) {
  :host { width: 100%; max-width: calc(100vw - 20px); }
}
```

### Touch Not Working
```javascript
// Check if button is clickable
const btn = document.querySelector('[data-pp-analysis-button="true"]');
btn.onclick // Should be a function
```

## Device Emulation Settings

### Recommended Devices to Test
1. **iPhone 12 Pro** (390x844) - Most common iOS
2. **Pixel 5** (412x915) - Most common Android
3. **iPhone SE** (375x667) - Smaller iOS
4. **Galaxy S20** (360x800) - Smaller Android

### Custom Device Settings
- **Width**: 360-414px
- **Height**: 640-915px
- **Device pixel ratio**: 2x or 3x
- **User agent**: Mobile

## Quick Debug Commands

```javascript
// Check if content script loaded
console.log('Content script:', typeof extractVideoId !== 'undefined');

// Check video ID
console.log('Video ID:', extractVideoId());

// Check button
console.log('Button:', document.querySelector('[data-pp-analysis-button="true"]'));

// Check panel
console.log('Panel:', document.getElementById('pp-analysis-panel'));

// Check viewport size
console.log('Viewport:', window.innerWidth, 'x', window.innerHeight);

// Check dark mode
console.log('Dark mode:', document.documentElement.hasAttribute('dark'));
```

## Test Report Template

```
Date: [YYYY-MM-DD]
Tester: [Name]
Device: [Device name or emulation]
Result: PASS / FAIL

Test 1 (Button Appears): PASS / FAIL
Test 2 (Button Works): PASS / FAIL
Test 3 (Panel Display): PASS / FAIL
Test 4 (Interactions): PASS / FAIL
Test 5 (Navigation): PASS / FAIL

Issues:
- [Issue 1]
- [Issue 2]

Notes:
[Any additional observations]
```
