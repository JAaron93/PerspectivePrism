# Perspective Prism Extension - Styling Guide

## Overview

This document describes the styling system for the Perspective Prism Chrome Extension, covering both the popup and options pages.

## Design System

### Color Palette

#### Primary Colors

- **Primary Blue**: `#2196f3` - Main brand color, used for primary actions and focus states
- **Primary Blue (Hover)**: `#1976d2` - Darker shade for hover states
- **Primary Blue (Active)**: `#1565c0` - Even darker for active/pressed states

#### Semantic Colors

- **Success Green**: `#4caf50` - Success states, positive feedback
- **Warning Orange**: `#ff9800` - Warnings, caution messages
- **Error Red**: `#f44336` - Errors, destructive actions
- **Info Blue**: `#2196f3` - Informational messages. _Note: Intentionally matches Primary Blue for visual consistency, but should be implemented as a separate semantic token (`--color-info`) to allow future divergence._

#### Neutral Colors

- **Text Primary**: `#333` - Main text color
- **Text Secondary**: `#666` - Secondary text, descriptions
- **Text Tertiary**: `#999` - Disabled text, placeholders
- **Background**: `#fff` - Main background
- **Background Secondary**: `#f9f9f9` - Page background (options)
- **Border**: `#ddd` - Default borders
- **Border Hover**: `#999` - Hover state borders

### Typography

#### Font Family

```css
font-family:
  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
  Cantarell, "Helvetica Neue", sans-serif;
```

#### Font Sizes

- **Heading 1**: 28px (options), 18px (popup)
- **Heading 2**: 18px (section titles)
- **Body**: 14px
- **Small**: 13px (descriptions)
- **Extra Small**: 12px (details, hints)

#### Font Weights

- **Regular**: 400
- **Medium**: 500 (labels, buttons)
- **Semibold**: 600 (headings, primary buttons)

### Spacing

#### Padding/Margin Scale

- **XS**: 4px
- **SM**: 8px
- **MD**: 12px
- **LG**: 16px
- **XL**: 24px
- **2XL**: 32px

### Border Radius

- **Small**: 4px (messages)
- **Medium**: 6px (inputs, buttons, cards)
- **Large**: 8px (sections)

## Accessibility Features

### Touch Targets

All interactive elements (buttons, inputs, checkboxes) have a minimum height of **44px** to meet WCAG 2.1 Level AA requirements for touch target size.

### Focus Indicators

All interactive elements have visible focus indicators:

- **Outline**: 2px solid `#2196f3`
- **Outline Offset**: 2px
- **Box Shadow**: `0 0 0 4px rgba(33, 150, 243, 0.1)`

Focus indicators are only shown for keyboard navigation (`:focus-visible` support).

### Color Contrast

All text meets WCAG AA standards:

- **Normal Text**: Minimum 4.5:1 contrast ratio
- **Large Text**: Minimum 3:1 contrast ratio
- **UI Components**: Minimum 3:1 contrast ratio

### Screen Reader Support

- `.sr-only` class for screen reader-only content
- Proper ARIA labels on all interactive elements
- Live regions for dynamic content updates
- Semantic HTML structure

### Reduced Motion

Users who prefer reduced motion see minimal animations:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### High Contrast Mode

Enhanced borders and indicators for high contrast mode:

```css
@media (prefers-contrast: high) {
  button,
  input {
    border-width: 3px;
  }
}
```

## Component Styles

### Buttons

#### Primary Button

```html
<button class="primary">Save Settings</button>
```

- Background: `#2196f3`
- Color: `#fff`
- Font Weight: 600

#### Secondary Button

```html
<button class="secondary">Test Connection</button>
```

- Background: `#fff`
- Color: `#2196f3`
- Border: `#2196f3`

#### Danger Button

```html
<button class="danger">Clear Cache</button>
```

- Color: `#f44336`
- Border: `#f44336`
- Hover Background: `#ffebee`

#### Loading State

```html
<button class="loading">Processing...</button>
```

Automatically shows spinner before text.

### Form Elements

#### Text Input

```html
<input type="text" id="backend-url" />
```

#### Error State

```html
<input type="text" class="error" />
```

- Border: `#f44336`
- Background: `#fff5f5`

#### Success State

```html
<input type="text" class="success" />
```

- Border: `#4caf50`
- Background: `#f5fff5`

#### Focus State

- **Outline**: `2px solid #2196f3`
- **Outline Offset**: `2px`
- **Box Shadow**: `0 0 0 4px rgba(33, 150, 243, 0.1)`

**Dark Mode Variants**:

- **Outline**: `2px solid #90caf9`
- **Box Shadow**: `0 0 0 4px rgba(144, 202, 249, 0.2)`

> **Precedence Note**: Focus styles take precedence over validation states for accessibility. When an element is focused, the focus ring (outline and box-shadow) must be visible regardless of whether the element is in an error or success state. The validation border color should remain, but the focus indicators should be added on top.

### Validation Messages

#### Error Message

```html
<div class="error-message visible">Error message text</div>
```

#### Success Message

```html
<div class="success-message visible">Success message text</div>
```

#### Warning Message

```html
<div class="warning-message">Warning message text</div>
```

### Status Indicators

#### Popup Status

```html
<div id="status" class="info|success|warning|error">
  <span id="status-icon">ℹ️</span>
  <span id="status-message">Message</span>
  <div id="status-details">Details</div>
</div>
```

### Progress Bar

```html
<div id="progress-container">
  <div id="progress-bar" role="progressbar" aria-valuenow="50">
    <div id="progress-fill" style="width: 50%"></div>
  </div>
  <div id="progress-text">50%</div>
</div>
```

## Responsive Design

### Popup

- Fixed width: 320px
- Minimum height: 400px
- Optimized for extension popup viewport

### Options Page

- Maximum width: 800px
- Centered layout
- Responsive breakpoint at 600px:
  - Stacked button groups
  - Full-width inputs
  - Reduced padding

## Dark Mode Support

Both popup and options pages support dark mode via `prefers-color-scheme: dark`:

### Dark Mode Colors

- **Background**: `#121212` (page), `#1e1e1e` (cards)
- **Text**: `#e0e0e0` (primary), `#b0b0b0` (secondary)
- **Inputs**: `#2a2a2a` background, `#444` border
- **Buttons**: `#2a2a2a` background, `#444` border

## Loading States

### Spinner

```html
<span class="spinner"></span>
```

Animated circular spinner that inherits current text color.

### Button Loading

```html
<button class="loading">Loading...</button>
```

or

```javascript
button.innerHTML = '<span class="spinner"></span> Loading...';
```

## Best Practices

### Consistent Branding

1. Always use the defined color palette
2. Maintain consistent spacing using the spacing scale
3. Use semantic color classes (primary, success, error, warning)
4. Keep typography consistent across pages

### Validation Styling

1. Show error state on inputs with `.error` class
2. Display error messages with `.error-message.visible`
3. Clear error states when user corrects input
4. Provide success feedback after successful actions

### Loading States

1. Disable buttons during async operations
2. Show spinner for operations > 500ms
3. Provide progress feedback for long operations
4. Re-enable buttons after completion

### Accessibility

1. Always include ARIA labels on interactive elements
2. Ensure keyboard navigation works properly
3. Test with screen readers
4. Verify color contrast ratios
5. Support reduced motion preferences

## File Structure

```
chrome-extension/
├── popup.html          # Popup HTML structure
├── popup.css           # Popup styles
├── popup.js            # Popup functionality
├── options.html        # Options page HTML structure
├── options.css         # Options page styles
├── options.js          # Options page functionality
└── STYLING_GUIDE.md    # This file
```

## Testing Checklist

- [ ] All buttons have minimum 44px height
- [ ] Focus indicators visible on keyboard navigation
- [ ] Color contrast meets WCAG AA standards
- [ ] Validation errors display correctly
- [ ] Loading states work properly
- [ ] Dark mode renders correctly
- [ ] Reduced motion preference respected
- [ ] High contrast mode supported
- [ ] Responsive layout works at all sizes
- [ ] Screen reader announces changes correctly

## Future Enhancements

1. **Theming System**: Allow users to customize colors
2. **Animation Library**: Consistent micro-interactions
3. **Component Library**: Reusable UI components
4. **CSS Variables**: Dynamic theming support
5. **RTL Support**: Right-to-left language support
