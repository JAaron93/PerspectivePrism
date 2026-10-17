Feature: Web Frontend Job Analysis Callers

  Scenario: Web frontend caller with user-supplied key succeeds
    Given the backend receives a POST to /analyze/jobs
    And the request header "X-Supadata-Key" is "web-user-key"
    And the Supadata API returns a valid transcript
    When the analysis job is polled to completion
    Then GET /analyze/jobs/{job_id} returns status "completed"

  Scenario: Keyless web frontend caller on server with default key succeeds
    Given settings.SUPADATA_API_KEY is configured as "server-web-key"
    And the backend receives a POST to /analyze/jobs without an "X-Supadata-Key" header
    And the Supadata API returns a valid transcript
    When the analysis job is polled to completion
    Then GET /analyze/jobs/{job_id} returns status "completed"
