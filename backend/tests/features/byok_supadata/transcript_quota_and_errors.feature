Feature: Backend Transcript Error and Quota Status Reporting

  Scenario: Supadata 402 returns SUPADATA_QUOTA_EXHAUSTED error code
    Given the Supadata API returns HTTP 402 for the transcript request
    When an analysis job is submitted and polled to completion
    Then GET /analyze/jobs/{job_id} returns status "failed"
    And the response error_code is "SUPADATA_QUOTA_EXHAUSTED"

  Scenario: Supadata 401 returns SUPADATA_KEY_INVALID error code
    Given the Supadata API returns HTTP 401 for the transcript request
    When an analysis job is submitted and polled to completion
    Then GET /analyze/jobs/{job_id} returns status "failed"
    And the response error_code is "SUPADATA_KEY_INVALID"

  Scenario: Missing key with fallback disabled returns SUPADATA_KEY_REQUIRED
    Given settings.SUPADATA_FALLBACK_LOCAL is False
    And settings.SUPADATA_API_KEY is ""
    And no "X-Supadata-Key" header is present in the request
    When an analysis job is submitted and polled to completion
    Then GET /analyze/jobs/{job_id} returns status "failed"
    And the response error_code is "SUPADATA_KEY_REQUIRED"
