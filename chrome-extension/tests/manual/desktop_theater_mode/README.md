# Manual Testing Guide

This directory contains manual test procedures for the Perspective Prism Chrome Extension.

## Available Tests

### 1. Theater Mode Test (`theater-mode-test.md`)
Tests the extension's functionality when YouTube is in theater mode.

**When to run:**
- Before each release
- After changes to button injection logic
- After changes to panel positioning
- When YouTube updates its UI

**How to run:**
1. Load the extension in Chrome (Developer Mode)
2. Open `theater-mode-test.md`
3. Follow each test step sequentially
4. Document results in the test file
5. Report any issues found

**Time estimate:** 15-20 minutes

## General Testing Tips

### Loading the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` directory
5. Verify the extension appears in the list

### Checking Console Logs
1. Open Chrome DevTools (F12)
2. Go to the Console tab
3. Look for messages prefixed with `[Perspective Prism]`
4. Check for errors or warnings

### Inspecting the DOM
1. Open Chrome DevTools (F12)
2. Go to the Elements tab
3. Use the element picker (Ctrl+Shift+C / Cmd+Shift+C)
4. Click on the analysis button or panel
5. Examine the HTML structure and styles

### Testing with Different Videos
Use a variety of video types:
- Regular videos (10+ minutes)
- Short videos (<1 minute)
- YouTube Shorts
- Live streams
- Videos with/without transcripts
- Videos in different languages

### Clearing Extension Data
If you need to reset the extension state:
1. Right-click the extension icon
2. Select "Manage extension"
3. Scroll to "Site data and permissions"
4. Click "Remove" for YouTube
5. Or use: `chrome.storage.local.clear()` in console

### Simulating Slow Network
To test loading states and timeouts:
1. Open Chrome DevTools (F12)
2. Go to the Network tab
3. Select "Slow 3G" or "Fast 3G" from the throttling dropdown
4. Trigger an analysis

## Reporting Issues

When you find an issue during manual testing:

1. **Document the issue:**
   - What you were doing (steps to reproduce)
   - What you expected to happen
   - What actually happened
   - Screenshots or screen recordings if applicable

2. **Check console logs:**
   - Copy any error messages
   - Note any warnings
   - Include the full stack trace if available

3. **Note the environment:**
   - Browser version
   - Extension version
   - Operating system
   - YouTube layout/mode
   - Video URL (if relevant)

4. **Assess severity:**
   - **Critical:** Extension doesn't work at all
   - **High:** Major feature broken
   - **Medium:** Feature works but has issues
   - **Low:** Minor cosmetic or edge case issue

5. **Create an issue:**
   - Use the issue template (if available)
   - Include all information from above
   - Tag appropriately (bug, ui, accessibility, etc.)

## Test Coverage Checklist

Before marking manual testing as complete, ensure you've tested:

- [ ] Desktop standard layout
- [ ] Desktop theater mode
- [ ] Desktop fullscreen mode
- [ ] Mobile layout (m.youtube.com)
- [ ] Embedded videos
- [ ] YouTube Shorts
- [ ] Dark theme
- [ ] Light theme
- [ ] Multiple browsers (Chrome, Edge, Brave)
- [ ] Keyboard navigation
- [ ] Screen reader compatibility
- [ ] Different video types
- [ ] Error scenarios
- [ ] Network issues
- [ ] Cache behavior
- [ ] Settings persistence

## Automation Opportunities

Some manual tests could potentially be automated:

- **Good candidates for automation:**
  - Button injection verification
  - Panel rendering
  - Message passing
  - Cache operations
  - Settings persistence

- **Should remain manual:**
  - Visual appearance
  - Accessibility (screen reader testing)
  - User experience flow
  - Cross-browser compatibility
  - YouTube UI changes

## Questions?

If you have questions about manual testing:
1. Check the main README.md
2. Review the design document (`.kiro/specs/youtube-chrome-extension/design.md`)
3. Check existing test files for examples
4. Ask the development team

## Contributing

When adding new manual tests:
1. Create a new `.md` file in this directory
2. Follow the format of existing test files
3. Include clear steps and expected results
4. Add the test to this README
5. Update the main tasks.md checklist
