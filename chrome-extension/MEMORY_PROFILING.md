# Memory Profiling Guide - Perspective Prism Extension

## Overview

This document describes the memory profiling and monitoring system for the Perspective Prism Chrome extension. The extension is designed to maintain memory usage below **10MB** during normal operation.

## Memory Targets

- **Target**: < 10MB total memory usage
- **Warning Threshold**: 8MB (triggers warnings)
- **Critical Threshold**: 10MB (triggers emergency cleanup)
- **Baseline**: < 5MB (idle state)

## Memory Monitor

The `memory-monitor.js` module provides comprehensive memory tracking and management.

### Features

1. **Continuous Monitoring**: Track memory usage over time
2. **Threshold Alerts**: Automatic warnings at 8MB and 10MB
3. **Emergency Cleanup**: Automatic cleanup when critical threshold is reached
4. **Statistics**: Track average, min, max memory usage
5. **Debug Mode**: Detailed logging for development

### Usage

#### In Content Script

```javascript
// Import the memory monitor
import { memoryMonitor } from './memory-monitor.js';

// Start monitoring (30 second intervals)
memoryMonitor.startMonitoring(30000);

// Take a single measurement
const measurement = await memoryMonitor.measure();
console.log(`Memory: ${measurement.usedMB}MB`);

// Get statistics
const stats = memoryMonitor.getStats();
console.log(`Avg: ${stats.avgUsedMB}MB, Max: ${stats.maxUsedMB}MB`);

// Stop monitoring
memoryMonitor.stopMonitoring();
```

#### Console Helpers

When the extension is loaded, these helper functions are available in the console:

```javascript
// Print memory statistics
ppMemoryStats();

// Take a measurement
ppMemoryMeasure();

// Enable/disable debug mode
ppMemoryDebug(true);  // Enable
ppMemoryDebug(false); // Disable
```

## Memory Profiling Tests

The `test-memory-profile.html` page provides comprehensive memory testing.

### Running Tests

**Important**: Memory profiling tests must be run in a real Chrome browser, not in the test environment (jsdom), because the `performance.memory` API is only available in Chrome.

1. Load the extension in Chrome (Developer Mode)
2. Open Chrome and navigate to `chrome-extension://<extension-id>/test-memory-profile.html`
3. Click "Measure Now" to take a single measurement
4. Click "Start Monitoring" to begin continuous monitoring
5. Run individual tests or the full suite

### Manual Testing

Since automated tests cannot access `performance.memory`, manual testing is required:

1. Load extension in Chrome
2. Open test-memory-profile.html
3. Run full test suite
4. Verify all tests pass
5. Document results in this file

### Test Suite

#### 1. Baseline Test
- **Purpose**: Measure idle memory usage
- **Target**: < 5MB
- **Pass Criteria**: Memory usage < 10MB

#### 2. Panel Creation Test
- **Purpose**: Test memory impact of creating/removing analysis panel
- **Target**: < 2MB increase
- **Pass Criteria**: Memory recovered after cleanup, total < 10MB

#### 3. Multiple Analyses Test
- **Purpose**: Simulate multiple video analyses
- **Target**: < 10MB with 5 analyses
- **Pass Criteria**: Memory stays under 10MB

#### 4. Navigation Stress Test
- **Purpose**: Test rapid navigation between videos
- **Target**: < 10MB during rapid state changes
- **Pass Criteria**: Memory stays under 10MB, no leaks

#### 5. Full Suite
- **Purpose**: Run all tests sequentially
- **Pass Criteria**: All individual tests pass, max memory < 10MB

## Memory Optimization Strategies

### Content Script Optimizations

1. **Shadow DOM**: Isolate panel styles to prevent global style bloat
2. **Event Listener Cleanup**: Remove listeners on navigation
3. **DOM Element Cleanup**: Remove panels and buttons on navigation
4. **Debouncing**: Limit mutation observer frequency (500ms)
5. **Lazy Loading**: Only create panel when needed

### Background Service Worker Optimizations

1. **Cache Limits**: Max 50 cached analyses
2. **LRU Eviction**: Remove oldest entries when quota exceeded
3. **Entry Size Limits**: Max 1MB per cache entry
4. **Expired Entry Cleanup**: Remove entries older than 24 hours
5. **Request Deduplication**: Prevent duplicate in-flight requests

### Data Structure Optimizations

1. **Minimal State**: Only store essential data
2. **Weak References**: Use WeakMap for temporary associations
3. **String Interning**: Reuse common strings
4. **Compact Formats**: Use efficient data structures

## Memory Leak Prevention

### Common Leak Sources

1. **Event Listeners**: Always remove listeners on cleanup
2. **Timers**: Clear all setTimeout/setInterval on navigation
3. **DOM References**: Don't hold references to removed elements
4. **Closures**: Avoid capturing large objects in closures
5. **Global State**: Minimize global variables

### Cleanup Checklist

When navigating away from a video:

- [ ] Disconnect MutationObserver
- [ ] Clear all timers (setTimeout, setInterval)
- [ ] Remove event listeners
- [ ] Remove DOM elements (panel, button)
- [ ] Clear large data structures
- [ ] Cancel in-flight requests
- [ ] Reset state variables

## Monitoring in Production

### Automatic Monitoring

The extension automatically monitors memory in production:

1. Measurements taken every 30 seconds
2. Warnings logged at 8MB
3. Emergency cleanup triggered at 10MB
4. Statistics stored for analysis

### User Reporting

If users report performance issues:

1. Ask them to open DevTools Console
2. Run `ppMemoryStats()` to see current usage
3. Check for warnings/errors in console
4. Export measurements with `ppMemoryMonitor.exportMeasurements()`

## Debugging Memory Issues

### Step 1: Enable Debug Mode

```javascript
ppMemoryDebug(true);
```

This enables detailed logging of all memory measurements.

### Step 2: Take Heap Snapshot

1. Open Chrome DevTools
2. Go to Memory tab
3. Take a heap snapshot
4. Compare snapshots before/after operations

### Step 3: Identify Leaks

Look for:
- Detached DOM nodes
- Large arrays/objects
- Retained event listeners
- Unclosed connections

### Step 4: Profile Memory Timeline

1. Open Chrome DevTools
2. Go to Performance tab
3. Enable "Memory" checkbox
4. Record a session
5. Analyze memory graph for leaks

## Performance Benchmarks

### Target Metrics

| Scenario | Memory Usage | Pass/Fail |
|----------|-------------|-----------|
| Idle (no analysis) | < 5MB | ✓ |
| Single analysis | < 7MB | ✓ |
| Panel open | < 8MB | ✓ |
| 5 analyses cached | < 9MB | ✓ |
| Navigation stress | < 10MB | ✓ |

### Actual Results

Run the test suite and document results here:

```
Date: [YYYY-MM-DD]
Chrome Version: [Version]
Extension Version: [Version]

Baseline: [X.XX]MB
Panel Creation: [X.XX]MB
Multiple Analyses: [X.XX]MB
Navigation Stress: [X.XX]MB
Max Memory: [X.XX]MB

Status: [PASS/FAIL]
```

## Emergency Cleanup

If memory reaches critical threshold (10MB), the monitor automatically:

### Content Script Cleanup
1. Removes analysis panel
2. Clears analysis data
3. Forces garbage collection (if available)

### Background Worker Cleanup
1. Removes 50% of oldest cache entries
2. Clears completed request states
3. Forces garbage collection (if available)

## Best Practices

1. **Test Regularly**: Run memory tests before each release
2. **Monitor Production**: Check logs for memory warnings
3. **Profile Changes**: Test memory impact of new features
4. **Optimize Early**: Address memory issues during development
5. **Document Changes**: Note memory impact in commit messages

## Troubleshooting

### Memory Usage Too High

1. Check cache size: `chrome.storage.local.getBytesInUse()`
2. Clear cache: Click "Clear Cache" in popup
3. Check for memory leaks: Take heap snapshot
4. Review recent changes: Check git history

### Memory Not Recovering

1. Check for event listener leaks
2. Verify cleanup functions are called
3. Look for global variable accumulation
4. Check for unclosed connections

### Tests Failing

1. Run tests individually to isolate issue
2. Check console for errors
3. Take heap snapshots before/after
4. Review recent code changes

## Resources

- [Chrome Extension Memory Best Practices](https://developer.chrome.com/docs/extensions/mv3/performance/)
- [JavaScript Memory Management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management)
- [Chrome DevTools Memory Profiling](https://developer.chrome.com/docs/devtools/memory-problems/)

## Contact

For memory-related issues or questions, please:
1. Check this documentation first
2. Run the memory profiling tests
3. Collect heap snapshots if needed
4. Open an issue with detailed information
