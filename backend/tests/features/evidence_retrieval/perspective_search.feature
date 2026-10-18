Feature: Perspective-scoped evidence retrieval
  Evidence for a claim is retrieved from sources curated per perspective so
  that each analysis sees the outlets its readers would realistically
  encounter.

  Scenario: Scientific perspective searches only trusted scientific sources
    Given a claim requiring evidence
    When evidence is retrieved for the Scientific perspective
    Then the search query is scoped to scientific domains only
    And the search results are mapped to evidence entries

  Scenario: Partisan perspectives search their own trusted sources
    Given a claim requiring evidence
    When evidence is retrieved for both partisan perspectives
    Then the left-leaning search query is scoped to left-leaning domains only
    And the right-leaning search query is scoped to right-leaning domains only
    And each perspective's evidence carries its own perspective label
