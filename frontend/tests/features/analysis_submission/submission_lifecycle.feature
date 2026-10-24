Feature: Analysis submission lifecycle
  The frontend validates YouTube URL inputs, updates button states during
  submission, and unconditionally clears previous state on new submissions.

  Scenario: Submitting with an empty URL is blocked by form validation
    Given the user navigates to the Perspective Prism web app
    When the user submits the form with an empty YouTube URL
    Then the browser prevents submission via HTML5 validation
    And no analysis job request is sent to the backend

  Scenario: Analyze button reflects loading and streaming states
    Given the analysis API will stream partial claims before completing
    When the user submits a YouTube news video URL
    Then the submit button is disabled
    And the submit button displays "Analyzing..."
    When the backend streams partial claims
    Then the submit button displays "Streaming..."
    When the job finishes processing
    Then the submit button displays "Analyze"
    And the submit button is enabled

  Scenario: Submitting a new URL clears previous results
    Given a previous analysis has rendered results on the screen
    When the user submits a new YouTube news video URL
    Then the previous results are immediately removed from the DOM
