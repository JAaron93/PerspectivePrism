Feature: Pre-classification eligibility disclaimer and force override
  Ineligible videos render an educational disclaimer, and the force-override
  action pins to the original URL even if the user edits the input box.

  Scenario: Ineligible video displays disclaimer banner with category badge and topics
    Given the analysis API classifies the video as ineligible entertainment
    When the user submits an entertainment video URL
    Then the eligibility disclaimer banner is displayed with a warning icon
    And the disclaimer title is "Analysis Skipped"
    And the detected category badge displays "Entertainment • 95% Match"
    And the detected topic badges display "Gaming" and "Music"

  Scenario: Educational tip advises navigating to news or documentary content
    Given an ineligible video disclaimer is currently displayed
    Then an educational tip advises navigating to news or documentary videos

  Scenario: Force analyze button sends override request and renders results
    Given an ineligible video disclaimer is currently displayed
    When the user clicks the "Analyze Anyway" button
    Then a loading indicator is displayed
    And the override request payload has force_override set to true
    And the completed analysis results are rendered on the screen

  Scenario: Force analyze pins to the original URL when input field is edited
    Given an ineligible video disclaimer is displayed for "https://www.youtube.com/watch?v=GamingVideo_Original"
    When the user edits the input field to "https://www.youtube.com/watch?v=PBSNewsHour_Edited"
    And the user clicks the "Analyze Anyway" button
    Then the override request payload targets "https://www.youtube.com/watch?v=GamingVideo_Original"
    And the override request payload does not target "https://www.youtube.com/watch?v=PBSNewsHour_Edited"
