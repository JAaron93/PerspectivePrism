# Desktop Fullscreen Mode Testing

## Overview

This directory contains comprehensive manual testing documentation for the Perspective Prism Chrome extension in YouTube's desktop fullscreen mode.

## What is Fullscreen Mode?

Fullscreen mode is YouTube's immersive viewing experience where:
- Video expands to fill the entire screen
- All page UI elements are hidden
- Browser UI (address bar, tabs) is hidden
- Controls appear as an overlay on mouse movement
- Activated by clicking fullscreen button (⛶) or pressing 'f' key

## Why Test Fullscreen Mode?

Fullscreen mode presents unique challenges for browser extensions:

1. **UI Visibility**: Extension UI may be hidden when controls are hidden
2. **Z-Index Management**: Panel must appear above fullscreen video
3. **State Transitions**: Extension must handle enter/exit gracefully
4. **Keyboard Handling**: Escape key must close panel before exiting fullscreen
5. **User Experience**: Panel must remain accessible despite fullscreen constraints

## Test Documents

### Quick Start
- **TEST_COMPLETION_CARD.md** - 5-minute quick test checklist
- Use this for rapid validation during development

### Comprehensive Testing
- **MANUAL_TESTING_GUIDE.md** - Step-by-step testing procedures
- Includes 12 core tests + 6 edge cases
- Estimated time: 30-45 minutes

### Full Test Suite
- **DESKTOP_FULLSCREEN_MODE_TEST.md** - Complete test documentation
- 23 comprehensive tests across 7 test suites
- Includes performance and accessibility testing
- Estimated time: 2-3 hours

## Quick Test (5 Minutes)

```bash
1. Load extension in Chrome
2. Navigate to: https://www.youtube.com/watch?v=dQw4w9WgXcQ
3. Click "Analyze Video" button
4. Wait for panel to open
5. Press 'f' to enter fullscreen
6. Verify panel remains visible
7. Press Escape to close panel
8. Press Escape to exit fullscreen
9. Verify button reappears
```

**Expected**: All steps work without errors

## Test Checklist

### Must Pass (Critical)
- [ ] Button visible before fullscreen
- [ ] Panel opens before fullscreen
- [ ] Panel persists in fullscreen
- [ ] Panel interactive in fullscreen
- [ ] Extension recovers after exit
- [ ] No JavaScript errors

### Should Pass (High Priority)
- [ ] Keyboard navigation works
- [ ] Rapid toggling handled
- [ ] Dark mode supported
- [ ] Refresh works in fullscreen
- [ ] Navigation handled correctly

### Nice to Have (Medium Priority)
- [ ] Screen reader compatible
- [ ] High contrast mode supported
- [ ] Performance metrics acceptable
- [ ] Multi-monitor support

## Known Behaviors

### Expected Behaviors
- ✅ Button hidden in fullscreen (YouTube hides controls)
- ✅ Panel remains visible if opened before fullscreen
- ✅ First Escape closes panel, second exits fullscreen
- ✅ Panel may overlay video controls (acceptable)

### Potential Issues
- ⚠️ Button may not be accessible in fullscreen
- ⚠️ Panel must be opened before entering fullscreen for best UX
- ⚠️ Some keyboard shortcuts captured by browser
- ⚠️ Behavior may vary by OS

## Test Results

### Current Status
- **Last Tested**: _______________
- **Tester**: _______________
- **Result**: [ ] ✅ PASS [ ] ❌ FAIL [ ] ⏳ IN PROGRESS

### Test History
| Date | Tester | Result | Notes |
|------|--------|--------|-------|
| | | | |

## Debugging Tips

### Panel Not Visible in Fullscreen?

```javascript
// Check panel exists
console.log(document.getElementById('pp-analysis-panel'));

// Check z-index
const panel = document.getElementById('pp-analysis-panel');
console.log(window.getComputedStyle(panel).zIndex); // Should be 9999

// Check position
console.log(window.getComputedStyle(panel).position); // Should be 'fixed'
```

### Button Not Reappearing After Exit?

```javascript
// Check button exists
console.log(document.getElementById('pp-analysis-button'));
console.log(document.querySelector('[data-pp-analysis-button="true"]'));

// Check if cleanup ran
// Look for "[Perspective Prism] Starting cleanup" in console

// Check if MutationObserver is active
// Look for "[Perspective Prism] Observing" in console
```

### Extension Broken After Fullscreen?

1. Check Console for errors
2. Check service worker status (chrome://extensions/)
3. Try reloading extension
4. Document steps to reproduce
5. Report as critical bug

## Related Tests

### Other Layout Tests
- Desktop Standard: `../desktop_standard_layout/`
- Desktop Theater: `../desktop_theater_mode/`
- Mobile Layout: `../mobile_layout/` (if exists)
- Embedded Videos: `../embedded_videos/` (if exists)

### Integration Tests
- See `chrome-extension/tests/integration/` for automated tests

## Reporting Issues

### Issue Template

```markdown
**Title**: [Fullscreen Mode] Brief description

**Severity**: Critical / High / Medium / Low

**Environment**:
- Extension version: _____
- Browser: Chrome _____
- OS: _____
- Screen resolution: _____

**Steps to Reproduce**:
1. _____
2. _____
3. _____

**Expected**: _____
**Actual**: _____

**Console Errors**:
```
[Paste errors]
```

**Screenshots**: [Attach if applicable]
```

## Contributing

When updating these tests:

1. **Maintain Consistency**: Follow existing format and structure
2. **Document Changes**: Update this README with any new tests
3. **Version Control**: Note document version and last updated date
4. **Cross-Reference**: Link related tests and documents
5. **Keep Current**: Update test results and known issues

## Resources

### YouTube Fullscreen API
- [Fullscreen API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)
- [YouTube Player API](https://developers.google.com/youtube/iframe_api_reference)

### Chrome Extension Development
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)

### Accessibility
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)

## Contact

For questions or issues with these tests:
- Create an issue in the project repository
- Tag with `testing` and `fullscreen-mode` labels
- Include relevant test document references

---

**Last Updated**: _______________  
**Document Version**: 1.0  
**Maintained By**: QA Team
