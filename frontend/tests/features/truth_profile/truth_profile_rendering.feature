Feature: Truth profile and multi-perspective rendering
  The frontend renders verifiable claims, overall assessment verdict badges,
  four distinct perspective cards with confidence meters, and deception ratings.

  Scenario: Multiple claims render with ordinal labels and timestamps
    Given an analysis job containing two distinct claims
    When the user submits a YouTube news video URL
    Then ordinal heading "Claim 1" is rendered with timestamp "0:00 - 0:08"
    And ordinal heading "Claim 2" is rendered with timestamp "0:12 - 0:25"

  Scenario: Overall assessment badges reflect truth classifications
    Given completed claims with verdicts "Likely True", "Likely False", and "Mixed"
    When the user submits a YouTube news video URL
    Then the assessment badges apply class names "assessment-likely-true", "assessment-likely-false", and "assessment-mixed"

  Scenario: Four perspectives render with stances, confidence bars, and explanations
    Given a completed claim analysis with all 4 perspectives
    When the user submits a YouTube news video URL
    Then all 4 perspectives are rendered in the perspective grid
    And each perspective displays its stance, confidence percentage, and explanation
    And each perspective displays a confidence fill bar matching its score

  Scenario: Deception rating displays numeric score and severity classification
    Given a claim with deception score 8.5
    When the user submits a YouTube news video URL
    Then the deception score displays "8.5/10"
    And the deception rationale displays "Deception Score: High"
