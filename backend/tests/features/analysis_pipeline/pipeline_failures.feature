Feature: Pipeline failure handling
  When transcript retrieval fails, the job reports an explicit, honest error
  instead of silently masking the cause.

  Scenario: Eligible video without captions fails with an explicit error
    Given an eligible video whose captions cannot be retrieved
    When the analysis job is submitted and runs to completion
    Then the job fails
    And the error explains that captions are required
    And the result is empty

  Scenario: A transient transcript outage is not reported as missing captions
    Given a video whose transcript service is temporarily unreachable
    When the analysis job is submitted and runs to completion
    Then the job fails
    And the error reflects the retrieval failure, not missing captions
    And the eligibility gate was never consulted
