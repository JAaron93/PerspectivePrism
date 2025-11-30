# Cache Persistence Across Browser Restarts - Manual Test Guide

## Overview

This document provides a comprehensive manual testing guide for verifying that the Perspective Prism Chrome extension correctly persists cached analysis results across browser restarts. The extension uses `chrome.storage.local` to store analysis results, which should survive browser restarts, system reboots, and extension updates.

## Background

### Why This Matters

Cache persistence is critical for user experience:

- **Instant Results**: Users expect previously analyzed videos to show results immediately
- **Bandwidth Savings**: Cached results avoid redundant API calls to the backend
- **Offline Access**: Cached results can be displayed even when the backend is unavailable
- **Cost Efficiency**: Reduces backend load and API costs

### How Cache Persistence Works

The extension implements persistent caching using Chrome's storage APIs:

1. **Storage Layer**: Uses `chrome.storage.local` (unlimited storage, persists across restarts)
2. **Cache Key Strategy**: Simple key format `cache_{videoId}` ensures one analysis per video
3. **Expiration**: Cached entries expire after 24 hours (configurable)
4. **Schema Versioning**: Supports migration of cache entries when data format changes
5. **Automatic Cleanup**: Expired entries are removed on extension startup

## Implementation Status

✅ **Fully Implemented** - Code is complete and ready for testing

### Key Files

- `chrome-extension/client.js` - PerspectivePrismClient class with cache methods
- `chrome-extension/background.js` - Service worker that manages cache operations
- `chrome-extension/config.js` - Configuration management including cache settings

### Key Methods

- `checkCache(videoId)` - Retrieves cached analysis data
- `saveToCache(videoId, data)` - Stores analysis results in cache
- `cleanupExpiredCache()` - Removes expired cache entries
- `migrateCacheEntry(entry)` - Migrates cache entries to current schema version

## Test Environment Setup

### Prerequisites

1. **Backend Running**: Ensure Perspective Prism backend is running on `http://localhost:8000`
2. **Extension Loaded**: Load the extension in Chrome (unpacked)
3. **DevTools Open**: Keep Chrome DevTools open to monitor console logs
4. **Test Videos**: Use multiple YouTube videos with transcripts for testing

### Configuration

1. Open extension options page
2. Set backend URL to `http://localhost:8000`
3. Enable caching (24 hours)
4. Save settings

### Initial State

Before starting tests, clear all cached data:

1. Open extension options page
2. Click "Clear All Cached Data" button
3. Verify cache is empty in DevTools console:
   ```javascript
   chrome.storage.local.get(null, (items) => {
     const cacheKeys = Object.keys(items).filter((k) => k.startsWith("cache_"));
     console.log("Cache entries:", cacheKeys.length); // Should be 0
   });
   ```

## Test Scenarios

### Test 1: Basic Cache Persistence After Browser Restart

**Objective**: Verify that cached analysis results persist after closing and reopening the browser

**Steps**:

1. **Analyze a Video**
   - Navigate to `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
   - Click the "Analyze Video" button
   - Wait for analysis to complete
   - Verify results are displayed in the panel
   - Note the timestamp: "Analyzed X minutes ago"

2. **Verify Cache Entry Created**
   - Open DevTools console
   - Run:
     ```javascript
     chrome.storage.local.get("cache_dQw4w9WgXcQ", (result) => {
       console.log("Cache entry:", result);
       console.log("Video ID:", result.cache_dQw4w9WgXcQ?.videoId);
       console.log(
         "Claims count:",
         result.cache_dQw4w9WgXcQ?.data?.claims?.length,
       );
       console.log("Timestamp:", new Date(result.cache_dQw4w9WgXcQ?.timestamp));
     });
     ```
   - Verify cache entry exists with correct data

3. **Close Browser Completely**
   - Close all Chrome windows
   - Wait 5 seconds to ensure clean shutdown

4. **Restart Browser**
   - Open Chrome again
   - Extension should load automatically

5. **Navigate to Same Video**
   - Go to `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
   - Click "Analyze Video" button

6. **Verify Cached Results Displayed**
   - Results should appear within 500ms (no network request)
   - Panel should show same claims as before
   - Timestamp should indicate "Analyzed X minutes ago" (time should have increased)
   - Check console for cache hit message:
     ```
     [PerspectivePrismClient] Cache hit for dQw4w9WgXcQ
     ```

**Expected Behavior**:

- ✅ Cache entry survives browser restart
- ✅ Results display immediately without network request
- ✅ Data integrity is maintained (same claims, same analysis)
- ✅ Timestamp reflects original analysis time

**Acceptance Criteria**:

- Results appear within 500ms
- No network request to `/analyze` endpoint
- All claims and perspectives are identical to original analysis
- Cache hit is logged in console

---

### Test 2: Multiple Cached Videos Persistence

**Objective**: Verify that multiple cached videos all persist across browser restart

**Steps**:

1. **Analyze Multiple Videos**
   - Analyze 5 different YouTube videos:
     - `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
     - `https://www.youtube.com/watch?v=jNQXAC9IVRw`
     - `https://www.youtube.com/watch?v=9bZkp7q19f0`
     - `https://www.youtube.com/watch?v=kJQP7kiw5Fk`
     - `https://www.youtube.com/watch?v=fJ9rUzIMcZQ`
   - Wait for each analysis to complete
   - Verify results for each video

2. **Verify All Cache Entries**
   - Open DevTools console
   - Run:
     ```javascript
     chrome.storage.local.get(null, (items) => {
       const cacheKeys = Object.keys(items).filter((k) =>
         k.startsWith("cache_"),
       );
       console.log("Total cache entries:", cacheKeys.length); // Should be 5
       cacheKeys.forEach((key) => {
         const entry = items[key];
         console.log(
           `${key}: ${entry.data.claims.length} claims, ${new Date(entry.timestamp).toLocaleString()}`,
         );
       });
     });
     ```

3. **Close and Restart Browser**
   - Close all Chrome windows
   - Wait 5 seconds
   - Reopen Chrome

4. **Verify All Videos Show Cached Results**
   - Navigate to each of the 5 videos
   - Click "Analyze Video" for each
   - Verify all show cached results immediately
   - Check console for 5 cache hit messages

**Expected Behavior**:

- ✅ All 5 cache entries survive browser restart
- ✅ Each video shows cached results immediately
- ✅ No data loss or corruption
- ✅ Cache statistics show correct count

**Acceptance Criteria**:

- All 5 videos show cached results
- Each result appears within 500ms
- No network requests for cached videos
- Cache metadata is accurate

---

### Test 3: Cache Persistence After System Reboot

**Objective**: Verify that cache survives a full system reboot (not just browser restart)

**Steps**:

1. **Analyze Videos**
   - Analyze 2-3 YouTube videos
   - Verify results are cached

2. **Verify Cache Entries**
   - Check storage as in previous tests
   - Note the video IDs and claim counts

3. **Reboot System**
   - Restart your computer completely
   - Wait for system to fully boot

4. **Open Browser and Extension**
   - Launch Chrome
   - Extension should load automatically

5. **Verify Cached Results**
   - Navigate to the previously analyzed videos
   - Click "Analyze Video" for each
   - Verify cached results are displayed

**Expected Behavior**:

- ✅ Cache survives system reboot
- ✅ All cached videos show results immediately
- ✅ No data corruption or loss

**Acceptance Criteria**:

- Cache entries persist across system reboot
- Results are identical to pre-reboot state
- No errors or warnings in console

---

### Test 4: Cache Expiration After 24 Hours

**Objective**: Verify that cached entries expire after the configured duration (24 hours)

**Steps**:

1. **Analyze a Video**
   - Navigate to a YouTube video
   - Click "Analyze Video"
   - Wait for results

2. **Manually Modify Cache Timestamp**
   - Open DevTools console
   - Run:
     ```javascript
     chrome.storage.local.get("cache_{videoId}", (result) => {
       const entry = result["cache_{videoId}"];
       // Set timestamp to 25 hours ago
       entry.timestamp = Date.now() - 25 * 60 * 60 * 1000;
       chrome.storage.local.set({ "cache_{videoId}": entry }, () => {
         console.log("Cache entry backdated to 25 hours ago");
       });
     });
     ```

3. **Restart Browser**
   - Close and reopen Chrome
   - This triggers cache cleanup on startup

4. **Navigate to Video**
   - Go to the same video
   - Click "Analyze Video"

5. **Verify Cache Miss**
   - Results should NOT appear immediately
   - Loading state should be shown
   - New analysis request should be made
   - Check console for:
     ```
     [PerspectivePrismClient] Cache expired for {videoId}
     ```

**Expected Behavior**:

- ✅ Expired cache entries are detected
- ✅ Expired entries are removed from storage
- ✅ New analysis is performed
- ✅ Fresh results are cached

**Acceptance Criteria**:

- Expired entries are not used
- New analysis request is made
- Fresh results are displayed and cached
- Old expired entry is removed from storage

---

### Test 5: Cache Persistence During Extension Update

**Objective**: Verify that cache survives extension updates

**Steps**:

1. **Analyze Videos**
   - Analyze 3-4 YouTube videos
   - Verify results are cached

2. **Verify Cache Entries**
   - Check storage to confirm entries exist
   - Note video IDs and claim counts

3. **Update Extension**
   - Make a minor change to `manifest.json` (e.g., bump version number)
   - Go to `chrome://extensions/`
   - Click "Reload" button for the extension
   - This simulates an extension update

4. **Verify Cache Persists**
   - Navigate to previously analyzed videos
   - Click "Analyze Video" for each
   - Verify cached results are displayed

**Expected Behavior**:

- ✅ Cache survives extension reload/update
- ✅ All cached videos show results immediately
- ✅ No data loss during update

**Acceptance Criteria**:

- Cache entries persist across extension update
- Results are identical to pre-update state
- No errors during or after update

---

### Test 6: Cache Schema Migration

**Objective**: Verify that cache entries are migrated when schema version changes

**Steps**:

1. **Create Legacy Cache Entry (Schema v0)**
   - Open DevTools console
   - Run:
     ```javascript
     // Create a v0 cache entry (no schemaVersion field)
     chrome.storage.local.set(
       {
         cache_TEST_VIDEO: {
           data: {
             video_id: "TEST_VIDEO",
             claims: [
               {
                 claim_text: "Test claim",
                 truth_profile: {
                   perspectives: {},
                   bias_indicators: {
                     logical_fallacies: [],
                     emotional_manipulation: [],
                     deception_score: 0,
                   },
                   overall_assessment: "Test",
                 },
               },
             ],
           },
           timestamp: Date.now(),
           lastAccessed: Date.now(),
           // Note: No schemaVersion field (v0)
         },
       },
       () => {
         console.log("Legacy cache entry created");
       },
     );
     ```

2. **Trigger Cache Read**
   - Navigate to `https://www.youtube.com/watch?v=TEST_VIDEO`
   - Click "Analyze Video"
   - This triggers cache check and migration

3. **Verify Migration**
   - Check console for migration message:
     ```
     [PerspectivePrismClient] Migrating cache entry from v0 to v1
     [PerspectivePrismClient] Saving migrated entry for TEST_VIDEO
     ```
   - Verify migrated entry in storage:
     ```javascript
     chrome.storage.local.get("cache_TEST_VIDEO", (result) => {
       console.log("Migrated entry:", result);
       console.log("Schema version:", result.cache_TEST_VIDEO?.schemaVersion); // Should be 1
     });
     ```

4. **Restart Browser**
   - Close and reopen Chrome

5. **Verify Migrated Entry Persists**
   - Navigate to `https://www.youtube.com/watch?v=TEST_VIDEO`
   - Click "Analyze Video"
   - Cached results should be displayed
   - No migration should occur (already v1)

**Expected Behavior**:

- ✅ Legacy entries are detected (missing schemaVersion)
- ✅ Migration is applied automatically
- ✅ Migrated entry is saved to storage
- ✅ Migrated entry persists across restart

**Acceptance Criteria**:

- Legacy entries are migrated to current schema
- Migration is logged in console
- Migrated entries work correctly
- No data loss during migration

---

### Test 7: Cache Persistence with Large Datasets

**Objective**: Verify that cache handles large analysis results correctly

**Steps**:

1. **Analyze Video with Many Claims**
   - Find a YouTube video with a long transcript (>30 minutes)
   - Click "Analyze Video"
   - Wait for analysis to complete (may take 2+ minutes)
   - Verify results contain many claims (10+)

2. **Verify Cache Entry Size**
   - Open DevTools console
   - Run:
     ```javascript
     chrome.storage.local.get("cache_{videoId}", (result) => {
       const entry = result["cache_{videoId}"];
       const size = JSON.stringify(entry).length;
       console.log("Cache entry size:", (size / 1024).toFixed(2), "KB");
       console.log("Claims count:", entry.data.claims.length);
     });
     ```
   - Note the size (should be < 1 MB per entry)

3. **Restart Browser**
   - Close and reopen Chrome

4. **Verify Large Entry Persists**
   - Navigate to the same video
   - Click "Analyze Video"
   - Verify all claims are displayed
   - Check that no data was truncated

**Expected Behavior**:

- ✅ Large cache entries are stored successfully
- ✅ Large entries survive browser restart
- ✅ No data truncation or corruption
- ✅ All claims are preserved

**Acceptance Criteria**:

- Entries up to 1 MB are stored successfully
- Large entries persist across restart
- No data loss or corruption
- Performance remains acceptable (<500ms to retrieve)

---

### Test 8: Cache Persistence with Quota Limits

**Objective**: Verify cache behavior when approaching storage quota limits

**Steps**:

1. **Fill Cache with Many Videos**
   - Analyze 20-30 different YouTube videos
   - Wait for all analyses to complete
   - This should create significant cache data

2. **Check Storage Usage**
   - Open DevTools console
   - Run:

     ```javascript
     chrome.storage.local.getBytesInUse(null, (bytes) => {
       console.log("Storage used:", (bytes / 1024 / 1024).toFixed(2), "MB");
     });

     chrome.storage.local.get(null, (items) => {
       const cacheKeys = Object.keys(items).filter((k) =>
         k.startsWith("cache_"),
       );
       console.log("Cache entries:", cacheKeys.length);
     });
     ```

3. **Restart Browser**
   - Close and reopen Chrome

4. **Verify All Entries Persist**
   - Check storage usage again (should be same)
   - Navigate to several cached videos
   - Verify cached results are displayed

5. **Test LRU Eviction (if quota exceeded)**
   - If quota is exceeded, oldest entries should be evicted
   - Check console for eviction messages:
     ```
     [QuotaManager] Evicting X entries, freed Y KB
     ```

**Expected Behavior**:

- ✅ Cache entries persist up to quota limit
- ✅ LRU eviction occurs when quota exceeded
- ✅ Most recently accessed entries are preserved
- ✅ Eviction is logged and transparent

**Acceptance Criteria**:

- Cache respects storage quota limits
- LRU eviction works correctly
- Most important (recent) entries are preserved
- No errors or data corruption

---

### Test 9: Cache Persistence Across Multiple Browser Profiles

**Objective**: Verify that cache is isolated per browser profile

**Steps**:

1. **Analyze Video in Profile 1**
   - Use default Chrome profile
   - Analyze a YouTube video
   - Verify results are cached

2. **Switch to Profile 2**
   - Create a new Chrome profile (or use existing)
   - Install the extension in Profile 2
   - Configure backend URL

3. **Navigate to Same Video**
   - Go to the same YouTube video
   - Click "Analyze Video"

4. **Verify Cache Miss**
   - Results should NOT appear immediately
   - New analysis should be performed
   - Check console for cache miss:
     ```
     [PerspectivePrismClient] Cache miss for {videoId}
     ```

5. **Switch Back to Profile 1**
   - Switch to original Chrome profile
   - Navigate to the same video
   - Click "Analyze Video"

6. **Verify Cache Hit**
   - Results should appear immediately
   - Check console for cache hit

**Expected Behavior**:

- ✅ Cache is isolated per browser profile
- ✅ Profile 1 has cached results
- ✅ Profile 2 has no cached results
- ✅ No cross-profile data leakage

**Acceptance Criteria**:

- Cache is profile-specific
- No data sharing between profiles
- Each profile maintains independent cache

---

### Test 10: Cache Persistence After Browser Crash

**Objective**: Verify that cache survives unexpected browser crashes

**Steps**:

1. **Analyze Videos**
   - Analyze 3-4 YouTube videos
   - Verify results are cached

2. **Force Browser Crash**
   - **Method 1**: Navigate to `chrome://crash/` in a tab
   - **Method 2**: Use Task Manager to kill Chrome process
   - **Method 3**: Navigate to `chrome://inducebrowsercrashforrealz/`

3. **Restart Browser**
   - Chrome should offer to restore tabs
   - Click "Restore" or manually reopen Chrome

4. **Verify Cache Persists**
   - Navigate to previously analyzed videos
   - Click "Analyze Video" for each
   - Verify cached results are displayed

**Expected Behavior**:

- ✅ Cache survives browser crash
- ✅ All cached videos show results immediately
- ✅ No data corruption or loss

**Acceptance Criteria**:

- Cache entries persist after crash
- Results are identical to pre-crash state
- No errors or warnings in console

---

## Debugging Tips

### Console Logs to Monitor

Key log messages to watch for:

```javascript
// Cache hits
[PerspectivePrismClient] Cache hit for {videoId}
[PerspectivePrismClient] Returning cached data for {videoId}

// Cache misses
[PerspectivePrismClient] Cache miss for {videoId}
[PerspectivePrismClient] Cache expired for {videoId}

// Cache operations
[PerspectivePrismClient] Saving analysis to cache: {videoId}
[PerspectivePrismClient] Cleaning up X expired cache items

// Migration
[PerspectivePrismClient] Migrating cache entry from vX to vY
[PerspectivePrismClient] Saving migrated entry for {videoId}

// Errors
[PerspectivePrismClient] Cache check failed for {videoId}
[PerspectivePrismClient] Failed to save to cache: {videoId}
```

### Inspecting Cache Storage

Check all cache entries:

```javascript
// Get all cache entries
chrome.storage.local.get(null, (items) => {
  const cacheKeys = Object.keys(items).filter((k) => k.startsWith("cache_"));
  console.log("Total cache entries:", cacheKeys.length);

  cacheKeys.forEach((key) => {
    const entry = items[key];
    const age = Date.now() - entry.timestamp;
    const ageHours = (age / (1000 * 60 * 60)).toFixed(1);
    console.log(`${key}:`);
    console.log(`  - Claims: ${entry.data.claims.length}`);
    console.log(`  - Age: ${ageHours} hours`);
    console.log(`  - Schema: v${entry.schemaVersion || 0}`);
    console.log(
      `  - Size: ${(JSON.stringify(entry).length / 1024).toFixed(2)} KB`,
    );
  });
});
```

Check specific cache entry:

Check storage usage:

```javascript
// Get total storage usage
chrome.storage.local.getBytesInUse(null, (bytes) => {
chrome.storage.local.set({
  'cache_TEST_VIDEO': {
    data: {
      video_id: 'TEST_VIDEO',
      claims: [
        {
          claim_text: 'Test claim',
          truth_profile: {
            perspectives: {},
            bias_indicators: {
              logical_fallacies: [],
              emotional_manipulation: [],
              deception_score: 0
            },
            overall_assessment: 'Test'
          }
        }
      ],
      metadata: {
        analyzed_at: new Date().toISOString()
      }
    },
    timestamp: Date.now(),
    lastAccessed: Date.now(),
    schemaVersion: 1
  }
}, () => {
  console.log('Test cache entry created');
});
    cache_TEST_VIDEO: {
      videoId: "TEST_VIDEO",
      data: {
        video_id: "TEST_VIDEO",
        claims: [
          {
            claim_text: "Test claim",
            truth_profile: {
              perspectives: {},
              bias_indicators: {
                logical_fallacies: [],
                emotional_manipulation: [],
                deception_score: 0,
              },
              overall_assessment: "Test",
            },
          },
        ],
      },
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      schemaVersion: 1,
    },
  },
  () => {
    console.log("Test cache entry created");
  },
);
```

Delete specific cache entry:

```javascript
chrome.storage.local.remove("cache_{videoId}", () => {
  console.log("Cache entry deleted");
});
```

Clear all cache:

```javascript
chrome.storage.local.get(null, (items) => {
  const cacheKeys = Object.keys(items).filter((k) => k.startsWith("cache_"));
  chrome.storage.local.remove(cacheKeys, () => {
    console.log("All cache entries cleared:", cacheKeys.length);
  });
});
```

## Known Issues and Limitations

### 1. Storage Quota

**Issue**: `chrome.storage.local` has unlimited quota, but system storage is finite
**Impact**: Very large caches could consume significant disk space
**Mitigation**: LRU eviction, configurable cache duration, manual clear option
**Status**: Low risk, monitored via cache statistics

### 2. Schema Migration

**Issue**: Complex migrations could fail for corrupted data
**Impact**: Corrupted cache entries would be discarded
**Mitigation**: Migration returns null for invalid data, entry is removed
**Status**: Acceptable, rare occurrence

### 3. Timestamp Precision

**Issue**: JavaScript timestamps are millisecond-precise, but display is minute-precise
**Impact**: "Analyzed X minutes ago" may be slightly inaccurate
**Mitigation**: Acceptable for user-facing display
**Status**: Working as designed

### 4. Cache Invalidation

**Issue**: No automatic invalidation when video content changes
**Impact**: Cached results may be outdated if video is edited
**Mitigation**: Manual refresh button, 24-hour expiration
**Status**: Acceptable, videos rarely change after publication

## Performance Considerations

### Storage Operations

- **Cache Read**: ~5-10ms per entry
- **Cache Write**: ~10-20ms per entry
- **Cache Cleanup**: ~50ms for 100 entries
- **Migration**: ~5ms per entry

### Memory Usage

- **In-memory**: Minimal (cache is in storage, not memory)
- **Storage**: ~10-50 KB per cached video (depends on claim count)
- **Typical Usage**: 20 videos = ~500 KB - 1 MB

### Network Savings

- **Cache Hit**: 0 network requests, 0 backend load
- **Cache Miss**: 1 network request, ~2-120s backend processing
- **Bandwidth Saved**: ~100% for cached videos

## Success Criteria

### Must Pass

- ✅ Test 1: Basic cache persistence after browser restart
- ✅ Test 2: Multiple cached videos persistence
- ✅ Test 4: Cache expiration after 24 hours
- ✅ Test 5: Cache persistence during extension update

### Should Pass

- ✅ Test 3: Cache persistence after system reboot
- ✅ Test 6: Cache schema migration
- ✅ Test 7: Cache persistence with large datasets

### Nice to Have

- ✅ Test 8: Cache persistence with quota limits
- ✅ Test 9: Cache persistence across multiple browser profiles
- ✅ Test 10: Cache persistence after browser crash

## Test Execution Checklist

- [ ] Set up test environment (backend running, extension loaded)
- [ ] Clear all cached data before starting
- [ ] Run Test 1: Basic cache persistence after browser restart
- [ ] Run Test 2: Multiple cached videos persistence
- [ ] Run Test 3: Cache persistence after system reboot
- [ ] Run Test 4: Cache expiration after 24 hours
- [ ] Run Test 5: Cache persistence during extension update
- [ ] Run Test 6: Cache schema migration
- [ ] Run Test 7: Cache persistence with large datasets
- [ ] Run Test 8: Cache persistence with quota limits
- [ ] Run Test 9: Cache persistence across multiple browser profiles
- [ ] Run Test 10: Cache persistence after browser crash
- [ ] Document all issues found
- [ ] Fix critical issues (if any)
- [ ] Retest after fixes
- [ ] Update tasks.md to mark test as complete

## Conclusion

The cache persistence mechanism is fully implemented using Chrome's `chrome.storage.local` API, which provides persistent storage that survives browser restarts, system reboots, and extension updates. The implementation includes schema versioning for forward compatibility and automatic cleanup of expired entries.

**Key Strengths**:

- Persistent storage using `chrome.storage.local`
- Schema versioning and migration support
- Automatic expiration and cleanup
- LRU eviction when quota exceeded
- Profile-specific cache isolation

**Testing Priority**: **HIGH** - Cache persistence is critical for user experience

**Estimated Testing Time**: 2-3 hours for comprehensive testing

**Risk Level**: **LOW** - Implementation uses stable Chrome APIs with extensive error handling

**Next Steps**:

1. Execute all test scenarios
2. Document any issues found
3. Fix critical issues (if any)
4. Mark task as complete in tasks.md
5. Update manual testing checklist
