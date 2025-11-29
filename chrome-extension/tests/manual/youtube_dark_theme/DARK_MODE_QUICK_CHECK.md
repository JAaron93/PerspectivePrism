# Dark Mode Quick Check Guide

## Quick Verification Steps

### 1. Enable YouTube Dark Theme
1. Go to YouTube
2. Profile icon → Appearance → Dark theme

### 2. Test Button
1. Navigate to any video
2. Verify "Analyze Video" button appears with dark styling:
   - Dark gray background (#272727)
   - Light text (#f1f1f1)

### 3. Test Panel
1. Click "Analyze Video"
2. Verify panel appears with dark styling:
   - Dark background (#212121)
   - Light text (#f1f1f1)
   - Dark claim cards (#181818)

### 4. Test Interactions
1. Hover over button → background darkens
2. Hover over claims → subtle highlight
3. Expand/collapse claims → smooth animation
4. Check scrollbar → dark gray thumb

## Console Verification

Run in browser console on YouTube:

```javascript
// Check if dark mode is detected
const isDark = document.documentElement.hasAttribute('dark') || 
               document.documentElement.getAttribute('theme') === 'dark';
console.log('Dark mode detected:', isDark);

// Check if button has correct styles
const button = document.querySelector('[data-pp-analysis-button]');
if (button) {
  const styles = window.getComputedStyle(button);
  console.log('Button background:', styles.backgroundColor);
  console.log('Button color:', styles.color);
}

// Check if panel has dark-mode class
const panel = document.querySelector('#pp-analysis-panel');
if (panel && panel.shadowRoot) {
  const host = panel.shadowRoot.host;
  console.log('Panel has dark-mode class:', host.classList.contains('dark-mode'));
}
```

## Visual Checklist

Quick visual inspection:

- [ ] Button blends with YouTube's dark UI
- [ ] Panel is clearly visible but not jarring
- [ ] Text is readable (good contrast)
- [ ] No white flashes or light mode elements
- [ ] Hover states are visible
- [ ] Focus outlines are visible (light blue)
- [ ] Scrollbar is visible but subtle

## Common Issues

**Button appears light:**
- Check if `content.css` is loaded
- Verify `html[dark]` selector in CSS

**Panel appears light:**
- Check if `dark-mode` class is applied to panel host
- Verify Shadow DOM styles include dark mode CSS
- Check console for errors

**Colors don't match YouTube:**
- YouTube may have updated their palette
- Compare with YouTube's actual colors
- Update CSS if needed

## Pass Criteria

✅ **PASS** if:
- All elements use dark colors
- Text is readable (contrast ≥ 4.5:1)
- No visual glitches
- Matches YouTube's dark aesthetic

❌ **FAIL** if:
- Any element appears in light mode
- Text is hard to read
- Visual glitches present
- Doesn't match YouTube's theme

---

**Quick Test Time:** ~2-3 minutes  
**Full Test Time:** ~15-20 minutes (see DARK_THEME_TEST.md)
