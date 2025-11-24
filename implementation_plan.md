# Implementation Plan - Configuration Management

## Goal Description
Implement `ConfigValidator` and `ConfigManager` classes to handle extension configuration, validation, and persistence. This ensures that the backend URL and other settings are valid and securely stored.

## User Review Required
> [!NOTE]
> I will be creating a shared `config.js` file that will be used by the background script, content script, and popup/options pages. Since we are not using a bundler, this file will define classes in the global scope.

## Proposed Changes

### Configuration Logic
#### [NEW] [chrome-extension/config.js](file:///Users/pretermodernist/PerspectivePrismMVP/chrome-extension/config.js)
- Create `ConfigValidator` class:
    - `validate(config)`: Validates backend URL, cache settings, and developer flags.
    - `isValidUrl(url, allowInsecureUrls)`: Enforces HTTPS (except localhost).
    - `getUrlError(url)`: Returns user-friendly error messages.
- Create `ConfigManager` class:
    - `load()`: Loads config from `chrome.storage.sync` with fallback to `local`.
    - `save(config)`: Saves config to `chrome.storage.sync` with fallback to `local`.
    - `notifyInvalidConfig(errors)`: Notifies user of invalid configuration.
- Define `DEFAULT_CONFIG` constant.

### Manifest Update
#### [MODIFY] [chrome-extension/manifest.json](file:///Users/pretermodernist/PerspectivePrismMVP/chrome-extension/manifest.json)
- Add `config.js` to `content_scripts` js array (before `content.js`).

### Background Script Update
#### [MODIFY] [chrome-extension/background.js](file:///Users/pretermodernist/PerspectivePrismMVP/chrome-extension/background.js)
- Use `importScripts('config.js')` to load the configuration logic.

## Verification Plan

### Automated Tests
- I will create a test HTML page `test-config.html` that loads `config.js` and runs unit tests in the browser console to verify validation logic.

### Manual Verification
1. Load the updated extension.
2. Open the background script console.
3. Verify that `ConfigManager` and `ConfigValidator` are available.
4. Test saving valid and invalid configurations using the console.
5. Verify that `content.js` has access to these classes by checking the console on a YouTube page.