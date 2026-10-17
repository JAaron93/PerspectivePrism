Feature: Supadata API Key Header Propagation and Precedence

  Scenario: Request with X-Supadata-Key header forwards key to Supadata API
    Given the backend receives a POST to /analyze/jobs
    And the request header "X-Supadata-Key" is "test-key-abc"
    When the analysis job is processed
    Then ClaimExtractor.get_transcript() is called with supadata_key "test-key-abc"
    And the Supadata API receives header "x-api-key" equal to "test-key-abc"
    And the key is not stored in os.environ or the jobs repository

  Scenario: Request without header uses server-side configured key
    Given the backend receives a POST to /analyze/jobs
    And no "X-Supadata-Key" header is present
    And settings.SUPADATA_API_KEY is configured as "server-side-key-123"
    When the analysis job is processed
    Then ClaimExtractor.get_transcript() is called with supadata_key "server-side-key-123"
    And the Supadata API receives header "x-api-key" equal to "server-side-key-123"

  Scenario: Request header takes precedence over server-side configured key
    Given settings.SUPADATA_API_KEY is configured as "server-default-key"
    And the backend receives a POST to /analyze/jobs
    And the request header "X-Supadata-Key" is "user-override-key"
    When the analysis job is processed
    Then ClaimExtractor.get_transcript() is called with supadata_key "user-override-key"
