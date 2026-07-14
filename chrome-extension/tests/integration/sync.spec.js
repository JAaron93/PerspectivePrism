import { test, expect, buildMockResult } from "./fixtures.js";

test.describe("Playback Synchronization Integration Flow", () => {
  test("should synchronize video playback with side panel claims", async ({
    page,
    extensionId,
    context
  }) => {
    const videoId = "dQw4w9WgXcQ";
    const claimText1 = "First Claim at 10s";
    const claimText2 = "Second Claim at 30s";

    // 1. Mock the analysis jobs API to return completed results
    await context.route("**/analyze/jobs", async (route) => {
      await route.fulfill({
        status: 202,
        body: JSON.stringify({ job_id: "job-sync-1" })
      });
    });

    const mockResult = {
      video_id: videoId,
      metadata: { analyzed_at: new Date().toISOString() },
      claims: [
        {
          claim_text: claimText1,
          timestamp: "0:10",
          video_timestamp_start: 10,
          video_timestamp_end: 15,
          truth_profile: {
            overall_assessment: "Likely True",
            perspectives: {},
            bias_indicators: {
              logical_fallacies: [],
              emotional_manipulation: [],
              deception_score: 1
            }
          }
        },
        {
          claim_text: claimText2,
          timestamp: "0:30",
          video_timestamp_start: 30,
          video_timestamp_end: 35,
          truth_profile: {
            overall_assessment: "Likely False",
            perspectives: {},
            bias_indicators: {
              logical_fallacies: [],
              emotional_manipulation: [],
              deception_score: 8
            }
          }
        }
      ]
    };

    await context.route("**/analyze/jobs/job-sync-1", async (route) => {
      const responseBody = {
        status: "completed",
        result: mockResult
      };
      console.log("[TEST MOCK LOG] Fulfilling job-sync-1 with:", JSON.stringify(responseBody));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseBody)
      });
    });

    // 2. Navigate to YouTube mock page
    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=${videoId}`;
    await page.goto(fixtureUrl);

    // 3. Inject video element and progress bar elements
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

    // 4. Click analysis button in the content script
    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible();
    await analysisButton.click();

    // 5. Open and load the Side Panel URL in a separate page tab to simulate side panel frame
    const sidePanelPage = await context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Verify it loads results (reaches complete status)
    const stateResults = sidePanelPage.locator("#state-results");
    await expect(stateResults).toBeVisible({ timeout: 10000 });

    const claimsContainer = sidePanelPage.locator("#claims-list-container");
    await expect(claimsContainer.locator(".claim-card")).toHaveCount(2);

    const cards = claimsContainer.locator(".claim-card");

    // 6. Simulate playback and verify auto-scrolling & highlights
    // Case 1: currentTime = 5 (before first claim at 10s) -> no highlights
    await page.evaluate(() => {
      const video = document.querySelector("video");
      video.currentTime = 5;
      video.dispatchEvent(new Event("timeupdate"));
    });

    // Verify no active class on cards
    await expect(cards.nth(0)).not.toHaveClass(/pp-claim-active/);
    await expect(cards.nth(1)).not.toHaveClass(/pp-claim-active/);

    // Case 2: currentTime = 15 (between first and second claim) -> highlight Claim 1
    await page.evaluate(() => {
      const video = document.querySelector("video");
      video.currentTime = 15;
      video.dispatchEvent(new Event("timeupdate"));
    });

    // Wait and verify active highlight on card 0
    await expect(cards.nth(0)).toHaveClass(/pp-claim-active/);
    await expect(cards.nth(1)).not.toHaveClass(/pp-claim-active/);

    // Case 3: currentTime = 45 (after final claim at 30s) -> highlight Claim 2 (final claim remains highlighted)
    await page.evaluate(() => {
      const video = document.querySelector("video");
      video.currentTime = 45;
      video.dispatchEvent(new Event("timeupdate"));
    });

    await expect(cards.nth(0)).not.toHaveClass(/pp-claim-active/);
    await expect(cards.nth(1)).toHaveClass(/pp-claim-active/);

    // 7. Click timeline marker cluster to seek video
    // Verify markers exist on main page
    const marker = page.locator(".pp-timeline-marker").first();
    await expect(marker).toBeVisible();

    // Click marker
    await marker.click();

    // Verify video currentTime was seeked to 10s (the cluster timestamp seconds)
    const currentTime = await page.evaluate(() => document.querySelector("video").currentTime);
    expect(currentTime).toBe(10);

    // Verify Side Panel updated highlight to Claim 1
    await expect(cards.nth(0)).toHaveClass(/pp-claim-active/);
  });
});
