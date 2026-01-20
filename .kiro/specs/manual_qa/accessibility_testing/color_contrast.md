# Accessibility Testing: Color Contrast

## Goal
Verify that text and interactive elements have sufficient contrast against their background, ensuring readability for users with low vision, complying with WCAG 2.1 guideline 1.4.3 (Contrast Minimum).

## Standards (WCAG AA)
- **Normal Text:** Contrast ratio of at least **4.5:1**.
- **Large Text (18pt+ or 14pt bold+):** Contrast ratio of at least **3:1**.
- **UI Components & Icons:** Contrast ratio of at least **3:1**.

## Tools
- **WebAIM Contrast Checker:** [https://webaim.org/resources/contrastchecker/](https://webaim.org/resources/contrastchecker/)
- **Chrome DevTools:** Inspect element -> View "Contrast" in the Styles pane color picker.
- **CCA (Colour Contrast Analyser):** Desktop application for sampling screen colors.

## Checkpoints

### 1. Panel Text (Light Mode)
- **Background:** White (`#FFFFFF` or similar).
- **Body Text:** Dark Gray/Black. Check hex codes.
- **Secondary Text:** (e.g., timestamps, confidence percentages). Ensure it is not too light.
- **Link Colors:** Blue/Accent colors must pass 4.5:1 against white.

### 2. Panel Text (Dark Mode)
- **Background:** Dark Gray (`#0F0F0F` or similar YouTube dark theme).
- **Body Text:** Light Gray/White.
- **Secondary Text:** Ensure it is legible against the dark background.

### 3. Interactive Elements
- **Analysis Button:**
    - Button background vs. surrounding YouTube header.
    - Button text vs. Button background.
- **Focus Indicators:** The outline color used for keyboard focus (usually blue/white) must have 3:1 contrast against the element it surrounds.
- **Confidence Bars:** The colored bars (Green/Red/Orange) should have sufficient contrast against the panel background to be visible, although "meaningful" graphics are strict, typically 3:1 is good practice.

### 4. Semantic Color Usage
- **Verify:** Color is not the *only* means of conveying information.
    - *Bad:* "True claims are green, false are red."
    - *Good:* "True claims have a checkmark icon and text 'Supported', false have an 'X' icon and text 'Refuted'."
    - **Test:** View the panel in Grayscale mode (System Settings -> Accessibility -> Display -> Color Filters -> Grayscale). Can you still distinguish between supported/refuted claims?
