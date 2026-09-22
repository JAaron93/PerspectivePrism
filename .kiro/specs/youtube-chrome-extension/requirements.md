# Requirements Document

## Introduction

This document defines the requirements for a Chrome browser extension that integrates with the Perspective Prism application. The extension enables users to analyze YouTube videos directly from the YouTube website, providing seamless access to multi-perspective claim analysis without leaving their browsing context.

## Glossary

- **Extension**: The Chrome browser extension component that runs in the user's browser
- **Content Script**: JavaScript code injected into YouTube pages to interact with the page DOM
- **Background Service Worker**: The extension's background process that handles API communication
- **Perspective Prism Backend**: The existing FastAPI backend service that performs claim extraction and analysis
- **Analysis Button**: A UI element injected into YouTube's interface to trigger video analysis
- **Analysis Panel**: A UI component that displays analysis results within the YouTube interface
- **Video ID**: The unique identifier for a YouTube video (extracted from the URL)

## Requirements

### Requirement 1: Extension Installation and Configuration

**User Story:** As a user, I want to install the Chrome extension and configure it with my Perspective Prism backend URL, so that I can analyze YouTube videos from my browser.

#### Acceptance Criteria

1. WHEN the user installs the Extension, THE Extension SHALL display a welcome page with configuration instructions
2. THE Extension SHALL provide a settings page where users can enter the Perspective Prism Backend URL
3. THE Extension SHALL validate the Perspective Prism Backend URL format before saving
4. THE Extension SHALL only accept HTTPS URLs for the Perspective Prism Backend except for localhost addresses (127.0.0.1, localhost)
5. WHEN the user enters an HTTP URL for a non-localhost address, THE Extension SHALL reject the URL and display a warning message requiring HTTPS
6. THE Extension SHALL persist the configuration settings across browser sessions
7. WHEN the Perspective Prism Backend URL is not configured, THE Extension SHALL display a notification prompting the user to configure settings

### Requirement 2: YouTube Page Integration

**User Story:** As a user, I want to see an analysis button on YouTube video pages, so that I can easily trigger analysis without leaving YouTube.

#### Acceptance Criteria

1. WHEN the user navigates to a YouTube video page, THE Extension SHALL inject an Analysis Button into the YouTube interface
2. THE Analysis Button SHALL be visually distinct and positioned near the video player controls
3. THE Analysis Button SHALL display appropriate states (idle, loading, error, success)
4. WHEN the user clicks the Analysis Button, THE Extension SHALL extract the Video ID from the current page URL
5. THE Extension SHALL detect navigation between YouTube videos and update the Analysis Button state accordingly

### Requirement 3: Video Analysis Request

**User Story:** As a user, I want to request analysis of the current YouTube video, so that I can understand the claims and perspectives presented in the video.

#### Acceptance Criteria

1. WHEN the user initiates analysis, THE Extension SHALL first check the persistent cache for existing results.
2. IF valid cached results exist, THE Extension SHALL display them within 500 milliseconds.
3. THE Extension SHALL asynchronously send a background analysis request to the Perspective Prism Backend (stale-while-revalidate pattern), respecting a 120-second timeout.
4. THE Extension SHALL display a non-blocking loading indicator while the background refresh is in progress.
5. WHEN the fresh analysis response is received, THE Extension SHALL compare its timestamp with the displayed results.
6. IF the fresh result is newer, THE Extension SHALL replace the displayed results and update the cache with a new 24-hour expiration.
7. IF the background refresh fails, THE Extension SHALL display a clear error message without removing the cached results (if visible).
8. IF no cached results exist, THE Extension SHALL display a blocking loading indicator until the fresh analysis completes or fails.

### Requirement 4: Analysis Results Display

**User Story:** As a user, I want to view the analysis results in a clear and organized format on the YouTube page, so that I can understand the claims, evidence, and perspectives without switching contexts.

#### Acceptance Criteria

1. WHEN analysis results are received, THE Extension SHALL display an Analysis Panel on the YouTube page
2. THE Analysis Panel SHALL show all extracted claims with their respective truth profiles
3. THE Analysis Panel SHALL display perspective analyses (Scientific, Journalistic, Partisan Left, Partisan Right)
4. THE Analysis Panel SHALL show bias and deception indicators for each claim
5. THE Analysis Panel SHALL be scrollable when content exceeds the visible area
6. THE Analysis Panel SHALL include a close button to dismiss the panel
7. THE Extension SHALL allow users to toggle the Analysis Panel visibility without losing the results

### Requirement 5: Results Caching and Storage

**User Story:** As a user, I want previously analyzed videos to show cached results immediately, so that I don't have to wait for re-analysis of videos I've already checked.

#### Acceptance Criteria

1. THE Extension SHALL use chrome.storage.local for persistent cache storage across browser sessions
2. WHEN the user navigates to a previously analyzed video, THE Extension SHALL check for cached results based on the Video ID
3. THE Extension SHALL display cached results within 500 milliseconds of page load
4. THE Extension SHALL provide a refresh button to request new analysis for cached videos that bypasses the cache
5. THE Extension SHALL cache analysis results for a duration of 24 hours from the time of analysis
6. THE Extension SHALL clear expired cache entries automatically on extension startup and when storage quota is exceeded
7. WHEN both fresh and cached results exist for the same video, THE Extension SHALL use the most recent analysis results as the single source of truth

### Requirement 6: Error Handling and User Feedback

**User Story:** As a user, I want clear feedback when errors occur, so that I understand what went wrong and how to resolve issues.

#### Acceptance Criteria

1. IF the Perspective Prism Backend is unreachable, THEN THE Extension SHALL display an error message indicating connection failure
2. IF the video has no available transcript, THEN THE Extension SHALL display a message explaining that analysis cannot be performed
3. THE Extension SHALL log only sanitized error metadata (e.g., HTTP status code, error type/message, timestamp, network timeout indicator, malformed-URL flag, and minimal request identifier) to the browser console, and SHALL NOT log any sensitive content such as video data or transcripts, user-identifying information (emails, usernames), API keys/tokens, or full URLs with query parameters/other PII.
4. THE Extension SHALL provide actionable error messages that guide users toward resolution
5. WHEN an error occurs, THE Extension SHALL allow users to retry the analysis request

### Requirement 7: Privacy and Security

**User Story:** As a user, I want my browsing activity and analysis data to remain private and secure, so that my information is protected.

#### Acceptance Criteria

1. THE Extension SHALL only request permissions necessary for YouTube integration and API communication
2. THE Extension SHALL not collect or transmit user browsing data beyond the Video ID for analysis
3. THE Extension SHALL communicate with the Perspective Prism Backend using HTTPS for all non-localhost connections
4. THE Extension SHALL only allow HTTP connections to localhost addresses (127.0.0.1, localhost) for development purposes
5. THE Extension SHALL store cached results locally in the browser storage only
6. THE Extension SHALL not inject tracking scripts or third-party analytics
7. THE Extension SHALL obtain explicit user consent via a dedicated dialog before the first analysis is performed (this is separate from and in addition to standard browser permission prompts)
8. THE Consent Dialog SHALL clearly state:
    - **Data Transmitted:** YouTube Video ID only
    - **Purpose:** To retrieve analysis and truth profiles
    - **Retention:** Data is cached locally; backend retention depends on configuration
9. THE Extension SHALL provide the following consent options:
    - "Always Allow" (persisted preference)
    - "Ask Every Time" (per-video prompt)
    - "Deny" (blocks analysis)
10. THE Extension SHALL persist the user's consent preference in the extension settings and provide a clear option to revoke or change it at any time
11. IF consent is refused or revoked, THE Extension SHALL block the analysis request and display a clear UI message: "Analysis cancelled. Consent is required to proceed."

### Requirement 8: Performance and Resource Management

**User Story:** As a user, I want the extension to run efficiently without slowing down my browser or YouTube experience, so that I can browse smoothly.

#### Acceptance Criteria

1. THE Content Script SHALL have a memory footprint not exceeding 10 megabytes during normal operation
2. THE Extension SHALL inject UI elements only after the YouTube page has fully loaded
3. THE Extension SHALL debounce rapid navigation events with a delay of 500 milliseconds
4. THE Extension SHALL clean up event listeners and DOM elements when the user navigates away from YouTube
5. THE Background Service Worker SHALL terminate idle connections after 30 seconds of inactivity
