# Chrome Web Store Listing & Manifest V3 Permissions Justification

This document provides the Chrome Web Store metadata, detailed product description, privacy disclosures, and explicit permission justifications for the **Perspective Prism** Chrome Extension (`v0.2.0`), in compliance with Manifest V3 policies and Chrome Web Store Developer Guidelines.

---

## 1. Store Metadata

- **Extension Name**: Perspective Prism - YouTube Content & Bias Analyzer
- **Short Description**: Analyze YouTube video transcripts for claims, bias, and deception side-by-side using Chrome's native Side Panel.
- **Version**: `0.2.0`
- **Category**: Productivity / Developer Tools
- **Default Language**: English
- **Support & Repository URL**: `https://github.com/JAaron93/PerspectivePrism`
- **License**: MIT License

---

## 2. Store Description (Detailed)

### Overview
Uncover multi-perspective insights and factual claims in any YouTube video with **Perspective Prism**. Built on Manifest V3 standards, Perspective Prism integrates directly into YouTube watch pages to extract factual claims from video transcripts and compare them against four distinct evidence perspectives in real time.

### Key Features
- **Native Chrome Side Panel Integration (`chrome.sidePanel`)**: All claim timelines, perspective stance chips, and deception scores display in Chrome's native side panel without cluttering or overlaying the YouTube player DOM.
- **Optimistic UI & Zero-Latency Feedback**: Instant animated CSS shimmer loader cards render immediately upon analysis initiation (<50ms).
- **Progressive Stream Rendering**: Claims and stance indicators (Scientific Consensus, Journalistic Consensus, Partisan Left, Partisan Right) populate progressively as each perspective completes.
- **Content-Hashed Local Storage Cache (`chrome.storage.local`)**: Analysis results are content-hashed and cached locally for 7 days with automatic 10MB LRU storage pruning, enabling instant (<20ms) sub-millisecond loads on re-analyzed videos without redundant API calls.
- **YouTube SPA Navigation Sync**: Detects single-page application (`yt-navigate-finish`) video switches to reset state, check local cache, and sync claim timeline seamlessly.
- **Accessibility & Keyboard Navigation**: Full WCAG AA compliance with keyboard navigation, screen reader live announcements, and tap target optimization.

### How to Use
1. Install the Perspective Prism extension.
2. Open any YouTube video.
3. Click the **Analyze Video** button injected near the YouTube player controls or activate the extension side panel.
4. Explore extracted claims, timestamps, multi-perspective evidence, and deception ratings in real time.

---

## 3. Privacy Policy & Security Compliance

### Privacy Principles
- **Local-First Data Architecture**: Analysis cache data and preferences remain strictly inside your local browser storage (`chrome.storage.local` and `chrome.storage.sync`).
- **No Personal Data Collection**: Perspective Prism does NOT track personal identity, browsing history outside YouTube, Google account credentials, or user watch lists.
- **No Third-Party Analytics**: The extension contains zero tracking scripts, cookies, or telemetry libraries.
- **Explicit User Control**: Users can clear local cached analyses or revoke backend integration at any time through the extension Options menu.

### Security Compliance (NFR-4 / MV3 Policy)
- **Strict Content Security Policy (CSP)**: `script-src 'self'; object-src 'self'`.
- **No Remote Code Execution**: Disallows `eval()`, `new Function()`, or dynamic external script loading. All scripts, HTML templates, and stylesheets are bundled locally.
- **Encrypted Transmission**: Transmits video URLs strictly over HTTPS to the configured backend API endpoint.

---

## 4. Manifest V3 Permission Justifications

The Chrome Web Store requires detailed justifications for each permission declared in `manifest.json`:

| Permission | Purpose & Technical Justification |
| :--- | :--- |
| **`storage`** | **Required for Local Caching & Preference Persistence.** Used to store content-hashed analysis results (`cache_${videoId}_${contentHash}`) in `chrome.storage.local` to enable instant cache-hit loads and eliminate redundant LLM API backend calls. Enforces 7-day TTL and 10MB LRU storage bounds. Also persists user options in `chrome.storage.sync`. |
| **`sidePanel`** | **Required for Exclusive UI Surface (`chrome.sidePanel`).** Hosts `sidepanel.html` as the primary user interface. Renders progressive claim streams, optimistic shimmer loaders, stance chips, and deception ratings side-by-side with YouTube watch pages without inserting floating DOM overlays. |
| **`alarms`** | **Required for Background Task Scheduling & Resilience.** Schedules service worker wakeups for cache TTL cleanup, LRU eviction cycles, and automatic backend job polling retry routines across Service Worker idle/terminate cycles. |
| **`notifications`** | **Required for User Alerts & Background Error Handling.** Displays status notifications and actionable system alerts when an offline backend connection error occurs or when an analysis job completes while the side panel is closed. |
| **`activeTab`** | **Required for Temporary Context Inspection.** Grants temporary permission to inspect active YouTube tab metadata (video ID, title, URL) when the user clicks the action button or side panel trigger. |
| **`tabs`** | **Required for YouTube SPA Navigation Monitoring.** Listens to tab context changes (`chrome.tabs.onUpdated`, `chrome.tabs.onActivated`) to synchronize active video state, clear tab-scoped generation keys, and maintain context isolation. |
| **Host Permissions (`https://*.youtube.com/*`, `https://youtu.be/*`)** | **Required for YouTube Player Button Injection & DOM Context Binding.** Enables content script injection on YouTube watch pages to insert the "Analyze Video" action button near native player controls and listen for YouTube SPA navigation events (`yt-navigate-finish`). |

---

## 5. Single Purpose Statement

Perspective Prism's sole purpose is to analyze YouTube video transcripts for claims, multi-perspective stance consistency, and deception metrics, presenting findings to the user via Chrome's native Side Panel interface.
