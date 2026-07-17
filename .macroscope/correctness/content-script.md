---
include:
  - "chrome-extension/content.js"
---

Main content script injected into YouTube watch pages. Review for:
- DOM mutation observer correctness (YouTube is a SPA — the watch page
  doesn't fully reload on navigation)
- Memory leaks from event listeners or observers not cleaned up on
  page navigation
- Conflicts with YouTube's own DOM structure or event handling
