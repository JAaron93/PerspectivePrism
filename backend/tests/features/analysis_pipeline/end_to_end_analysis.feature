Feature: End-to-end video analysis
  A submitted video is processed through the full pipeline: transcript retrieval,
  eligibility gate, claim extraction, evidence retrieval, multi-perspective
  analysis, and truth profile assembly.

  Scenario: Eligible news video is analyzed across all perspectives
    Given an eligible news video with spoken commentary
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the result contains 2 analyzed claims
    And each claim is analyzed from all 4 perspectives
    And the overall assessment is "Likely True"

  Scenario: Disagreeing evidence yields a likely-false verdict
    Given an eligible news video whose evidence refutes the claim
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the overall assessment is "Likely False"

  Scenario: Moderate deception downgrades a likely-true verdict
    Given an eligible news video with moderate deception signals
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the overall assessment is "Mixed"

  Scenario: Results are published incrementally while processing
    Given an eligible news video with a single claim
    When the analysis job is submitted and runs to completion
    Then a mid-processing snapshot showed perspectives without a final verdict
    And the final result carries the computed verdict
