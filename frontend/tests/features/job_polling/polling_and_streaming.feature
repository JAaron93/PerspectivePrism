Feature: Progressive job streaming and thinking indicators
  The frontend polls for job updates, renders partial claims in real-time,
  and displays thinking spinners for perspectives and epistemic frameworks in progress.

  Scenario: Missing perspective displays thinking indicator during streaming
    Given a job is streaming a claim with a pending "Scientific" perspective
    When the user submits a YouTube news video URL
    Then the submit button displays "Streaming..."
    And the submit button is disabled
    And the "Scientific" perspective displays an active thinking spinner with "Analyzing Scientific perspective..."

  Scenario: Incomplete epistemic lens displays thinking indicator during streaming
    Given a job is streaming a claim with pending alethiology
    When the user submits a YouTube news video URL
    Then the epistemic lens displays an active thinking indicator with "Analyzing epistemological framework..."

  Scenario: Deception rating displays analyzing patterns when score is null
    Given a job is streaming a claim with a null deception score
    When the user submits a YouTube news video URL
    Then the deception score displays "-/10"
    And the deception rationale displays "Analyzing bias patterns..."

  Scenario: Streaming seamlessly transitions to completed results
    Given a job starts in streaming mode with pending perspectives
    When the user submits a YouTube news video URL
    Then the "Scientific" perspective displays an active thinking spinner with "Analyzing Scientific perspective..."
    When the backend status switches to completed
    Then all thinking indicators are replaced with completed perspective cards
    And the submit button displays "Analyze"
    And the submit button is enabled
