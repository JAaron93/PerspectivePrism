# Manual Testing Guide: YouTube Light Theme Support

## Overview
This guide provides step-by-step instructions for manually testing the Perspective Prism Chrome Extension with YouTube's light theme.

## Prerequisites
- Chrome browser (latest version recommended)
- Perspective Prism Chrome Extension installed
- Backend server running (or configured backend URL)
- YouTube account (optional, but recommended for full testing)

## Test Objective
Verify that the extension's UI elements (Analysis Button and Analysis Panel) display correctly and maintain proper contrast/readability when YouTube is in light theme mode.

## Implementation Details

### Theme Detection Logic
The extension detects YouTube's theme by checking:
```javascript
const isDarkMode = document.documentElement.hasAttribute('dark') || 
                   document.documentElement.getAttribute('theme') === 'dark';
```

- **Dark Mode**: When either condition is true, the `dark-mode` class is added to the panel
- **Light Mode**: When both conditions are false (default), the panel uses light theme styles

### Light Theme Styles

#### Analysis Button (Light Mode)
- Background: `#f1f1f1` (light gray)
- Text color: `#0f0f0f` (near black)
- Hover: `#d9d9d9` (darker gray)
- Focus outline: `#0551b4` (blue)

#### Analysis Panel (Light Mode)
- Background: `#ffffff` (white)
- Text color: `#0f0f0f` (near black)
- Header background: `#f9f9f9` (very light gray)
- Border colors: `#e5e5e5` (light gray)
- Confidence bars: `#065fd4` (blue)

## Testing Steps

### Step 1: Enable YouTube Light Theme
1. Open YouTube (https://www.youtube.com)
2. Click on your profile icon (top right)
3. Click "Appearance"
4. Select "Light" theme
5. Verify the page background is white/light colored

### Step 2: Navigate to a Test Video
1. Navigate to any YouTube video with a transcript
   - Recommended test video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
   - Or any video you know has captions/transcript available
2. Wait for the page to fully load

### Step 3: Verify Analysis Button Appearance
Check the following for the "Analyze Video" button:

- [ ] **Button is visible** near the video player controls (below video, with Like/Share buttons)
- [ ] **Background color** is light gray (`#f1f1f1`)
- [ ] **Text color** is dark/black (`#0f0f0f`)
- [ ] **Text is readable** with good contrast against background
- [ ] **Button matches YouTube's light theme** aesthetic
- [ ] **Hover state** changes background to darker gray (`#d9d9d9`)
- [ ] **Focus state** shows blue outline when tabbed to
- [ ] **Button is not cut off** or overlapping other elements

### Step 4: Test Analysis Flow
1. Click the "Analyze Video" button
2. Observe the loading state:
   - [ ] **Loading spinner** is visible and animating
   - [ ] **Loading text** is readable (dark text on light background)
   - [ ] **Panel background** is white (`#ffffff`)
   - [ ] **Panel header** has light gray background (`#f9f9f9`)

3. Wait for analysis to complete (or use a cached result)

### Step 5: Verify Analysis Panel Appearance
Once analysis results are displayed, check:

#### Panel Container
- [ ] **Panel background** is white
- [ ] **Panel text** is dark/black and readable
- [ ] **Panel shadow** is visible and subtle
- [ ] **Panel doesn't blend** into YouTube's light background

#### Panel Header
- [ ] **Header background** is light gray (`#f9f9f9`)
- [ ] **Title text** is dark and readable
- [ ] **Close button (X)** is visible and dark colored
- [ ] **Refresh button** is visible and dark colored
- [ ] **Badge** (Cached/Fresh) has appropriate light theme colors

#### Claim Cards
- [ ] **Card backgrounds** are white
- [ ] **Card borders** are light gray and visible
- [ ] **Claim text** is dark and readable
- [ ] **Expand/collapse arrow** is visible
- [ ] **Hover effect** on cards is subtle and visible

#### Perspectives Section
- [ ] **Section titles** are readable (gray text)
- [ ] **Perspective names** are readable
- [ ] **Confidence bars** are blue (`#065fd4`)
- [ ] **Confidence percentages** are readable

#### Bias Indicators
- [ ] **Bias tags** have light gray backgrounds
- [ ] **Tag text** is readable
- [ ] **Deception score bar** is visible with appropriate colors

#### Assessment Badges
- [ ] **High confidence badge**: Light green background, dark green text
- [ ] **Medium confidence badge**: Light yellow background, dark orange text
- [ ] **Low confidence badge**: Light red background, dark red text
- [ ] **All badge text** is readable with good contrast

### Step 6: Test Interactive Elements
1. **Expand/Collapse Claims**:
   - [ ] Click claim headers to expand/collapse
   - [ ] Animation is smooth (or disabled if reduced motion)
   - [ ] Arrow icon rotates appropriately

2. **Scroll Panel**:
   - [ ] Scrollbar is visible when content overflows
   - [ ] Scrollbar thumb is light gray and visible
   - [ ] Scrolling is smooth

3. **Refresh Button**:
   - [ ] Click refresh button
   - [ ] Loading overlay appears with light theme colors
   - [ ] Overlay background is semi-transparent white

4. **Close Button**:
   - [ ] Click close button
   - [ ] Panel closes smoothly
   - [ ] Focus returns to Analysis Button

### Step 7: Test Error States
1. **Trigger an error** (e.g., disconnect backend or use invalid URL)
2. Click "Analyze Video" button
3. Verify error state:
   - [ ] **Error icon** is visible
   - [ ] **Error title** is red and readable
   - [ ] **Error message** is gray and readable
   - [ ] **Retry button** is blue with white text
   - [ ] **Close button** is light gray with dark text

### Step 8: Test Empty State
1. If possible, test with a video that has no claims
2. Verify empty state:
   - [ ] **Empty state message** is gray and readable
   - [ ] **Message is centered** in panel

### Step 9: Verify Color Contrast (WCAG AA)
Use browser DevTools or a contrast checker tool:

- [ ] **Button text vs background**: Minimum 4.5:1 ratio
- [ ] **Panel text vs background**: Minimum 4.5:1 ratio
- [ ] **Section titles vs background**: Minimum 4.5:1 ratio
- [ ] **Badge text vs badge background**: Minimum 4.5:1 ratio
- [ ] **Error text vs background**: Minimum 4.5:1 ratio

### Step 10: Test Responsive Behavior
1. **Resize browser window** to different widths:
   - [ ] **Desktop (1200px+)**: Panel is 480px wide
   - [ ] **Tablet (768px-1199px)**: Panel is 400px wide
   - [ ] **Mobile (< 768px)**: Panel adapts to screen width
   - [ ] **All sizes**: Text remains readable, no overflow

### Step 11: Compare with Dark Theme
1. Switch YouTube to dark theme (Profile > Appearance > Dark)
2. Refresh the page
3. Click "Analyze Video" again
4. Verify that:
   - [ ] **Panel switches to dark theme** automatically
   - [ ] **Button switches to dark theme** automatically
   - [ ] **No light theme artifacts** remain visible

5. Switch back to light theme
6. Refresh the page
7. Verify that:
   - [ ] **Panel switches back to light theme** automatically
   - [ ] **Button switches back to light theme** automatically

## Expected Results

### ✅ Pass Criteria
- All checkboxes above are checked
- UI elements are clearly visible and readable in light theme
- Color contrast meets WCAG AA standards (4.5:1 minimum)
- No visual glitches or overlapping elements
- Theme detection works correctly (light vs dark)
- Interactive elements respond appropriately

### ❌ Fail Criteria
- Any UI element is invisible or unreadable in light theme
- Color contrast is insufficient (< 4.5:1)
- Panel blends into YouTube's background
- Theme detection fails (wrong theme applied)
- Visual glitches or layout issues

## Common Issues and Solutions

### Issue: Button is hard to see
**Solution**: Check that `content.css` is loaded and light theme styles are applied

### Issue: Panel text is unreadable
**Solution**: Verify that `panel-styles.js` is loaded and `:host` styles (not `:host(.dark-mode)`) are applied

### Issue: Theme doesn't match YouTube
**Solution**: Check browser console for errors in theme detection logic

### Issue: Colors look wrong
**Solution**: Clear browser cache and reload extension

## Reporting Issues

If you find any issues during testing, please report them with:
1. **Screenshot** of the issue
2. **Browser version** (chrome://version)
3. **YouTube URL** where issue occurred
4. **Steps to reproduce**
5. **Expected vs actual behavior**

## Test Completion

Once all steps are completed and all checkboxes are checked:
1. Mark the task as complete in `tasks.md`
2. Document any issues found
3. If issues are found, create follow-up tasks to fix them

---

**Test Date**: _____________
**Tester**: _____________
**Result**: ⬜ Pass ⬜ Fail ⬜ Pass with minor issues
**Notes**: _____________________________________________
