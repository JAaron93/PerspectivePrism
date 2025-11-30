/**
 * Integration test for memory usage
 * Validates that the extension stays under 10MB during normal operation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Memory Usage Tests', () => {
  let memoryMonitor;
  
  beforeAll(async () => {
    // Import memory monitor
    const module = await import('../../memory-monitor.js');
    memoryMonitor = module.memoryMonitor;
  });
  
  afterAll(() => {
    // Stop monitoring if running
    if (memoryMonitor) {
      memoryMonitor.stopMonitoring();
    }
  });
  
  it('should have performance.memory API available', () => {
    expect(performance.memory).toBeDefined();
    expect(performance.memory.usedJSHeapSize).toBeDefined();
    expect(performance.memory.totalJSHeapSize).toBeDefined();
    expect(performance.memory.jsHeapSizeLimit).toBeDefined();
  });
  
  it('should measure baseline memory usage under 10MB', async () => {
    const measurement = await memoryMonitor.measure();
    
    expect(measurement).toBeDefined();
    expect(measurement.usedMB).toBeDefined();
    
    const usedMB = parseFloat(measurement.usedMB);
    console.log(`Baseline memory usage: ${usedMB}MB`);
    
    // Baseline should be well under 10MB
    expect(usedMB).toBeLessThan(10);
    
    // Ideally under 5MB for baseline
    if (usedMB >= 5) {
      console.warn(`Warning: Baseline memory usage is ${usedMB}MB (target: <5MB)`);
    }
  });
  
  it('should track memory measurements', async () => {
    // Take multiple measurements
    await memoryMonitor.measure();
    await new Promise(resolve => setTimeout(resolve, 100));
    await memoryMonitor.measure();
    await new Promise(resolve => setTimeout(resolve, 100));
    await memoryMonitor.measure();
    
    const stats = memoryMonitor.getStats();
    
    expect(stats.count).toBeGreaterThanOrEqual(3);
    expect(stats.avgUsedMB).toBeDefined();
    expect(stats.maxUsedMB).toBeDefined();
    expect(stats.minUsedMB).toBeDefined();
    
    console.log('Memory stats:', stats);
  });
  
  it('should handle memory monitoring start/stop', () => {
    // Start monitoring
    memoryMonitor.startMonitoring(1000);
    expect(memoryMonitor.isMonitoring).toBe(true);
    
    // Stop monitoring
    memoryMonitor.stopMonitoring();
    expect(memoryMonitor.isMonitoring).toBe(false);
  });
  
  it('should export measurements', async () => {
    // Take a few measurements
    await memoryMonitor.measure();
    await memoryMonitor.measure();
    
    const measurements = memoryMonitor.exportMeasurements();
    
    expect(Array.isArray(measurements)).toBe(true);
    expect(measurements.length).toBeGreaterThan(0);
    
    // Verify measurement structure
    const measurement = measurements[0];
    expect(measurement.timestamp).toBeDefined();
    expect(measurement.usedJSHeapSize).toBeDefined();
    expect(measurement.usedMB).toBeDefined();
  });
  
  it('should calculate statistics correctly', async () => {
    // Clear previous measurements
    memoryMonitor.measurements = [];
    
    // Take measurements
    await memoryMonitor.measure();
    await new Promise(resolve => setTimeout(resolve, 100));
    await memoryMonitor.measure();
    await new Promise(resolve => setTimeout(resolve, 100));
    await memoryMonitor.measure();
    
    const stats = memoryMonitor.getStats();
    
    // Verify stats are reasonable
    expect(parseFloat(stats.avgUsedMB)).toBeGreaterThan(0);
    expect(parseFloat(stats.maxUsedMB)).toBeGreaterThanOrEqual(parseFloat(stats.avgUsedMB));
    expect(parseFloat(stats.minUsedMB)).toBeLessThanOrEqual(parseFloat(stats.avgUsedMB));
    expect(parseFloat(stats.currentUsedMB)).toBeGreaterThan(0);
  });
  
  it('should have reasonable thresholds', () => {
    expect(memoryMonitor.WARNING_THRESHOLD_MB).toBe(8);
    expect(memoryMonitor.CRITICAL_THRESHOLD_MB).toBe(10);
    expect(memoryMonitor.WARNING_THRESHOLD_MB).toBeLessThan(memoryMonitor.CRITICAL_THRESHOLD_MB);
  });
  
  it('should maintain memory under 10MB during simulated operations', async () => {
    // Simulate some operations that might increase memory
    const testData = [];
    
    // Create some test data (simulating analysis results)
    for (let i = 0; i < 5; i++) {
      testData.push({
        video_id: `test_video_${i}`,
        claims: Array(3).fill(null).map((_, idx) => ({
          claim_text: `Test claim ${idx} for video ${i}`,
          truth_profile: {
            overall_assessment: 'Test assessment',
            perspectives: {
              scientific: { assessment: 'Test', confidence: 0.8 },
              journalistic: { assessment: 'Test', confidence: 0.7 }
            },
            bias_indicators: {
              logical_fallacies: ['test fallacy'],
              emotional_manipulation: ['test manipulation'],
              deception_score: 3
            }
          }
        }))
      });
      
      // Measure after each addition
      const measurement = await memoryMonitor.measure();
      const usedMB = parseFloat(measurement.usedMB);
      
      console.log(`After ${i + 1} analyses: ${usedMB}MB`);
      
      // Should stay under 10MB
      expect(usedMB).toBeLessThan(10);
    }
    
    // Clean up
    testData.length = 0;
    
    // Give GC a chance to run
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Final measurement
    const finalMeasurement = await memoryMonitor.measure();
    const finalUsedMB = parseFloat(finalMeasurement.usedMB);
    
    console.log(`After cleanup: ${finalUsedMB}MB`);
    expect(finalUsedMB).toBeLessThan(10);
  });
});

describe('Memory Leak Detection', () => {
  let memoryMonitor;
  
  beforeAll(async () => {
    const module = await import('../../memory-monitor.js');
    memoryMonitor = module.memoryMonitor;
  });
  
  it('should not leak memory with repeated measurements', async () => {
    // Clear previous measurements
    memoryMonitor.measurements = [];
    
    // Take initial measurement
    const initial = await memoryMonitor.measure();
    const initialMB = parseFloat(initial.usedMB);
    
    // Take many measurements
    for (let i = 0; i < 50; i++) {
      await memoryMonitor.measure();
    }
    
    // Take final measurement
    const final = await memoryMonitor.measure();
    const finalMB = parseFloat(final.usedMB);
    
    // Memory should not increase significantly (allow 1MB variance)
    const increase = finalMB - initialMB;
    console.log(`Memory increase after 50 measurements: ${increase.toFixed(2)}MB`);
    
    expect(increase).toBeLessThan(1);
  });
  
  it('should limit stored measurements to MAX_MEASUREMENTS', async () => {
    // Clear previous measurements
    memoryMonitor.measurements = [];
    
    const maxMeasurements = memoryMonitor.MAX_MEASUREMENTS;
    
    // Take more measurements than the limit
    for (let i = 0; i < maxMeasurements + 10; i++) {
      await memoryMonitor.measure();
    }
    
    // Should not exceed MAX_MEASUREMENTS
    expect(memoryMonitor.measurements.length).toBeLessThanOrEqual(maxMeasurements);
  });
});

describe('Memory Monitor Debug Mode', () => {
  let memoryMonitor;
  
  beforeAll(async () => {
    const module = await import('../../memory-monitor.js');
    memoryMonitor = module.memoryMonitor;
  });
  
  it('should enable and disable debug mode', () => {
    // Enable debug mode
    memoryMonitor.enableDebugMode();
    expect(memoryMonitor.isDebugMode()).toBe(true);
    
    // Disable debug mode
    memoryMonitor.disableDebugMode();
    expect(memoryMonitor.isDebugMode()).toBe(false);
  });
});
