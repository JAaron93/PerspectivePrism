# Cache Persistence - Quick Reference

## One-Minute Test

```
1. Analyze a video → Wait for results
2. Close Chrome completely
3. Reopen Chrome
4. Go to same video → Click "Analyze Video"
5. ✅ Results appear instantly (< 500ms)
```

## Verify Cache Entry

// Check if video is cached
// Replace {videoId} with actual video ID (e.g., 'dQw4w9WgXcQ')
const videoId = 'dQw4w9WgXcQ'; // Replace with actual video ID
chrome.storage.local.get(`cache_${videoId}`, (result) => {
console.log(result[`cache_${videoId}`] ? '✅ Cached' : '❌ Not cached');
});

## Check All Cache Entries

```javascript
chrome.storage.local.get(null, (items) => {
  const cacheKeys = Object.keys(items).filter((k) => k.startsWith("cache_"));
  console.log(`${cacheKeys.length} videos cached`);
});
```

## Clear Cache

```javascript
chrome.storage.local.get(null, (items) => {
  const cacheKeys = Object.keys(items).filter((k) => k.startsWith("cache_"));
  chrome.storage.local.remove(cacheKeys, () => {
    console.log("Cache cleared");
  });
});
```

## Expected Console Logs

### Cache Hit

```
[PerspectivePrismClient] Cache hit for {videoId}
[PerspectivePrismClient] Returning cached data for {videoId}
```

### Cache Miss

```
[PerspectivePrismClient] Cache miss for {videoId}
[PerspectivePrismClient] Fetching fresh analysis for {videoId}
```

### Cache Expired

```
[PerspectivePrismClient] Cache expired for {videoId}
[PerspectivePrismClient] Removing expired entry
```

## Common Issues

### Cache Not Persisting

- Check: Is caching enabled in settings?
- Check: Is `chrome.storage.local` available?
- Check: Are there any console errors?

### Results Not Appearing

- Check: Is cache entry expired? (> 24 hours)
- Check: Was cache cleared manually?
- Check: Is video ID correct?

### Slow Cache Retrieval

- Check: Is entry very large? (> 1 MB)
- Check: Is storage quota exceeded?
- Check: Are there many cache entries? (> 100)

## Test Checklist

- [ ] Basic restart (close/reopen browser)
- [ ] System reboot
- [ ] Extension update
- [ ] Cache expiration (24 hours)
- [ ] Multiple videos
- [ ] Large datasets
- [ ] Browser crash recovery

## Success Indicators

✅ Results appear within 500ms
✅ No network request to backend
✅ Console shows "Cache hit"
✅ All claims are identical to original
✅ Timestamp shows original analysis time

## Failure Indicators

❌ Results take > 500ms to appear
❌ Network request is made
❌ Console shows "Cache miss"
❌ Claims are different or missing
❌ Error messages in console

## Quick Debugging

## Related Files

- `chrome-extension/client.js` - Cache implementation
- `chrome-extension/background.js` - Service worker
- `chrome-extension/config.js` - Cache settings

## Full Documentation

See [TEST_GUIDE.md](./TEST_GUIDE.md) for comprehensive test scenarios and detailed instructions.
