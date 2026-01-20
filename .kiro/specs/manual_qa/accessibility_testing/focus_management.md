# Accessibility Testing: Focus Management

## Goal
Verify that keyboard focus is managed logically and predictably, preventing "focus traps" (where a user cannot get out) and "lost focus" (where focus resets to top of page), complying with WCAG 2.1 guideline 2.4.3 (Focus Order).

## Requirements

1.  **Opening the Panel:** Focus must move *into* the panel immediately. Ideally to the "Close" button or the first heading.
2.  **Closing the Panel:** Focus must return to the *trigger element* (the "Analysis Button"). This allows the user to continue browsing from where they left off.
3.  **Containment (Focus Trap):** When the panel is open (and modal), tabbing should cycle *only* through the panel's interactive elements. It should not tab out to the background YouTube page controls (play/pause, comments, etc.).

## Test Cases

### 1. Initial Focus Placement
1.  Navigate to the "Perspective Prism Analysis" button using the keyboard.
2.  Press `Enter` to open.
3.  **Verify:** The focus indicator is clearly visible on an element *inside* the panel (e.g., the Close button).
4.  **Verify:** Focus is *not* still on the "Analysis Button" (which is now behind the panel, or obscured).

### 2. Focus Trapping (Modal Behavior)
1.  With the panel open, press `Tab` repeatedly.
2.  **Verify:** Focus moves through the panel elements: Close Button -> Refresh Button -> Claims List -> Settings Link -> Close Button.
3.  **Verify:** Focus does *not* jump to the YouTube Search bar, video player controls, or comments section.
4.  Try `Shift + Tab` (reverse order).
5.  **Verify:** Focus stays within the panel cycle.

### 3. Focus Restoration (Return)
1.  With the panel open, navigate to any element inside it.
2.  Press `Escape` (or activate the "Close" button).
3.  **Verify:** The panel closes.
4.  **Verify:** Focus is immediately placed back on the "Perspective Prism Analysis" button.
5.  **Critique:** If focus returns to the `body` (start of page) or URL bar, this is a failure.

### 4. Visual Focus Indicator
1.  Navigate through all elements in the panel.
2.  **Verify:** Every focused element has a visible, high-contrast outline or style change.
3.  **Verify:** The custom claim list items clearly show when they are focused (e.g., background color change, border).
