Feature: Primary model resilience
  When the primary Gemini model misbehaves, jobs still complete: transient
  failures fall back to the backup model, repeated failures trip the circuit
  breaker, and an open breaker stops calling the primary provider entirely.

  Scenario: A transient primary failure falls back to the backup model and recovers
    Given a video whose primary model fails once with a transient error
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the affected perspective was answered by the backup model
    And the circuit breaker recovered to a healthy state

  Scenario: Repeated primary failures trip the circuit breaker
    Given a video whose primary model keeps failing with transient errors
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And every perspective was answered by the backup model
    And the circuit breaker is open on the health endpoint

  Scenario: An open circuit breaker skips the primary model entirely
    Given an open circuit breaker on the analysis service
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And every perspective was answered by the backup model
    And the primary model was never invoked
    And the circuit breaker is open on the health endpoint
