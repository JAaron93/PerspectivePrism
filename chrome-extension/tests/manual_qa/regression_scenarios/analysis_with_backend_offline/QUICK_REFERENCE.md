# Quick Reference: Backend Offline Testing

## 🚀 Quick Start (30 seconds)

```bash
# 1. Stop backend
pkill -f uvicorn

# 2. Open YouTube video
# https://www.youtube.com/watch?v=dQw4w9WgXcQ

# 3. Click "Analyze Video" button

# 4. Verify error message:
# "Cannot connect to Perspective Prism. Check your backend URL in settings."

# 5. Start backend
cd backend && uvicorn app.main:app --reload

# 6. Click "Retry" button

# 7. ✅ Analysis should complete successfully
```

## 📋 Expected Error Messages

| Scenario | Error Message |
|----------|---------------|
| **Backend Offline** | "Cannot connect to Perspective Prism. Check your backend URL in settings." |
| **Timeout** | "The analysis took too long. Please try again later." |
| **Server Error** | "Our servers are experiencing issues. Please try again later." |
| **Too Many Requests** | "Too many requests. Please wait a moment and try again." |

## 🎯 Key Test Points

- [ ] Error message appears (not crash)
- [ ] Message is user-friendly
- [ ] Retry button works
- [ ] Settings button opens options
- [ ] Extension stays responsive
- [ ] No console errors

## 🔧 Troubleshooting

### Backend won't stop
```bash
ps aux | grep uvicorn
kill -9 <PID>
```

### Extension not responding
1. `chrome://extensions/`
2. Click "Reload" on Perspective Prism
3. Refresh YouTube page

### Clear extension state
```javascript
// In DevTools console
chrome.storage.local.clear();
chrome.storage.sync.clear();
```

## 📁 Test Files

| File | Purpose |
|------|---------|
| `test-backend-offline.html` | Interactive test page |
| `TEST_PLAN.md` | Detailed test scenarios |
| `TEST_RESULTS_TEMPLATE.md` | Results documentation |
| `README.md` | Complete guide |

## ✅ Pass Criteria

All must be true:
- Error detected when backend offline
- User-friendly error message shown
- Retry button works
- Settings link works
- Extension recovers when backend online
- No console errors
- Extension stays responsive

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| No error message | Check console for JS errors |
| Wrong error message | Verify backend URL in settings |
| Extension frozen | Reload extension |
| Can't stop backend | Use `kill -9` command |

## 📞 Need Help?

- Full guide: `README.md`
- Test plan: `TEST_PLAN.md`
- Manual testing guide: `../../MANUAL_TESTING_GUIDE.md`
- Design doc: `.kiro/specs/youtube-chrome-extension/design.md`
