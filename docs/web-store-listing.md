# Chrome Web Store Listing Draft

This document contains the metadata, descriptions, and privacy policy drafts required for submitting the Perspective Prism extension to the Chrome Web Store.

---

## 1. Store Metadata

- **Extension Name**: Perspective Prism - YouTube Analyzer
- **Short Description**: Analyze YouTube videos for claims and perspectives directly in your browser.
- **Version**: `0.2.0`
- **Category**: Productivity / Developer Tools
- **Support URL**: `https://github.com/JAaron93/PerspectivePrism`

---

## 2. Store Description (Detailed)

### Overview
Uncover the layers of content in any YouTube video with **Perspective Prism**. This extension integrates a non-intrusive side panel directly on the YouTube watch page, allowing you to analyze video transcripts for claims, stance consistency, logical fallacies, and potential deception in real-time.

### Key Features
- **Instant Claim Extraction**: Automatically identifies the primary factual claims made in the video, complete with video timestamps.
- **Multi-Perspective Stance Analysis**: Compares extracted claims against four distinct categories of evidence:
  - Scientific consensus.
  - Journalistic consensus.
  - Partisan Left commentary.
  - Partisan Right commentary.
- **Deception & Bias Indicators**: Flags logical fallacies, emotional manipulation tactics, and provides an overall deception score.
- **Privacy-First & Lightweight**: Operates strictly on local browser storage, caches analysis results for 24 hours, and has a negligible footprint (<10MB memory usage).
- **Fully Accessible**: Implements comprehensive keyboard navigation (WCAG AA), screen-reader live announcements, and focus trapping.

### How to Use
1. Install the extension.
2. Configure your Perspective Prism FastAPI backend URL in the Options page (HTTPS required for external hosts).
3. Open any YouTube video.
4. Click the **Analyze Video** button injected next to the subscribe/like actions.
5. Explore the truth profiles and perspectives in the side panel!

---

## 3. Store Privacy Policy

**Effective Date**: July 14, 2026

At Perspective Prism, we believe your browsing data should remain your own. This Privacy Policy details what information we handle and how it is protected.

### 1. Information Collection and Transmission
- **Video ID Only**: The extension only collects and transmits the 11-character YouTube Video ID (e.g. `dQw4w9WgXcQ`) when you explicitly request an analysis.
- **No Personal Data**: We do not collect, store, or transmit your search history, personal information, IP address, browsing behavior, Google credentials, or video watch history.
- **No Third-Party Analytics**: The extension contains no tracking scripts, cookies, or third-party analytics integrations.

### 2. Information Storage and Security
- **Local Caching**: All retrieved analysis results are stored locally inside your browser's persistent `chrome.storage.local` database and expire after 24 hours.
- **Local Settings**: Extension settings (such as backend URL and consent preferences) are synced across your own Chrome browsers via `chrome.storage.sync`.
- **HTTPS Enforcement**: All communications between the extension and your configured analysis backend are encrypted using HTTPS (except for local testing on `127.0.0.1` / `localhost`).

### 3. User Control & Data Deletion
- **Revocation**: You can revoke your analysis consent at any time through the Extension Options page. Revoking consent instantly terminates any pending requests, deletes all cached video analyses, and clears background alarm states.
- **Cache Erasure**: You can manually clear all cached analyses at any time via the extension action popup or options menu.

---

## 4. Required Permission Justifications

Chrome Web Store requires strict justifications for permissions requested in `manifest.json`:

1. **`storage`**
   - *Justification*: Required to persist extension configurations (sync) and cache video analysis results locally (local) to avoid redundant API requests.
2. **`alarms`**
   - *Justification*: Required to persist retry scheduling across Background Service Worker unloads. If a network request is interrupted by service worker termination, the alarm wakes up the service worker to resume the job.
3. **`notifications`**
   - *Justification*: Required to display error or status alerts to the user when the backend is unreachable or when settings require manual configuration.
