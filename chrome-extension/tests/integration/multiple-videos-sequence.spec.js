import { test, expect, getBackgroundWorker, buildMockResult } from "./fixtures";

test.describe("Multiple Videos Analyzed in Sequence", () => {
  test("should handle analyzing multiple videos in sequence with correct cache behavior", async ({
    page,
    context,
    extensionId,
  }) => {
    // Track API calls for each video
    const apiCalls = {
      videoA: 0,
      videoB: 0,
      videoC: 0,
    };

    // Mock backend API for video A (dQw4w9WgXcQ)
    await context.route("**/analyze/jobs", async (route) => {
      const requestBody = route.request().postDataJSON();
      const videoUrl = requestBody?.url || requestBody?.video_url || "";

      if (videoUrl.includes("dQw4w9WgXcQ")) {
        apiCalls.videoA++;
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ job_id: "job-video-a" }),
        });
      } else if (videoUrl.includes("jNQXAC9IVRw")) {
        apiCalls.videoB++;
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ job_id: "job-video-b" }),
        });
      } else if (videoUrl.includes("9bZkp7q19f0")) {
        apiCalls.videoC++;
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ job_id: "job-video-c" }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock polling endpoints for each video
    await context.route("**/analyze/jobs/job-video-a", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "job-video-a",
          status: "completed",
          result: buildMockResult("dQw4w9WgXcQ", "Claim from Video A", "Scientific"),
        }),
      });
    });

    await context.route("**/analyze/jobs/job-video-b", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "job-video-b",
          status: "completed",
          result: buildMockResult("jNQXAC9IVRw", "Claim from Video B", "Journalistic"),
        }),
      });
    });

    await context.route("**/analyze/jobs/job-video-c", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "job-video-c",
          status: "completed",
          result: buildMockResult("9bZkp7q19f0", "Claim from Video C", "Partisan Left"),
        }),
      });
    });

    // Step 1: Navigate to Video A and analyze
    console.log("Step 1: Analyzing Video A");
    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const analysisButtonA = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButtonA).toBeVisible({ timeout: 10000 });
    await analysisButtonA.click();

    // Wait for Video A results
    await expect(page.locator('text="Claim from Video A"')).toBeVisible({
      timeout: 10000,
    });

    // Verify API was called for Video A
    expect(apiCalls.videoA).toBe(1);

    // Close panel before navigating
    const closeButton = page.locator("#pp-analysis-panel button[aria-label='Close']");
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }

    // Step 2: Navigate to Video B and analyze
    console.log("Step 2: Analyzing Video B");
    await page.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw");

    const analysisButtonB = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButtonB).toBeVisible({ timeout: 10000 });
    await analysisButtonB.click();

    // Wait for Video B results
    await expect(page.locator('text="Claim from Video B"')).toBeVisible({
      timeout: 10000,
    });

    // Verify API was called for Video B
    expect(apiCalls.videoB).toBe(1);

    // Close panel before navigating
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }

    // Step 3: Navigate to Video C and analyze
    console.log("Step 3: Analyzing Video C");
    await page.goto("https://www.youtube.com/watch?v=9bZkp7q19f0");

    const analysisButtonC = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButtonC).toBeVisible({ timeout: 10000 });
    await analysisButtonC.click();

    // Wait for Video C results
    await expect(page.locator('text="Claim from Video C"')).toBeVisible({
      timeout: 10000,
    });

    // Verify API was called for Video C
    expect(apiCalls.videoC).toBe(1);

    // Step 4: Verify cache behavior - go back to Video A
    console.log("Step 4: Verifying cache for Video A");
    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const analysisButtonA2 = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButtonA2).toBeVisible({ timeout: 10000 });
    await analysisButtonA2.click();

    // Should show cached results immediately without new API call
    await expect(page.locator('text="Claim from Video A"')).toBeVisible({
      timeout: 5000,
    });

    // Verify no additional API call was made (still 1)
    expect(apiCalls.videoA).toBe(1);

    // Step 5: Check cache stats via popup
    console.log("Step 5: Checking cache statistics");
    
    // Get cache stats from background storage
    const background = await getBackgroundWorker(context);
    const cacheStats = await background.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
          const cacheEntries = Object.keys(items).filter((key) =>
            key.startsWith("cache_")
          );
          resolve({
            totalEntries: cacheEntries.length,
            videoIds: cacheEntries.map((key) => key.replace("cache_", "")),
          });
        });
      });
    });

    // Verify all three videos are cached
    expect(cacheStats.totalEntries).toBeGreaterThanOrEqual(3);
    expect(cacheStats.videoIds).toContain("dQw4w9WgXcQ");
    expect(cacheStats.videoIds).toContain("jNQXAC9IVRw");
    expect(cacheStats.videoIds).toContain("9bZkp7q19f0");

    console.log("✓ All videos analyzed successfully");
    console.log("✓ Cache contains all three videos");
    console.log("✓ Cache hit verified for Video A");
  });

  test("should handle navigation cleanup between videos", async ({
    page,
    context,
  }) => {
    // Mock backend API
    await context.route("**/analyze/jobs", async (route) => {
      await route.fulfill({
        status: 202,
        body: JSON.stringify({ job_id: "job-cleanup-test" }),
      });
    });

    await context.route("**/analyze/jobs/job-cleanup-test", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "completed",
          result: buildMockResult("dQw4w9WgXcQ", "Test Claim"),
        }),
      });
    });

    // Navigate to first video
    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const button1 = page.locator('[data-pp-analysis-button="true"]');
    await expect(button1).toBeVisible({ timeout: 10000 });
    await button1.click();

    // Wait for panel to open
    const panel = page.locator("#pp-analysis-panel");
    await expect(panel).toBeAttached();

    // Navigate to second video (should trigger cleanup)
    await page.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw");

    // Verify old panel is cleaned up
    await expect(panel).not.toBeAttached({ timeout: 5000 });

    // Verify new button is injected
    const button2 = page.locator('[data-pp-analysis-button="true"]');
    await expect(button2).toBeVisible({ timeout: 10000 });

    // Verify no duplicate buttons
    const buttonCount = await page
      .locator('[data-pp-analysis-button="true"]')
      .count();
    expect(buttonCount).toBe(1);
  });
});
