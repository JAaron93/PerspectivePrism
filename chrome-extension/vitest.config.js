import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Benchmark-vetted scheduling defaults (2026-11-08, 16-run A/B audit): this config
  // intentionally omits `pool`, `isolate`, and `maxWorkers` overrides. Do NOT "optimize"
  // this file with commonly documented alternatives — each was measured and disqualified:
  //   * isolate:false (forks or threads) -> cold-run flaky (1 file fails ~50% of cold runs);
  //     no speed win on forks (8.6s vs 8.1-8.6s baseline)
  //   * pool:'threads' (isolated)        -> green but 11.3-12.0s (+35%)
  //   * maxWorkers 6/8/14                -> green but all slower (10.7-13.7s)
  //   * environment:'happy-dom'          -> 24 test failures / 2 files (shims need jsdom API)
  //   * vmThreads                        -> broken under this suite
  // jsdom environment setup is 71-84% of wall time, which makes "swap the environment"
  // the most tempting optimization — happy-dom is the measurement-backed dead end.
  // NOTE: Vitest's own end-of-run perf hint recommends exactly the two disqualified flags
  // (vmThreads / isolate:false) — that suggestion was part of this audit; disregard it here.
  // Baseline evidence: 26 files / 402 tests green at 8.06-8.59s (2 consecutive runs).
  test: {
    // Test environment configuration
    environment: 'jsdom',
    
    // Setup files to run before tests
    setupFiles: ['./tests/setup.js'],
    
    // Global test configuration
    globals: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      
      // Coverage thresholds (regression gate based on current 16.7% coverage baseline)
      thresholds: {
        lines: 15,
        functions: 15,
        branches: 15,
        statements: 15
      },
      
      // Files to include in coverage
      include: [
        'background.js',
        'client.js',
        'config.js',
        'consent.js',
        'content.js',
        'metrics-tracker.js',
        'options.js',
        'panel-styles.js',
        'popup.js',
        'quota-manager.js',
        'welcome.js'
      ],
      
      // Files to exclude from coverage
      exclude: [
        'tests/**',
        'test-*.html',
        '*.config.js',
        'types.d.ts',
        '*.md'
      ]
    },
    
    // Test file patterns (unit tests and Vitest memory integration test; Playwright runs browser specs separately)
    include: ['tests/unit/**/*.test.js', 'tests/integration/test-memory-usage.test.js'],
    
    // Test timeout (30 seconds)
    testTimeout: 30000
  }
});
