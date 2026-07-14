import { test, expect } from "./fixtures";

test.describe("Cache Management", () => {
  test("should cache analysis results", async ({ page, context }) => {
    // Mock successful analysis
    await context.route("**/analyze/jobs", async (route) => {
      await route.fulfill({
        status: 202,
        body: JSON.stringify({ job_id: "job-cache" }),
      });
    });
    await context.route("**/analyze/jobs/job-cache", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "completed",
          result: {
            video_id: "dQw4w9WgXcQ",
            metadata: { analyzed_at: new Date().toISOString() },
            claims: [
              {
                claim_text: "Cached Claim",
                timestamp: "00:00",
                video_timestamp_start: 0,
                video_timestamp_end: 5,
                truth_profile: {
                  overall_assessment: "Likely True",
                  perspectives: {},
                  bias_indicators: {
                    logical_fallacies: [],
                    emotional_manipulation: [],
                    deception_score: 0,
                  },
                },
              },
            ],
          },
        }),
      });
    });

    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await analysisButton.click();

    // Wait for results
    await expect(page.locator('text="Cached Claim"')).toBeVisible();

    // Reload page to test cache
    await page.reload();

    // Track network requests
    let requestCount = 0;
    const requestListener = (request) => {
      if (request.url().includes("/analyze/jobs")) {
        requestCount++;
      }
    };
    page.on("request", requestListener);

    // Remove mocks - cached results should work without network
    await context.unroute("**/analyze/jobs");
    await context.unroute("**/analyze/jobs/job-cache");

    await expect(analysisButton).toBeVisible();
    await analysisButton.click();

    // Should show results immediately (or very quickly) without new network request
    await expect(page.locator('text="Cached Claim"')).toBeVisible();

    // Assert no network requests were made
    expect(requestCount).toBe(0);

    // Cleanup listener
    page.removeListener("request", requestListener);
  });
});
