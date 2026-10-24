Feature: UI resilience and edge cases
  The frontend gracefully handles edge conditions including zero claims,
  excessively long claim text, and responsive layout wrapping.

  Scenario: Analysis completed with zero verifiable claims
    Given an analysis job that completes with an empty claims array
    When the user submits a YouTube news video URL
    Then the results header shows the analyzed video ID
    And no truth profile cards are rendered
    And no error alert is displayed

  Scenario: Very long claim text renders without layout truncation
    Given an analysis job with a 500 character claim text
    When the user submits a YouTube news video URL
    Then the full 500 character claim text is rendered in the DOM
    And the truth profile container is displayed
