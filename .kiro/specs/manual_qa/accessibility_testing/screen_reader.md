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
- **Role:** The claims container should have a role of `region` or `list`, and individual claims `article` or `listitem`.
- **Navigation:**
    - When navigating to a claim, it should announce "Claim X of Y: [Claim Text]".
    - The state of the claim (Expanded/Collapsed) must be announced.
- **Expansion:**
    - **Action:** Expand a claim (Right Arrow).
    - **Expected Announcement:** "Expanded" followed by the content (Perspectives, Bias indicators).
    - **Action:** Collapse a claim (Left Arrow).
    - **Expected Announcement:** "Collapsed".

### 4. Headings and Structure
- Navigate using the screen reader's "Headings" shortcut (e.g., `H` key in NVDA, `Control + Option + Command + H` in VoiceOver).
- **Verify:** The Analysis Panel has a logical heading structure (e.g., h2 for Title, h3 for "Claims", h3 for "Summary").

### 5. Dialog/Modal Behavior
- When the panel opens, the screen reader should announce it as a "Dialog" or "Region" with the title "Perspective Prism Analysis".
- Background content (the rest of the YouTube page) should be virtually hidden or inert while the modal is open (depending on implementation strictly as a modal vs a panel). If completely modal, background shouldn't be accessible.

## Common Issues to Watch For
- **Silence on Updates:** Loading finishes but screen reader says nothing.
- **Trapped Focus without Announcement:** Focus moves but user doesn't know where they are.
- **Redundant Announcements:** "Button button click to analyze button".
