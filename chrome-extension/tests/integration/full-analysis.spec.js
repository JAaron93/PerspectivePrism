import { test, expect, buildMockResult } from "./fixtures";

test.describe("Full Analysis Flow", () => {
  test("should perform a full analysis flow with polling", async ({
    page,
    context,
    extensionId,
  }) => {
    let pollCount = 0;

    // Mock the backend API
    await context.route("**/analyze/jobs", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ job_id: "test-job-polling" }),
        });
      }
    });

    await context.route("**/analyze/jobs/test-job-polling", async (route) => {
      pollCount++;
      if (pollCount < 3) {
        // Return processing status for first 2 calls
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            job_id: "test-job-polling",
            status: "processing",
          }),
        });
      } else {
        // Return completed status
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            job_id: "test-job-polling",
            status: "completed",
            result: buildMockResult("dQw4w9WgXcQ", "This is a test claim.", "Scientific"),
          }),
        });
      }
    });

    // Navigate to the local fixture with a video ID parameter
    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=dQw4w9WgXcQ`;
    await page.goto(fixtureUrl);

    // Wait for the analysis button to appear (injected by content script)
    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible({ timeout: 10000 });

    // Click the analysis button
    await analysisButton.click();

    // Verify analysis completes and button transitions to success state
    await expect(analysisButton).toHaveClass(/pp-state-success/, { timeout: 10000 });
    await expect(page.locator("#pp-analysis-panel")).toHaveCount(0);

    // Assert that polling occurred at least 3 times (initial + retries)
    expect(pollCount).toBeGreaterThanOrEqual(3);
  });
});
