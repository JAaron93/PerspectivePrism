Feature: Accessibility, screen readers and keyboard usability
  As a user navigating with assistive technologies or keyboard-only controls
  I want Perspective Prism to announce dynamic updates and support full keyboard navigation
  So that the application is fully accessible.

  Scenario: Keyboard-only form submission via Enter key
    Given the user navigates to the Perspective Prism web app
    And the analysis API will answer with a completed news-video job
    When the user tabs to the YouTube URL input
    And the user types "https://www.youtube.com/watch?v=PBSNewsHour_BudgetBriefing" using the keyboard
    And the user presses the Enter key
    Then the results header shows the analyzed video
    And the claim text is rendered

  Scenario: Keyboard-only navigation into BYOK controls
    Given the user is on the main page with unconfigured BYOK settings
    When the user tabs to the BYOK toggle button and presses Enter
    Then the BYOK configuration panel is expanded
    When the user tabs to the API key input and enters "keyboard-supadata-key-123"
    And the user tabs to the Save Key button and presses Enter
    Then the trimmed key "keyboard-supadata-key-123" is stored in localStorage
    And a status message confirms "API Key saved."

  Scenario: Loading state announces status to screen readers
    Given the analysis API is processing a submission
    When the user submits a YouTube news video URL
    Then the loading indicator has accessible status attributes
    And the loading spinner is marked aria-hidden

  Scenario: Thinking indicators announce progressive status to screen readers
    Given a job is streaming a claim with a pending "Scientific" perspective
    When the user submits a YouTube news video URL
    Then the thinking component has accessible status attributes
    And the thinking spinner is marked aria-hidden

  Scenario: Error alerts announce failures to screen readers
    Given the analysis API fails with error code "SUPADATA_KEY_REQUIRED"
    When the user submits a YouTube news video URL
    Then the error container has role "alert"
