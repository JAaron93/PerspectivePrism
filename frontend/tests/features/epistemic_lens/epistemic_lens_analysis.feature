Feature: Epistemic lens and truth theory classification
  The frontend displays primary and secondary epistemological theories
  with dedicated color chips, descriptive summaries, and expandable quote evidence.

  Scenario: Epistemic Lens card displays primary and secondary theory chips
    Given a claim analyzed with primary theory "Correspondence (Empirical)" and secondary theory "Coherence (Systemic Narrative)"
    When the user submits a YouTube news video URL
    Then the epistemic lens title displays "🔭 Epistemic Lens" with subtitle "Truth Framework"
    And the primary theory chip displays "Correspondence (Empirical)" with class "theory-correspondence"
    And the secondary theory chip displays "Supporting: Coherence (Systemic Narrative)" with class "theory-coherence"

  Scenario: Descriptive epistemic summary paragraph renders
    Given a claim analyzed with epistemic summary "The speaker grounds the statement in empirical data and official reports."
    When the user submits a YouTube news video URL
    Then the epistemic summary paragraph displays "The speaker grounds the statement in empirical data and official reports."

  Scenario: Quote evidence drawer toggle expands and collapses blockquotes
    Given a claim analyzed with 2 transcript quote evidences
    When the user submits a YouTube news video URL
    Then the quote accordion toggle displays "Transcript Quote Evidence (2)" with arrow "▶"
    And the quote evidences drawer is hidden
    When the user clicks the quote accordion toggle
    Then the quote evidences drawer is visible
    And the quote accordion toggle displays arrow "▼"
    And 2 quote blockquotes are rendered
    When the user clicks the quote accordion toggle
    Then the quote evidences drawer is hidden
    And the quote accordion toggle displays arrow "▶"

  Scenario: Missing alethiology data is gracefully omitted when completed
    Given a completed claim analysis with no alethiology data
    When the user submits a YouTube news video URL
    Then no epistemic lens card is rendered in the DOM
