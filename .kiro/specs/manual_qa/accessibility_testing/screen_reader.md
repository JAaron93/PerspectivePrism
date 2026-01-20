# Accessibility Testing: Screen Reader Support

## Goal
Verify that the Perspective Prism extension is fully accessible to screen reader users (NVDA, VoiceOver, JAWS), complying with WCAG 2.1 guideline 4.1.2 (Name, Role, Value) and 1.3.1 (Info and Relationships).

## Tools
- **Windows:** NVDA (NonVisual Desktop Access) or JAWS.
- **macOS:** VoiceOver (Command + F5 to toggle).

## Checkpoints

### 1. Analysis Button
- **Role:** Should be announced as a "button".
- **Label:** Should have a clear, descriptive label like "Analyze Video with Perspective Prism" or similar. It should not just say "Button".
- **State:** If the button has states (loading, error), these should be announced or part of the label/description.

### 2. Live Region Announcements (The "Announcer")
The extension uses a hidden ARIA live region to announce dynamic updates without moving focus.

- **Action:** Click the "Analyze" button.
- **Expected Announcement:** "Analysis started" or "Analyzing video...".
- **Action:** Wait for analysis to complete.
- **Expected Announcement:** "Analysis complete. X claims found." or similar summary.
- **Action:** Trigger an error (e.g., disconnected network).
- **Expected Announcement:** "Analysis failed. [Error reason]."

### 3. Claims List
- **Roles:**
    - The claims container MUST use `role="list"`.
    - Each individual claim item MUST use `role="listitem"`.
- **Interactive Element (Disclosure Pattern):**
    - The interactive header for each claim MUST distinguish itself, typically using a child element with `role="button"`.
    - This button MUST use the `aria-expanded` attribute to indicate state (`true` for expanded, `false` for collapsed).
- **Keyboard Pattern (APG Alignment):**
    - **Focus Movement:** Use `Arrow Up/Down` to navigate between claim items (or `Tab` if naturally focusable).
    - **Toggle Expansion:** Use `Enter` or `Space` to toggle the claim open/closed.
    - *Note:* If adopting the **Disclosure** pattern (recommended), follow the specific APG Disclosure key handling. If adopting a **Tree** pattern (less common here), you would need `role="tree"`/`treeitem` semantics and `Arrow Right/Left` for expansion. Do not mix these patterns.
- **Announcements & Focus:**
    - **State:** Toggling the button MUST trigger an immediate "Expanded" or "Collapsed" announcement via the `aria-expanded` state change.
    - **Focus Management:** Ensure focus remains clearly visible on the trigger element at all times.

### 4. Headings and Structure
- Navigate using the screen reader's "Headings" shortcut (e.g., `H` key in NVDA, `Control + Option + Command + H` in VoiceOver).
- **Verify:** The Analysis Panel has a logical heading structure (e.g., h2 for Title, h3 for "Claims", h3 for "Summary").

### 5. Dialog/Modal Behavior
- **Role & Modal Properties:**
    - The panel MUST use `role="dialog"` (or `role="alertdialog"` if strictly blocking).
    - It MUST have `aria-modal="true"` to indicate it covers other content.
- **Labeling:**
    - The dialog container MUST have an accessible name, e.g., via `aria-label="Perspective Prism Analysis"` or `aria-labelledby="[ID of title element]"`.
    - **Verify:** Screen reader announces "Perspective Prism Analysis, Dialog" (or similar) upon opening.
- **Background Interaction:**
    - While the dialog is open, the background content (YouTube page) MUST be inert.
    - **Implementation Check:** Verify that `aria-hidden="true"` is applied to the background container OR the `inert` attribute is used on the background.
    - **Verify:** Screen reader cursor does not accidentally navigate into the video player or comments while the panel is open.

## Common Issues to Watch For
- **Silence on Updates:** Loading finishes but screen reader says nothing.
- **Trapped Focus without Announcement:** Focus moves but user doesn't know where they are.
- **Redundant Announcements:** "Button button click to analyze button".
