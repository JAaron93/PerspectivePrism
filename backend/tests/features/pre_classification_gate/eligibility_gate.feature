Feature: Pre-classification eligibility gate
  The guardrail gate decides whether a video is worth analyzing: a deterministic
  zero-token fast path skips obvious non-speech content, an LLM classifier judges
  the rest, and ambiguous rejections conservatively default to analyzing.

  Scenario: Captionless music video is skipped with a disclaimer
    Given a captionless music video with benign metadata
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the video is reported as not analysable
    And the disclaimer is titled "No Spoken Commentary Found"
    And the gate confidence is 1.0
    And no claims were extracted
    And claim extraction was never invoked

  Scenario: Captionless video with political metadata is not auto-skipped
    Given a captionless music video with political keywords in its metadata
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the video is reported as not analysable
    And the disclaimer is titled "Analysis Skipped"
    And the eligibility gate agent was consulted

  Scenario: Low-confidence rejection defaults to analyzing the video
    Given a video the gate rejects with low confidence
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the video is reported as analysable
    And the gate confidence is 0.4
    And the result contains 2 extracted claims

  Scenario: Rejected high-confidence video completes with a disclaimer only
    Given a video the gate rejects with high confidence
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the video is reported as not analysable
    And the disclaimer is titled "Analysis Skipped"
    And no claims were extracted
    And claim extraction was never invoked

  Scenario: Force override analyzes a music video without consulting the gate
    Given a music video submitted with force override
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the result contains 2 extracted claims
    And the gate was bypassed entirely
