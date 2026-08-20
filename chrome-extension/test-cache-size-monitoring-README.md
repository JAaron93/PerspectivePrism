# Cache Size Monitoring Test

## Overview

This test page (`test-cache-size-monitoring.html`) provides an interactive interface for testing and verifying the cache size monitoring functionality of the Perspective Prism Chrome Extension.

## Features

### Real-Time Metrics Display

- **Cache Entries**: Total number of cached analysis results
- **Total Size**: Storage space used by cache (in MB)
- **Quota Usage**: Percentage of available storage quota used
- **Status Level**: Current quota status (normal/warning/critical)

### Cache Hit/Miss Statistics

- **Cache Hits**: Number of times cached data was used
- **Cache Misses**: Number of times fresh analysis was required
- **Hit Rate**: Percentage of requests served from cache
- **Total Requests**: Combined hits and misses

### Storage Usage History

- Timeline of quota snapshots showing storage growth over time
- Includes timestamp, used space (MB), usage percentage, and level
- Limited to last 100 snapshots for performance

### Eviction Event Log

- Detailed log of cache eviction events
- Shows which entries were evicted, when, and why
- Displays freed space and eviction reason (quota_pressure, lru, expiration)

## How to Use

### 1. Open the Test Page

```bash
# From the chrome-extension directory
open test-cache-size-monitoring.html
# Or navigate to it in Chrome
```

### 2. Initialize

The page automatically initializes when loaded:
- Connects to the extension's client
- Loads current metrics
- Displays initial status

### 3. Test Actions

#### Add Mock Cache Entries
- Click "Add 5/10/20 Mock Entries" to simulate cached analysis results
- Useful for testing storage growth and quota monitoring
- Each entry contains realistic mock data structure

#### Record Quota Snapshot
- Click "Record Snapshot" to manually capture current storage state
- Snapshots appear in the Storage Usage History table
- Useful for tracking storage changes over time

#### Simulate Cache Operations
- Click "Simulate Cache Hit" to record a cache hit event
- Click "Simulate Cache Miss" to record a cache miss event
- Useful for testing hit/miss rate calculations

#### Clear Metrics
- Click "Clear All Metrics" to reset all tracking data
- Does NOT clear cached analysis results
- Useful for starting fresh tests

#### Clear Cache
- Click "Clear Cache" to remove all cached analysis results
- Also resets storage metrics
- Useful for testing from empty state

### 4. Refresh Data

- Click any "Refresh" button to update the displayed metrics
- Data updates automatically after test actions
- Manual refresh useful for checking persistence

## Test Scenarios

### Scenario 1: Basic Monitoring

1. Open test page
2. Add 5 mock entries
3. Verify metrics update (entries, size, quota usage)
4. Record a quota snapshot
5. Verify snapshot appears in history

**Expected**: All metrics display correctly, snapshot recorded

### Scenario 2: Hit/Miss Tracking

1. Simulate 10 cache hits
2. Simulate 5 cache misses
3. Refresh hit/miss stats
4. Verify hit rate = 66.67%

**Expected**: Accurate hit rate calculation

### Scenario 3: Quota Levels

1. Add entries until quota usage reaches 80%
2. Verify progress bar turns orange (warning)
3. Add more entries until usage reaches 95%
4. Verify progress bar turns red (critical)

**Expected**: Color changes at correct thresholds

### Scenario 4: Eviction Events

1. Fill storage to 95%+ capacity
2. Try to add more entries
3. Verify eviction events appear
4. Check evicted video IDs and freed space

**Expected**: LRU eviction occurs, events logged

### Scenario 5: Persistence

1. Record various metrics
2. Close test page
3. Reopen test page
4. Verify metrics persist

**Expected**: All metrics retained across sessions

## Troubleshooting

### Page Won't Load
- Ensure extension is loaded in Chrome
- Check console for errors
- Verify `client.js`, `quota-manager.js`, and `metrics-tracker.js` are present

### Metrics Show "-" or 0
- Extension may not be initialized
- Check that backend URL is configured
- Try refreshing the page

### Quota Always 0%
- No cache entries exist yet
- Try adding mock entries
- Verify `client.getStats()` is working

### Evictions Not Happening
- Storage must be near capacity (>95%)
- Add more mock entries to fill storage
- Check QuotaManager is initialized

## Technical Details

### Classes Used

- **PerspectivePrismClient**: Main client for cache operations
- **MetricsTracker**: Tracks hit/miss rates, evictions, quota snapshots
- **QuotaManager**: Monitors storage quota and triggers evictions

### Storage Keys

- `cache_{videoId}_{contentHash}`: Content-hashed cache entries (and legacy `cache_{videoId}`)
- `cache_metadata`: Cache statistics
- `cache_metrics`: Metrics tracking data

### Quota Thresholds

- **Normal**: < 80% usage (blue progress bar)
- **Warning**: 80-95% usage (orange progress bar)
- **Critical**: > 95% usage (red progress bar)

### Metrics Limits

- Maximum 100 quota snapshots retained
- Maximum 100 eviction events retained
- Older entries automatically pruned

## Related Documentation

- `tests/manual_qa/performance_testing/cache_size_monitoring.md` - Detailed test procedures
- `MANUAL_TESTING_GUIDE.md` - Overall testing guide
- `chrome-extension/metrics-tracker.js` - MetricsTracker implementation
- `chrome-extension/quota-manager.js` - QuotaManager implementation

## Success Criteria

✅ All metrics display correctly
✅ Hit/miss rates calculate accurately
✅ Storage usage tracked over time
✅ Quota levels detected at correct thresholds
✅ Eviction events logged with details
✅ Metrics persist across sessions
✅ Progress bar updates and changes color
✅ All test actions work without errors

## Notes

- This is a development/testing tool, not part of the production extension
- Mock entries use realistic data structures but fake content
- Quota limits vary by browser (typically 5-10 MB for local storage)
- Eviction uses LRU (Least Recently Used) strategy

## Support

For issues or questions:
1. Check console for error messages
2. Review the detailed test guide
3. Verify extension is properly loaded
4. Check that all required files are present
