import { test, expect, buildMockResult } from "./fixtures";

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
          result: buildMockResult("dQw4w9WgXcQ", "Cached Claim"),
        }),
      });
    });

    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await analysisButton.click();

    // Wait for analysis button state to become success
    await expect(analysisButton).toHaveClass(/pp-state-success/, { timeout: 10000 });
    await expect(page.locator("#pp-analysis-panel")).toHaveCount(0);

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

    // Should transition to success state without new network request
    await expect(analysisButton).toHaveClass(/pp-state-success/, { timeout: 10000 });
    await expect(page.locator("#pp-analysis-panel")).toHaveCount(0);

    // Assert no network requests were made
    expect(requestCount).toBe(0);

    // Cleanup listener
    page.removeListener("request", requestListener);
  });
});
