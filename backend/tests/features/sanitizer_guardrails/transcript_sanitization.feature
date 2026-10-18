Feature: Transcript sanitization guardrails
  Transcripts are untrusted input. Hostile transcripts never reach the LLM and
  degrade gracefully into an error claim; benign transcripts containing special
  characters are safely sanitized and still reach claim extraction.

  Scenario: An injection transcript yields an error claim instead of analysis
    Given a video whose transcript contains a prompt injection attempt
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the result contains exactly 1 claim
    And the claim reports a sanitization failure
    And the extraction model was never invoked

  Scenario: A benign transcript with special characters is sanitized and extracted
    Given a video whose transcript contains quotes and special characters
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the result contains exactly 1 claim
    And the claim text matches the extracted claim
    And the extraction prompt carried the sanitized transcript
