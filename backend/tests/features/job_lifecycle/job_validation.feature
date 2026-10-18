Feature: Analysis job lifecycle
  Job submission validates input, unknown jobs are not found, oversized claim
  sets are truncated to the configured limit, and expired jobs are purged
  from the in-memory store.

  Scenario: Malformed video URL is rejected with a bad request
    Given a submission with a non-YouTube URL
    When the submission is sent
    Then the API responds with HTTP 400
    And no job is created

  Scenario: Unknown job id returns not found
    When the status of an unknown job is requested
    Then the API responds with HTTP 404

  Scenario: Excessive claims are truncated to the configured limit
    Given a video yielding more claims than the configured limit
    When the analysis job is submitted and runs to completion
    Then the job completes successfully
    And the result contains exactly 2 claims in submission order

  Scenario: Expired jobs are purged while fresh jobs are retained
    Given a completed job older than the retention window and a fresh job
    When the purge routine runs
    Then only the expired job is removed
