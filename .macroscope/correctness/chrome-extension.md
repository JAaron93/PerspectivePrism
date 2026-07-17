---
include:
  - "chrome-extension/**/*"
---

Manifest V3 Chrome extension — vanilla JavaScript (ES modules), no build
step, no framework. Key context:
- Files are loaded directly by Chrome. Do not suggest adding a bundler
  (webpack, Rollup, esbuild) or transpilation step.
- Shared utilities exist in two variants: a module version (e.g. config.js)
  for import statements, and a script version (e.g. config-script.js) for
  direct manifest injection. This is intentional — do not suggest merging them.
- Content script load order matters: logging-utils-script.js →
  config-script.js → consent.js → claim-navigator.js → content.js
- background.js is a service worker (MV3 requirement). Do not suggest
  patterns that require persistent background pages.
- The extension communicates with the backend at localhost:8000 in dev.
  CORS is handled via CHROME_EXTENSION_IDS in the backend config.
- Do not suggest adding a frontend framework (React, Vue) to the extension.
