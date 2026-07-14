import { test, expect, buildMockResult } from "./fixtures.js";

test.describe("SPA Navigation Cleanup & Resilience", () => {
  test("should clean up timeline markers and reset panel state on yt-navigate-start", async ({
    page,
    extensionId,
    context
  }) => {
    const videoA = "dQw4w9WgXcQ";
    const videoB = "jNQXAC9IVRw";

    // Mock API response for Video A
    await context.route("**/analyze/jobs", async (route) => {
      await route.fulfill({
        status: 202,
        body: JSON.stringify({ job_id: "job-video-a" })
      });
    });

    await context.route("**/analyze/jobs/job-video-a", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "completed",
          result: buildMockResult(videoA, "Claim 1", null, 0.1),
        })
      });
    });

    // Navigate to Video A
    await page.goto(`chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoA}`);

    // Wait for progress list container (we must add it to mock HTML or create it dynamically in test)
    await page.evaluate(() => {
      const player = document.getElementById("player");
      const progressList = document.createElement("div");
      progressList.className = "ytp-progress-list";
      player.appendChild(progressList);
      
      const video = document.createElement("video");
      video.id = "movie_player-video";
      Object.defineProperty(video, "duration", { value: 100, writable: true });
      player.appendChild(video);
    });

    // Click button to start analysis
    const button = page.locator('[data-pp-analysis-button="true"]');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    // Wait for markers to be rendered
    await page.waitForSelector(".pp-timeline-marker", { timeout: 5000 });
    let markersCount = await page.locator(".pp-timeline-marker").count();
    expect(markersCount).toBe(1);

    // Simulate yt-navigate-start
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent("yt-navigate-start"));
    });

    // Verify timeline markers are removed immediately
    markersCount = await page.locator(".pp-timeline-marker").count();
    expect(markersCount).toBe(0);

    // Verify panel is closed / removed
    const panelCount = await page.locator("#pp-analysis-panel").count();
    expect(panelCount).toBe(0);
  });

  test("should ignore delayed analysis response from a previous video", async ({
    page,
    extensionId,
    context
  }) => {
    const videoA = "dQw4w9WgXcQ";
    const videoB = "jNQXAC9IVRw";

    let resolveVideoA;
    const videoAPromise = new Promise(resolve => {
      resolveVideoA = resolve;
    });

    // Route Video A with a delay
    await context.route("**/analyze/jobs", async (route) => {
      const body = route.request().postDataJSON();
      const videoUrl = body?.url ?? "";
      if (videoUrl.includes(videoA)) {
        await route.fulfill({
          status: 202,
          body: JSON.stringify({ job_id: "job-a" })
        });
      } else {
        await route.fulfill({
          status: 202,
          body: JSON.stringify({ job_id: "job-b" })
        });
      }
    });

    // Signal that the polling request for job-a has arrived at the handler,
    // so we know it is in-flight when we trigger SPA navigation.
    let signalJobAReached;
    const jobAReachedPromise = new Promise(resolve => {
      signalJobAReached = resolve;
    });

    await context.route("**/analyze/jobs/job-a", async (route) => {
      // Signal that the request has arrived, then hold the response
      signalJobAReached();
      await videoAPromise;
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "completed",
          result: {
            video_id: videoA,
            metadata: { analyzed_at: new Date().toISOString() },
            claims: [
              {
                claim_text: "Old Claim",
                timestamp: "0:10",
                video_timestamp_start: 10,
                video_timestamp_end: 15,
                truth_profile: {
                  overall_assessment: "Likely True",
                  perspectives: {},
                  bias_indicators: {
                    logical_fallacies: [],
                    emotional_manipulation: [],
                    deception_score: 0.1
                  }
                }
              }
            ]
          }
        })
      });
    });

    // Go to Video A
    await page.goto(`chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoA}`);
    
    await page.evaluate(() => {
      const player = document.getElementById("player");
      const progressList = document.createElement("div");
      progressList.className = "ytp-progress-list";
      player.appendChild(progressList);
    });

    const button = page.locator('[data-pp-analysis-button="true"]');
    await expect(button).toBeVisible();
    await button.click();

    // Wait until the polling request for job-a has actually reached the route
    // handler (i.e. it is in-flight) before dispatching SPA navigation.
    await jobAReachedPromise;

    // Now navigate to Video B — this should trigger cleanup and discard the
    // in-flight job-a response when it eventually resolves.
    await page.evaluate((nextVid) => {
      // Simulate SPA navigate start
      document.dispatchEvent(new CustomEvent("yt-navigate-start"));
      
      // Update URL and trigger replaceState
      history.replaceState(null, "", `?v=${nextVid}`);
      
      // Simulate SPA navigate finish
      document.dispatchEvent(new CustomEvent("yt-navigate-finish"));
    }, videoB);

    // Release the delayed analysis response for Video A
    resolveVideoA();

    // Wait a brief period to ensure the response was received and processed/ignored
    await page.waitForTimeout(1000);

    // Verify timeline markers for Video A are NOT rendered
    const markersCount = await page.locator(".pp-timeline-marker").count();
    expect(markersCount).toBe(0);

    // Verify results for Video A are NOT displayed in a panel
    const hasOldClaim = await page.locator('text="Old Claim"').count();
    expect(hasOldClaim).toBe(0);
  });
});
