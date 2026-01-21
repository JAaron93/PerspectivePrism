# Accessibility Testing: Keyboard Navigation

## Goal
Verify that all interactive elements of the Perspective Prism Analysis Panel can be accessed and operated using only the keyboard, complying with WCAG 2.1 guideline 2.1.1 (Keyboard).

## Key Mappings

| Action | Key(s) | Expected Behavior |
|--------|--------|-------------------|
| **Open Panel** | `Enter` or `Space` | When focus is on the Analysis Button, activates the button and opens the panel. |
| **Close Panel** | `Escape` | Closes the Analysis Panel and returns focus to the Analysis Button. |
| **Close Panel** | `Enter` or `Space` | When focus is on the "Close" button inside the panel, closes the panel. |
| **Navigate Items** | `Tab` | Moves focus to the next interactive element (Button -> Panel Content -> Close Button, etc.). |
| **Navigate Back** | `Shift + Tab` | Moves focus to the previous interactive element. |
| **Next Claim** | `Arrow Down` | Moves focus to the next claim in the list. |
| **Previous Claim** | `Arrow Up` | Moves focus to the previous claim in the list. |
| **Expand/Collapse** | `Enter` or `Space` | Toggles the currently focused claim to show/hide details. |
| **First Claim** | `Home` | Moves focus to the first claim in the list. |
| **Last Claim** | `End` | Moves focus to the last claim in the list. |

## Test Cases

### 1. Panel Activation and Basic Navigation
1.  Navigate to a YouTube video page.
2.  Press `Tab` until the "Perspective Prism Analysis" button is focused.
3.  Press `Enter` to open the panel.
4.  **Verify:** Focus moves immediately to the "Close" button.
5.  Press `Tab` repeatedly to navigate through all interactive elements within the panel (Claims, buttons, links).
6.  **Verify:** Focus remains within the panel and does not escape to the background page.
7.  From the last interactive element in the panel, press `Tab` once more.
8.  **Verify:** Focus returns to the "Close" button, confirming the focus trap cycle.

### 2. Claim Navigation (Custom Controls)
1.  Open the Analysis Panel and ensure multiple claims are loaded.
2.  Navigate focus to the list of claims (e.g., focus the first claim).
3.  **Basic Navigation:**
    - Press `Arrow Down`. **Verify:** Focus moves to the next claim; it is visually highlighted.
    - Press `Arrow Up`. **Verify:** Focus moves to the previous claim.
    - Press `Home`. **Verify:** Focus jumps to the very first claim.
    - Press `End`. **Verify:** Focus jumps to the very last claim.
4.  **Boundary Test Cases (No-Wrap Behavior):**
    - **First Item Edge:** Focus the first claim. Press `Arrow Up`.
        - **Verify:** Focus remains on the first claim (no wrapping to the bottom).
        - Press `Home`. **Verify:** Focus remains on the first claim.
    - **Last Item Edge:** Focus the last claim. Press `Arrow Down`.
        - **Verify:** Focus remains on the last claim (no wrapping to the top).
        - Press `End`. **Verify:** Focus remains on the last claim.

### 3. Claim Expansion/Collapse
1.  Focus on a collapsed claim.
2.  Press `Enter` or `Space`.
3.  **Verify:** The claim expands to reveal perspectives and indicators.
4.  Press `Enter` or `Space` again.
5.  **Verify:** The claim collapses.
6.  **Verify:** `Arrow Right/Left` do NOT expand/collapse (unless implementing a Tree pattern, but Disclosure is standard).

### 4. Closing the Panel
1.  Open the panel and move focus somewhere deep inside the claims list.
2.  Press `Escape`.
3.  **Verify:** The panel closes.
4.  **Verify:** Focus is returned to the "Perspective Prism Analysis" button on the YouTube page.
