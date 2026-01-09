# Verification Walkthrough

## 1. Automated Verification
Run the unit tests to verify the core logic, particularly cache interactions and configuration validation, remains intact.

### Command
```bash
cd chrome-extension
npm test
```

## 2. Manual Verification Steps

### A. Performance & Latency
1.  **Load Time**: Open a YouTube video.
    -   *Expected*: The "Analyze Claims" button should appear near the top actions bar within 500ms of page load.
    -   *Check*: Verify the button is visible and clean.
2.  **Popup Responsiveness**:
    -   Click the extension icon in the toolbar.
    -   *Expected*: The popup should open *immediately* and display the current status (Idle/Analysing/Complete) without a "loading" flash or 2-second delay.
3.  **Real-time Updates**:
    -   Click "Analyze Claims" on the page.
    -   Open the Popup.
    -   *Expected*: The Popup should reflect "Analyzing..." status instantly.
    -   *Check*: No polling lag should be observable.

### B. Service Worker Persistence
1.  **Simulate SW Sleep**:
    -   Open `chrome://serviceworker-internals`.
    -   Find "Perspective Prism".
    -   Click "Stop".
2.  **State Recovery**:
    -   Return to the YouTube tab where analysis was previously complete (or in progress).
    -   Click "Analyze" again or open the Popup.
    -   *Expected*: The extension should remember the previous state (e.g., "Analysis Complete") or at least recover gracefully without checking the backend unnecessarily if data is cached.
    -   *Note*: With `chrome.storage.session`, state is preserved in memory as long as the browser session is active, even if the SW stops.

### C. Lazy Loading
1.  **Panel Injection**:
    -   Reload the page.
    -   Inspect the DOM (Right-click -> Inspect).
    -   Search for `#pp-analysis-panel`.
    -   *Expected*: The element should **NOT** exist in the DOM.
2.  **On Demand Loading**:
    -   Click "Analyze Claims".
    -   *Expected*: The panel should appear, and `#pp-analysis-panel` should now be present in the DOM.

## 3. Playwright Integration Tests (Optional)
If you have a full browser environment set up:
```bash
npm run test:integration
```
This will verify the full end-to-end flow including popup interaction and content script injection.
