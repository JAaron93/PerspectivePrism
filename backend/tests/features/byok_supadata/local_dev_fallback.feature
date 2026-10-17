Feature: Local Development Transcript Fallback

  Scenario: Local fallback enabled attempts youtube-transcript-api
    Given settings.SUPADATA_FALLBACK_LOCAL is True
    And settings.SUPADATA_API_KEY is ""
    And no "X-Supadata-Key" header is present in the request
    When ClaimExtractor.get_transcript() is called for video "test-video-id"
    Then the youtube-transcript-api fallback path is attempted
    And no Supadata HTTP request is dispatched

  Scenario: Local fallback disabled raises SupadataKeyRequiredError immediately
    Given settings.SUPADATA_FALLBACK_LOCAL is False
    And settings.SUPADATA_API_KEY is ""
    And no "X-Supadata-Key" header is present in the request
    When ClaimExtractor.get_transcript() is called for video "test-video-id"
    Then a SupadataKeyRequiredError exception is raised immediately
    And no youtube-transcript-api fallback is attempted
