# Requirements: Perspective Prism Chrome Extension UX v3

## 1. Functional Requirements (FR)

| ID | Description |
|---|---|
| **FR-1** | The extension shall register and render a Chrome Side Panel. |
| **FR-2** | The side panel shall be toggleable via the browser action icon. |
| **FR-3** | The content script shall inject a toggle button into the YouTube video player (near the subscribe/share row) to open the side panel. |
| **FR-4** | The content script shall query the active video's duration and calculate the percentage position for each claim timestamp. |
| **FR-5** | The content script shall inject marker `<div>` elements into the YouTube `.ytp-progress-list` container. |
| **FR-6** | The content script shall cluster claims that occur within 5 seconds of each other into a single "Cluster Marker". |
| **FR-7** | Clicking a timeline marker shall seek the YouTube video to the marker's starting timestamp. |
| **FR-8** | Clicking a timeline marker shall send a message to the side panel to highlight and scroll to the corresponding claim(s). |
| **FR-9** | The content script shall broadcast the video's `currentTime` to the side panel at a regular interval (throttled). |
| **FR-10**| The side panel shall automatically scroll the active claim into view as the video plays, based on the `currentTime` broadcasts. |
| **FR-11**| The extension shall clear and re-render timeline markers and side panel state when the YouTube player navigates to a new video (SPA navigation). |

## 2. Non-Functional Requirements (NFR)

| ID | Description |
|---|---|
| **NFR-1** | **Performance**: Auto-scrolling and `timeupdate` broadcasts must be debounced/throttled to at most 4 times per second (250ms) to prevent UI thread lock. |
| **NFR-2** | **Resilience**: The extension must gracefully handle YouTube SPA navigations (`yt-navigate-start`, `yt-navigate-finish`) without leaking DOM nodes or event listeners. |
| **NFR-3** | **Visual Language**: Timeline markers must strictly map colors to truth profiles: Green (Likely True), Yellow (Mixed), Red (Suspicious/Deceptive). |

## 3. User Stories (US)

| ID | Description |
|---|---|
| **US-1** | As a user, I want to keep the analysis open in a side panel while I browse different YouTube videos, so I don't lose my context. |
| **US-2** | As a user, I want to see colored markers on the video timeline, so I can instantly know where the deceptive or mixed claims are located. |
| **US-3** | As a user, I want the side panel to automatically scroll as the video plays, so I can read the analysis for the claim currently being spoken without manually searching for it. |
| **US-4** | As a user, I want to click a cluster of claims on the timeline and see all of those specific claims highlighted in the side panel, so I can investigate dense sections of the video. |

## 4. BDD Constraints & Acceptance Criteria

```gherkin
Feature: Timeline Visualization and Clustering
  Scenario: Rendering clustered markers on the timeline
    Given a YouTube video is loaded and analyzed
    And the analysis returns 3 claims at timestamps "1:00", "1:02", and "1:04"
    When the content script renders the timeline
    Then the 3 claims should be grouped into a single Cluster Marker at the "1:00" position
    And the Cluster Marker should be colored based on the most severe truth profile among the 3 claims.

Feature: Playback Synchronization
  Scenario: Auto-scrolling the side panel during playback
    Given the video is playing and the side panel is open
    When the video's current time reaches the timestamp of Claim X
    Then the side panel should automatically scroll Claim X into the visible viewport
    And Claim X should receive a visual highlight styling.

  Scenario: Clicking a timeline marker
    Given the side panel is open
    When the user clicks a Cluster Marker on the YouTube timeline
    Then the YouTube video should jump to the cluster's start timestamp
    And the side panel should scroll to the claims in that cluster
    And all claims in that cluster should be highlighted.
```
