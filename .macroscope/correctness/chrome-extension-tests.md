---
include:
  - "chrome-extension/tests/**/*"
---

Vitest + JSDOM for unit tests, Playwright for integration tests. Review for:
- DOM manipulation correctness in JSDOM environment
- Chrome extension API mocking (chrome.storage, chrome.runtime, etc.)
- Integration test coverage for the content script → background → API flow
