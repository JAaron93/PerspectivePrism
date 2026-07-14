# QA Release Checklist

This checklist must be completed and signed off before releasing any new version of the **Perspective Prism** Chrome extension.

## Version Metadata
- **Release Version**: `0.2.0`
- **Target Release Date**: [YYYY-MM-DD]
- **QA Sign-off**: [Name / Signature]

---

## 1. Pre-Release Validation

### Automated Testing
- [ ] **Unit Tests**: All unit tests passing (100% success rate).
  ```bash
  cd chrome-extension && npm run test
  ```
- [ ] **Coverage**: Code coverage meets or exceeds 15% thresholds.
  ```bash
  cd chrome-extension && npm run test:coverage
  ```
- [ ] **Integration Tests**: All Playwright integration tests passing (100% success rate).
  ```bash
  cd chrome-extension && npm run test:integration
  ```
- [ ] **CI Pipeline**: GitHub Actions build is green on the release branch.

### Manual Verification Checkpoints
- [ ] **YouTube Layouts**:
  - [ ] Desktop Standard Layout
  - [ ] Desktop Theater Mode
  - [ ] Desktop Fullscreen Mode
  - [ ] Mobile Layout (`m.youtube.com`)
  - [ ] YouTube Shorts layout (button correctly injected and panel displays claims)
  - [ ] Embedded Videos (`https://*.youtube-nocookie.com/*`)
- [ ] **Theming**:
  - [ ] YouTube Dark Theme (perfect contrast, matching UI elements)
  - [ ] YouTube Light Theme (perfect contrast, matching UI elements)
- [ ] **Cleanups & Navigation**:
  - [ ] SPA Navigation: Navigate video -> video -> homepage -> video. Check that observers are correctly disconnected/reconnected and old panel UIs are clean.
  - [ ] Cache persistence verified across SPA navigation.
  - [ ] Request state survives Service Worker termination.
- [ ] **Consent Flow**:
  - [ ] Initial first-time consent dialog shown on first analysis request.
  - [ ] Revocation of consent clears cache, cancels pending requests, and disables the analysis button.
  - [ ] Consent updates and policy version modifications trigger the re-consent dialog.

### Code & Logging Audit
- [ ] **Zero `console.log`**: No active `console.log` statements are left in the production JS code. (Only approved `console.error` / `console.warn` via sanitized log utilities are allowed).
- [ ] **PII Leakage Check**: Verify that no video titles, user IDs, auth tokens, or search queries are sent to logs.
- [ ] **Version Synchronization**: The version number in `manifest.json` matches the version in `package.json` (`0.2.0`).

---

## 2. Build Validation

- [ ] **Build Command**: The production build script runs without errors.
  ```bash
  cd chrome-extension && npm run build
  ```
- [ ] **Unpacked Load**: Load the generated `dist/` directory as an unpacked extension in Chrome developer mode and verify:
  - [ ] The extension starts without errors or warnings in the extensions list page (`chrome://extensions`).
  - [ ] The action popup opens and displays correct cache statistics.
  - [ ] The options page loads and URL settings can be updated and saved.
- [ ] **Minification & Cleanliness**:
  - [ ] Verify that CSS is minified in `dist/content.css`, `dist/popup.css`, `dist/options.css`, and `dist/welcome.css`.
  - [ ] Verify that JS files in `dist/` are minified by `terser` and do not contain development-only helper codes or raw comments.
- [ ] **Package Size**: Verify that `perspective-prism-extension.zip` is successfully generated and its size is under **5MB** (target: < 1MB).

---

## 3. Chrome Web Store Submission Validation

- [ ] **Store Description**: Review the store listing description (`docs/web-store-listing.md`) for spelling and completeness.
- [ ] **Permission Justification**: Ensure the permission declarations (`storage`, `activeTab`, `alarms`, `notifications`) have documented, solid justifications matching Chrome Web Store policies.
- [ ] **Store Privacy Policy**: Ensure the external privacy policy matches the code’s actual behavior (e.g. data transmission of Video ID only).
- [ ] **Visual Assets**: Confirm all required icons (`16px`, `48px`, `128px`) are correct and store screenshots are updated.

---

## 4. Acceptance Criteria & Performance Gates

| Metric | Target | Actual | Status (Pass/Fail) |
|--------|--------|--------|---------------------|
| **Memory Footprint** | < 10 MB | | |
| **Page Load Impact** | < 100 ms | | |
| **A11y (WCAG AA)** | 100% Keyboard nav, ARIA labels, contrast | | |
| **Error Handling** | Actionable message shown on failure | | |
