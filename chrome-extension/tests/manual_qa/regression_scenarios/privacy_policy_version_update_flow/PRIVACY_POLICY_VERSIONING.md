# Privacy Policy Versioning Implementation

## Overview

This document describes the privacy policy versioning system implemented for the Perspective Prism Chrome Extension. The system ensures users are notified when the privacy policy is updated and requires them to re-consent before continuing to use the extension.

## Current Policy Version

**Version: 1.0.0**

This version is defined in:

- `consent.js` - `ConsentManager.POLICY_VERSION`
- `background.js` - `checkPrivacyPolicyVersion()` function
- `privacy.html` - Displayed at the top of the policy

## How It Works

### 1. Version Storage

When a user gives consent, the following data is stored in `chrome.storage.sync`:

```javascript
{
  consent: {
    given: true,
    timestamp: Date.now(),
    policyVersion: "1.0.0"
  }
}
```

### 2. Version Checking

Version checks occur at three key points:

#### A. Extension Startup/Update

- **File**: `background.js`
- **Function**: `checkPrivacyPolicyVersion()`
- **Trigger**: `chrome.runtime.onStartup` and `chrome.runtime.onInstalled` (update reason)
- **Behavior**:
  - Compares stored `policyVersion` with `CURRENT_POLICY_VERSION`
  - If mismatch detected, sets a flag in `chrome.storage.local`:
    ```javascript
    {
      policy_version_mismatch: {
        detected: true,
        storedVersion: "0.9.0",
        currentVersion: "1.0.0",
        timestamp: Date.now()
      }
    }
    ```

#### B. Analysis Button Click

- **File**: `content.js`
- **Function**: `handleAnalysisClick()`
- **Behavior**:
  - Calls `ConsentManager.checkConsent()`
  - If version mismatch detected, shows consent dialog with update message
  - User must accept or decline before analysis proceeds

#### C. Settings Page Load

- **File**: `options.js`
- **Function**: `checkPrivacyPolicyVersion()`
- **Trigger**: `DOMContentLoaded` event
- **Behavior**:
  - Checks for version mismatch
  - Shows consent dialog if mismatch detected
  - Displays success/error message based on user choice

### 3. Consent Dialog

The consent dialog (`consent.js`) has two modes:

#### Initial Consent

- Title: "Privacy & Consent"
- Buttons: "Learn More", "Deny", "Allow and Continue"

#### Policy Update

- Title: "Privacy Policy Updated"
- Message: "Our privacy policy has been updated to version {new_version}"
- Buttons: "View Changes", "Decline", "Accept"

### 4. User Actions

#### Accept Updated Policy

1. User clicks "Accept" button
2. `ConsentManager.saveConsent(true, oldVersion)` is called
   - **Note**: `oldVersion` parameter is **required** in this flow for proper audit logging
   - It should contain the stored policy version that triggered the update dialog
   - Example: `saveConsent(true, "0.9.0")` when updating from v0.9.0 to v1.0.0
3. New consent record is saved with current policy version
4. Version change is logged to audit trail (requires `oldVersion` to create complete log entry)
5. User can continue using the extension

#### Decline Updated Policy

1. User clicks "Decline" button
2. Version change is logged as declined
3. `REVOKE_CONSENT` message is sent to background script
4. All cached data is cleared
5. All pending requests are cancelled
6. Consent is set to `given: false`
7. Analysis features are disabled

### 5. Audit Trail

All policy version changes are logged to `chrome.storage.local`:

```javascript
{
  policy_version_logs: [
    {
      timestamp: 1234567890,
      oldVersion: "0.9.0",
      newVersion: "1.0.0",
      accepted: true,
    },
  ];
}
```

Logs are kept for the last 50 version changes.

## Testing

### Manual Testing

Use the test page: `chrome-extension://[extension-id]/test-policy-version.html`

This page provides buttons to:

1. Check current consent state
2. Simulate version mismatch (set stored version to 0.9.0)
3. Show consent dialog manually
4. Check version on startup
5. View version change logs
6. Reset to current version
7. Clear all data

### Test Scenarios

#### Scenario 1: Fresh Install

1. Install extension
2. Navigate to YouTube video
3. Click "Analyze Claims"
4. Should see initial consent dialog (not update dialog)

#### Scenario 2: Policy Update

1. Have extension installed with consent given
2. Manually set stored version to "0.9.0" (using test page)
3. Restart extension or reload settings page
4. Should see "Privacy Policy Updated" dialog
5. Accept or decline

#### Scenario 3: Decline Update

1. Trigger policy update dialog
2. Click "Decline"
3. Verify:
   - Consent is revoked
   - Cache is cleared
   - Analysis button shows "Consent required" tooltip
   - Settings page shows warning message

#### Scenario 4: Accept Update

1. Trigger policy update dialog
2. Click "Accept"
3. Verify:
   - Consent is updated with new version
   - Analysis works normally
   - Version change is logged

## Updating the Policy Version

When you need to update the privacy policy:

1. **Update the policy document** (`privacy.html`):
   - Update the version number at the top
   - Update the effective date
   - Add/modify policy content

2. **Update the version constant** in these files:
   - `consent.js`: Change `POLICY_VERSION = "1.0.0"` to new version
   - `background.js`: Change `CURRENT_POLICY_VERSION = "1.0.0"` to new version

3. **Test the update flow**:
   - Use the test page to simulate the old version
   - Verify the dialog appears correctly
   - Test both accept and decline paths

4. **Document the changes**:
   - Update this document with the new version number
   - Add release notes explaining what changed in the policy

## Files Modified

- `consent.js` - Added version checking, logging, and dialog handling
- `background.js` - Added startup version checking and message handler
- `options.js` - Added settings page version checking
- `options.html` - Added consent.js script tag
- `privacy.html` - Updated with policy version number and content
- `test-policy-version.html` - Created manual test page

## API Reference

### ConsentManager

#### `checkConsent()`

Returns:

```javascript
{
  hasConsent: boolean,
  reason: "valid" | "missing" | "version_mismatch" | "error",
  currentVersion?: string,
  storedVersion?: string
}
```

#### `saveConsent(given, oldVersion)`

Saves user consent and optionally logs version changes.

**Parameters**:

- `given` (boolean): Whether consent was given
- `oldVersion` (string, optional): Previous policy version
  - **Required** when accepting a policy update to enable audit logging
  - **Optional** for initial consent (first-time users, no version change)
  - When provided: Calls `logVersionChange()` to record version transition
  - When omitted: Saves consent without logging version change

**Usage Examples**:

```javascript
// Policy update flow - oldVersion required for audit trail
saveConsent(true, "0.9.0"); // Logs: 0.9.0 → 1.0.0, accepted: true

// Initial consent flow - oldVersion omitted
saveConsent(true); // No version change logged
```

#### `logVersionChange(oldVersion, newVersion, accepted)`

Logs a policy version change to the audit trail.

#### `showConsentDialog(callback, options)`

- `callback` (function): Called with `true` (accepted) or `false` (declined)
- `options` (object): Contains `reason`, `storedVersion`, `currentVersion`

### Background Script Messages

#### `CHECK_POLICY_VERSION`

Request:

```javascript
{
  type: "CHECK_POLICY_VERSION";
}
```

Response:

```javascript
{
  success: true,
  hasMismatch: boolean,
  storedVersion?: string,
  currentVersion?: string
}
```

#### `REVOKE_CONSENT`

**Purpose**: Revoke user consent and disable extension features

**Sender**: Content script / Foreground (consent.js)

**When Emitted**: When user declines an updated privacy policy

**Payload**:

```javascript
{
  type: "REVOKE_CONSENT";
}
```

**Expected Background Behavior**:

1. Clear all cached analysis data
2. Cancel any pending analysis requests
3. Set consent status to `given: false` in storage
4. Disable analysis features extension-wide
5. Remove any temporary data or session state

## Future Enhancements

1. **Version Change Summary**: Show a summary of what changed in the policy
2. **Notification Badge**: Show a badge on the extension icon when policy update is pending
3. **Grace Period**: Allow users to continue using the extension for a limited time before requiring re-consent
4. **Automatic Backup**: Backup user data before clearing on consent revocation
5. **Version History**: Show full history of policy versions in the privacy page

## Compliance Notes

- Users are always notified of policy changes before they take effect
- Users must explicitly accept updated policies to continue using the extension
- All version changes are logged for audit purposes
- Declining a policy update immediately disables analysis features
- Users can view the full policy at any time via the "Learn More" / "View Changes" link
