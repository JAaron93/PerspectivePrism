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
| **Expand Claim** | `Arrow Right` | Expands the currently focused claim to show details. |
| **Collapse Claim** | `Arrow Left` | Collapses the currently focused claim. |
| **First Claim** | `Home` | Moves focus to the first claim in the list. |
| **Last Claim** | `End` | Moves focus to the last claim in the list. |

## Test Cases

### 1. Panel Activation and Basic Navigation
1.  Navigate to a YouTube video page.
2.  Press `Tab` until the "Perspective Prism Analysis" button is focused.
3.  Press `Enter` to open the panel.
4.  **Verify:** Focus moves immediately to the "Close" button or the first interactive element within the panel.
5.  Press `Tab` repeatedly.
6.  **Verify:** Focus cycles through all interactive elements within the panel (Claims, buttons, links) and does not escape to the background page (Focus Trap).

### 2. Claim Navigation (Custom Controls)
1.  Open the Analysis Panel and ensure claims are loaded.
2.  Navigate focus to the list of claims.
3.  Press `Arrow Down`.
4.  **Verify:** Focus moves to the next claim. The claim should be visually highlighted.
5.  Press `Arrow Up`.
6.  **Verify:** Focus moves to the previous claim.
7.  Press `Home`.
8.  **Verify:** Focus jumps to the very first claim.
9.  Press `End`.
10. **Verify:** Focus jumps to the very last claim.

### 3. Claim Expansion/Collapse
1.  Focus on a collapsed claim.
2.  Press `Arrow Right`.
3.  **Verify:** The claim expands to reveal perspectives and indicators.
4.  Press `Arrow Left`.
5.  **Verify:** The claim collapses.
6.  **Verify:** Repeated presses of `Arrow Left` on a collapsed claim do nothing (or move focus to parent if applicable, but standard behavior is no-op).

### 4. Closing the Panel
1.  Open the panel and move focus somewhere deep inside the claims list.
2.  Press `Escape`.
3.  **Verify:** The panel closes.
4.  **Verify:** Focus is returned to the "Perspective Prism Analysis" button on the YouTube page.
