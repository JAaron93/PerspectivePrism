Feature: Error handling and actionable recovery
  The frontend formats backend error codes into actionable user guidance
  and provides direct links to resolve key and quota issues.

  Scenario: SUPADATA_KEY_REQUIRED error opens BYOK panel and shows action links
    Given the analysis API fails with error code "SUPADATA_KEY_REQUIRED"
    When the user submits a YouTube news video URL
    Then an error banner is displayed explaining an API key is required
    And the BYOK configuration panel is automatically opened
    And an action link directs to "Get Free Key at Supadata.ai ↗" pointing to "https://supadata.ai"
    And an "Enter API Key" action button is displayed

  Scenario: SUPADATA_QUOTA_EXHAUSTED error provides direct upgrade link
    Given the analysis API fails with error code "SUPADATA_QUOTA_EXHAUSTED"
    When the user submits a YouTube news video URL
    Then an error banner is displayed explaining quota exhaustion
    And an action link directs to "Upgrade Plan at Supadata ↗" pointing to "https://supadata.ai/pricing"

  Scenario: Backend 500 error renders server failure alert
    Given the analysis API fails to create the job with a 500 server error
    When the user submits a YouTube news video URL
    Then an error alert is rendered stating "Failed to start analysis job"

  Scenario: Re-submitting a new video dismisses active error banners
    Given an active error banner is displayed
    When the user submits a new YouTube news video URL
    Then the active error banner is immediately dismissed
