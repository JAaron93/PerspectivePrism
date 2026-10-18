Feature: Analysis submission
  A web user submits a YouTube video URL and sees the multi-perspective
  analysis rendered, with the backend API fully mocked.

  Scenario: Submitting a news video URL renders the completed analysis
    Given the analysis API will answer with a completed news-video job
    When the user submits a YouTube news video URL
    Then the results header shows the analyzed video
    And the claim text is rendered
    And the overall assessment verdict is displayed
    And all 4 perspectives are rendered with their stances
    And the deception score is rendered
