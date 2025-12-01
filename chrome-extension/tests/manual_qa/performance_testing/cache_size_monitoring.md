# Cache Size Monitoring - Manual Test Guide

## Test Objective

Verify that the extension properly tracks storage usage over time, logs eviction events, and monitors cache hit/miss rates.

## Prerequisites

- Extension loaded in Chrome
- Backend configured and running
- Chrome DevTools open (Console tab)

## Test Procedure

### 1. Initial Setup

1. Open the test page: `chrome-extension/test-cache-size-monitoring.html`
2. Verify the page loads without errors
3. Check that all metrics display initial values (0 or "-")

**Expected Result:**

- Page loads successfully
- All metric cards display default values
- No console errors

### 2. Test Cache Hit/Miss Tracking

**Steps:**

1. Click "Simulate Cache Hit" button 5 times
2. Click "Refresh Hit/Miss Stats" button
3. Note the hit rate percentage
4. Click "Simulate Cache Miss" button 3 times
5. Click "Refresh Hit/Miss Stats" button again

**Expected Result:**

- Cache Hits: 5
- Cache Misses: 3
- Total Requests: 8
- Hit Rate: 62.50%
- Miss Rate: 37.50%

**Verification:**

**Note:** Run this on `test-cache-size-monitoring.html` where `MetricsTracker` is available globally. If undefined, check `window.MetricsTracker` or ensure the script exposes it.

```javascript
// In console:
const tracker = new MetricsTracker();
tracker.getHitMissRate().then((stats) => console.log(stats));
// Should show: { hits: 5, misses: 3, total: 8, hitRate: '62.50', missRate: '37.50' }
```

### 3. Test Storage Usage Monitoring

**Steps:**

1. Click "Add 5 Mock Entries" button
2. Wait for success message
3. Click "Refresh Status" button
4. Note the storage metrics
5. Click "Record Snapshot" button
6. Click "Refresh History" button
7. Verify snapshot appears in history table

**Expected Result:**

- Total Entries increases by 5
- Total Size (MB) increases
- Quota Usage percentage increases
- Storage history table shows new snapshot with timestamp

**Verification:**

**Note:** Run this on `test-cache-size-monitoring.html` where `MetricsTracker` is available globally. If undefined, check `window.MetricsTracker` or ensure the script exposes it.

```javascript
// In console:
const tracker = new MetricsTracker();
tracker.getStorageHistory(10).then((history) => console.log(history));
// Should show array of snapshots with timestamps, usage, and levels
```

### 4. Test Quota Level Detection

**Steps:**

1. Note current quota usage percentage
2. Keep adding mock entries until usage reaches 80%+
3. Observe the progress bar color change to orange (warning)
4. Continue adding entries until usage reaches 95%+
5. Observe the progress bar color change to red (critical)

**Expected Result:**

- Progress bar is blue when usage < 80%
- Progress bar turns orange when usage >= 80% (warning level)
- Progress bar turns red when usage >= 95% (critical level)
- Status Level metric updates accordingly

### 5. Test Eviction Event Logging

**Steps:**

1. Fill storage to near capacity (95%+)
2. Try to add more mock entries
3. Click "Refresh Events" button
4. Verify eviction events appear in the table

**Expected Result:**

- Eviction events table shows entries
- Each event includes:
  - Timestamp
  - Count of evicted entries
  - Freed space in KB
  - Reason (e.g., "quota_pressure")
  - Video IDs that were evicted

**Verification:**

**Note:** Run this on `test-cache-size-monitoring.html` where `MetricsTracker` is available globally. If undefined, check `window.MetricsTracker` or ensure the script exposes it.

```javascript
// In console:
const tracker = new MetricsTracker();
tracker.getRecentEvictions(10).then((events) => console.log(events));
// Should show array of eviction events
```

### 6. Test Metrics Persistence

**Steps:**

1. Record several cache hits, misses, and snapshots
2. Close the test page
3. Reopen the test page
4. Click "Refresh Hit/Miss Stats" and "Refresh History"

**Expected Result:**

- All previously recorded metrics are still present
- Hit/miss counts persist across page reloads
- Storage history persists across page reloads
- Eviction events persist across page reloads

### 7. Test Metrics Reset

**Steps:**

1. Ensure there are metrics recorded (hits, misses, snapshots, evictions)
2. Click "Clear All Metrics" button
3. Confirm the action in the dialog
4. Click all refresh buttons

**Expected Result:**

- All metrics reset to 0
- Hit/miss stats show 0 hits, 0 misses, 0.00% rates
- Storage history table shows "No storage history recorded yet"
- Eviction events table shows "No eviction events recorded yet"

### 8. Test Real-World Scenario

**Steps:**

1. Navigate to a YouTube video
2. Click "Analyze Video" button
3. Wait for analysis to complete
4. Open test-cache-size-monitoring.html
5. Click "Refresh Status"
6. Verify cache entry appears in metrics

**Expected Result:**

- Total Entries shows at least 1
- Total Size shows non-zero value
- Quota usage percentage is > 0%

**Verification:**

```javascript
// In console on YouTube page:
chrome.runtime.sendMessage({ type: "GET_CACHE_STATS" }, (response) => {
  console.log("Cache stats:", response);
});
```

## Performance Criteria

### Storage Efficiency

- ✅ Cache entries are properly sized (not bloated)
- ✅ Metadata overhead is minimal
- ✅ Eviction frees appropriate amount of space

### Monitoring Accuracy

- ✅ Hit/miss rates calculated correctly
- ✅ Storage usage matches actual chrome.storage.local usage
- ✅ Quota levels (normal/warning/critical) trigger at correct thresholds

### Data Retention

- ✅ Metrics history limited to 100 entries (prevents unbounded growth)
- ✅ Old metrics automatically pruned
- ✅ Metrics persist across browser sessions

## Troubleshooting

### Metrics Not Updating

- Check console for errors
- Verify chrome.storage.local permissions
- Try clearing cache and reloading

### Quota Always Shows 0%

- Verify client.getStats() is working
- Check that cache entries are being created
- Ensure QuotaManager is initialized

### Eviction Events Not Appearing

- Storage must be near capacity (>95%) for evictions
- Add more mock entries to trigger eviction
- Check that QuotaManager.ensureSpace() is being called

## Success Criteria

- [ ] Cache hit/miss tracking works correctly
- [ ] Hit rate calculations are accurate
- [ ] Storage usage is tracked over time
- [ ] Quota snapshots are recorded
- [ ] Eviction events are logged with details
- [ ] Metrics persist across sessions
- [ ] Metrics can be reset
- [ ] Quota levels (normal/warning/critical) are detected correctly
- [ ] Progress bar updates and changes color appropriately
- [ ] All metrics display in human-readable format

## Notes

- The MetricsTracker keeps last 100 entries for each metric type
- Quota thresholds: Warning at 80%, Critical at 95%
- Chrome local storage quota is typically 5-10 MB
- Eviction uses LRU (Least Recently Used) strategy

## Related Files

- `chrome-extension/metrics-tracker.js` - MetricsTracker implementation
- `chrome-extension/quota-manager.js` - QuotaManager implementation
- `chrome-extension/test-cache-size-monitoring.html` - Interactive test page
- `chrome-extension/client.js` - Client integration with metrics

## Test Status

<!-- Use the template below to track test runs: -->

- **Last Tested:** [Date]
- **Tested By:** [Name]
- **Result:** [Pass/Fail]
- **Notes:** [Any observations or issues]
