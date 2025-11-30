import { defineConfig } from 'vitest/config';

export default defineConfig({
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
      
      // Coverage thresholds (target: 80%)
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
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
    
    // Test file patterns
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    
    // Test timeout (30 seconds)
    testTimeout: 30000
  }
});
