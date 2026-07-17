/**
 * Integration Test: Rapid Navigation Between Videos
 *
 * Tests the extension's ability to handle rapid navigation between multiple videos
 * without errors, race conditions, or memory leaks.
 *
 * Requirements tested:
 * - Requirement 8.3: Extension SHALL debounce rapid navigation events with 500ms delay
 * - Requirement 8.4: Extension SHALL clean up event listeners and DOM elements on navigation
 * - Requirement 2.5: Extension SHALL detect navigation between YouTube videos
 */

import { test, expect } from "./fixtures.js";

test.describe("Rapid Navigation Between Videos", () => {
  test("should handle rapid navigation without errors", async ({
    page,
    context,
    extensionId,
  }) => {
    // Test videos
    const videoA = "dQw4w9WgXcQ";
    const videoB = "jNQXAC9IVRw";
    const videoC = "9bZkp7q19f0";

    // Track console errors
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Navigate to Video A using fixture
    await page.goto(
      `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoA}`,
    );

    // Wait for button to appear
    const button = page.locator('[data-pp-analysis-button="true"]');
    await expect(button).toBeVisible({ timeout: 5000 });

    // Immediately navigate to Video B (rapid navigation)
    await page.goto(
      `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoB}`,
    );

    // Immediately navigate to Video C (rapid navigation)
    await page.goto(
      `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoC}`,
    );

    // Wait for debounce to settle (500ms + buffer)
    await page.waitForTimeout(700);

    // Verify button is present for Video C
    await expect(button).toBeVisible({ timeout: 5000 });

    // Verify no duplicate buttons
    const buttonCount = await page
      .locator('[data-pp-analysis-button="true"]')
      .count();
    expect(buttonCount).toBe(1);

    // Wait a bit more to catch any delayed errors
    await page.waitForTimeout(1000);

    // Filter out expected errors (if any)
    const unexpectedErrors = errors.filter(
      (err) => !err.includes("Extension context invalidated"), // Expected on reload
    );

    expect(unexpectedErrors).toHaveLength(0);
  });

  test("should properly clean up on rapid navigation", async ({
    page,
    context,
    extensionId,
  }) => {
    const videoA = "dQw4w9WgXcQ";
    const videoB = "jNQXAC9IVRw";
    const videoC = "9bZkp7q19f0";

    // Navigate to Video A
    await page.goto(
      `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoA}`,
    );

    // Wait for button and click it
    const button = page.locator('[data-pp-analysis-button="true"]');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    // Wait for panel to appear
    await page.waitForSelector("#pp-analysis-panel", { timeout: 5000 });

    // Rapidly navigate away before analysis completes
    await page.goto(
      `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoB}`,
    );
    await page.waitForTimeout(100);
    await page.goto(
      `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoC}`,
    );

    // Wait for debounce
    await page.waitForTimeout(700);

    // Verify old panel is cleaned up
    const oldPanel = await page.locator("#pp-analysis-panel").count();
    expect(oldPanel).toBe(0);

    // Verify button is present for Video C
    await expect(button).toBeVisible({ timeout: 5000 });

    // Verify only one button exists
    const buttonCount = await page
      .locator('[data-pp-analysis-button="true"]')
      .count();
    expect(buttonCount).toBe(1);
  });

  test("should handle rapid back/forward navigation", async ({
    page,
    context,
    extensionId,
  }) => {
    const videoA = "dQw4w9WgXcQ";
    const videoB = "jNQXAC9IVRw";

    // Navigate to Video A
    await page.goto(
      `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoA}`,
    );
    const button = page.locator('[data-pp-analysis-button="true"]');
    await expect(button).toBeVisible({ timeout: 5000 });

    // Navigate to Video B
    await page.goto(
      `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoB}`,
    );
    await expect(button).toBeVisible({ timeout: 5000 });

    // Rapidly use browser back/forward
    await page.goBack();
    await page.waitForTimeout(100);
    await page.goForward();
    await page.waitForTimeout(100);
    await page.goBack();

    // Wait for debounce
    await page.waitForTimeout(700);

    // Verify we're on Video A
    expect(page.url()).toContain(videoA);

    // Verify button is present
    await expect(button).toBeVisible({ timeout: 5000 });

    // Verify no duplicate buttons
    const buttonCount = await page
      .locator('[data-pp-analysis-button="true"]')
      .count();
    expect(buttonCount).toBe(1);
  });

  test("should debounce rapid navigation events", async ({
    page,
    context,
    extensionId,
  }) => {
    const videos = [
      "dQw4w9WgXcQ",
      "jNQXAC9IVRw",
      "9bZkp7q19f0",
      "kJQP7kiw5Fk",
      "L_jWHffIx5E",
    ];

    // Track console logs to verify debouncing
    const navigationLogs = [];
    page.on("console", (msg) => {
      if (msg.text().includes("Navigation detected")) {
        navigationLogs.push({
          text: msg.text(),
          timestamp: Date.now(),
        });
      }
    });

    // Navigate to first video initially
    await page.goto(
      `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videos[0]}`,
    );
    // Wait until the content script has initialized and injected its button
    // before firing rapid SPA navigations, so cleanup of the first video is exercised.
    await page.waitForSelector('[data-pp-analysis-button="true"]', { timeout: 10000 });

    const startTime = Date.now();

    // Rapidly navigate through all videos using SPA events
    for (let i = 1; i < videos.length; i++) {
      const videoId = videos[i];
      await page.evaluate((vid) => {
        history.replaceState(null, "", `?v=${vid}`);
        document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
      }, videoId);
      await page.waitForTimeout(50); // Very rapid navigation
    }

    // Wait for debounce to settle
    await page.waitForTimeout(1000);

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Verify we ended up on the last video
    expect(page.url()).toContain(videos[videos.length - 1]);

    // Verify button is present
    const button = page.locator('[data-pp-analysis-button="true"]');
    await expect(button).toBeVisible({ timeout: 5000 });

    // Verify no duplicate buttons
    const buttonCount = await page
      .locator('[data-pp-analysis-button="true"]')
      .count();
    expect(buttonCount).toBe(1);

    // Verify debouncing reduced the number of actual navigation handlers
    // With 5 videos and 50ms between each, we should see fewer than 5 navigation events
    // due to debouncing (500ms delay)
    console.log(`Navigation events detected: ${navigationLogs.length}`);
    console.log(`Total time: ${totalTime}ms`);

    // We expect debouncing to reduce the number of events
    // With 500ms debounce and 50ms intervals, we should see at most 1-2 events
    expect(navigationLogs.length).toBeLessThanOrEqual(2);
  });

  test("should not leak memory during rapid navigation", async ({
    page,
    context,
    extensionId,
  }) => {
    const videos = [
      "dQw4w9WgXcQ",
      "jNQXAC9IVRw",
      "9bZkp7q19f0",
      "kJQP7kiw5Fk",
      "L_jWHffIx5E",
    ];

    // Rapidly navigate through videos multiple times
    for (let i = 0; i < 3; i++) {
      for (const videoId of videos) {
        await page.goto(
          `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoId}`,
        );
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(700); // Wait for debounce
    }

    // Verify button is still present and functional
    const button = page.locator('[data-pp-analysis-button="true"]');
    await expect(button).toBeVisible({ timeout: 5000 });

    // Verify no duplicate buttons
    const buttonCount = await page
      .locator('[data-pp-analysis-button="true"]')
      .count();
    expect(buttonCount).toBe(1);

    // Verify no orphaned panels
    const panelCount = await page.locator("#pp-analysis-panel").count();
    expect(panelCount).toBe(0); // No panel should be open

    // Click button to verify functionality
    await button.click();
    await page.waitForSelector("#pp-analysis-panel", { timeout: 5000 });

    // Verify panel appears
    const panel = page.locator("#pp-analysis-panel");
    await expect(panel).toBeVisible();
  });
});
