Feature: Evidence search resilience
  Provider failures degrade gracefully: quota exhaustion surfaces a visible
  notice, outages yield empty evidence without failing, and concurrent
  searches never exceed the provider rate limit.

  Scenario: Exhausted search quota yields a quota notice instead of silence
    Given a claim requiring evidence
    When the search provider rejects the request with HTTP 429
    Then the perspective receives a visible quota-exceeded notice

  Scenario: Network failure yields empty evidence without failing
    Given a claim requiring evidence
    When the search provider is unreachable
    Then every perspective yields empty evidence and no error is raised

  Scenario: Concurrent searches stay within the provider rate limit
    Given a claim requiring evidence
    When evidence is retrieved for all 4 perspectives concurrently
    Then no more than 3 searches are ever in flight at once
    And every perspective still receives its search results
