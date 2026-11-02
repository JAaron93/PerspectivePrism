Feature: BYOK Supadata API key management
  Users configure, toggle, save, and clear their personal Supadata API key,
  which is persisted in localStorage and forwarded in request headers.

  Scenario: Toggling BYOK configuration accordion
    Given the user is on the main page with unconfigured BYOK settings
    Then the toggle button displays "Configure Supadata API Key (BYOK)"
    When the user clicks the BYOK toggle button
    Then the BYOK configuration panel is expanded
    And the toggle button has aria-expanded set to true
    When the user clicks the BYOK toggle button
    Then the BYOK configuration panel is collapsed
    And the toggle button has aria-expanded set to false

  Scenario: Saving Supadata API key persists to localStorage and updates button
    Given the user is on the main page with unconfigured BYOK settings
    And the BYOK configuration panel is open
    When the user enters "  sd_live_abcdef123456  " into the API key input
    And the user clicks "Save Key"
    Then the trimmed key "sd_live_abcdef123456" is stored in localStorage
    And a status message confirms "API Key saved."
    And the toggle button displays "Supadata API Key (Configured)"

  Scenario: Toggling password visibility switches input type
    Given the user is on the main page with unconfigured BYOK settings
    And the BYOK configuration panel is open
    When the user enters "sd_live_secret_key" into the API key input
    Then the API key input has type "password"
    And the visibility button has aria-label "Show API key"
    When the user clicks the "Show" visibility button
    Then the API key input has type "text"
    And the visibility button label changes to "Hide"
    And the visibility button has aria-label "Hide API key"
    When the user clicks the "Hide" visibility button
    Then the API key input has type "password"
    And the visibility button label changes to "Show"
    And the visibility button has aria-label "Show API key"

  Scenario: Clearing saved API key resets configuration
    Given a Supadata API key "sd_live_stored_key" is saved in localStorage
    When the user opens the BYOK configuration panel
    And the user clicks the "Clear" button
    Then the key is removed from localStorage
    And the API key input field is emptied
    And the toggle button reverts to "Configure Supadata API Key (BYOK)"

  Scenario: Outbound request includes X-Supadata-Key when configured
    Given the analysis API is ready to accept jobs
    And a Supadata API key "sd_live_secret_key" is saved in localStorage
    When the user submits a YouTube news video URL
    Then the outbound POST request headers include "X-Supadata-Key" with value "sd_live_secret_key"

  Scenario: Outbound request omits X-Supadata-Key when not configured
    Given the analysis API is ready to accept jobs
    And no Supadata API key is configured
    When the user submits a YouTube news video URL
    Then the outbound POST request headers do not include "X-Supadata-Key"
