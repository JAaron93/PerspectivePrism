import { test, expect } from "./fixtures";

test.describe("Full Analysis Flow", () => {
  test("should perform a full analysis flow on a YouTube video", async ({
    page,
    context,
    extensionId,
  }) => {
    // Mock the backend API
    await context.route("**/analyze/jobs", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ job_id: "test-job-123" }),
        });
      }
    });

    await context.route("**/analyze/jobs/test-job-123", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "test-job-123",
          status: "completed",
          result: {
            video_id: "dQw4w9WgXcQ",
            claims: [
              {
                text: "This is a test claim.",
                perspectives: [
                  {
                    source: "Scientific",
                    text: "Confirmed by science.",
                    sentiment: "positive",
                  },
                ],
                bias_indicators: [],
              },
            ],
            truth_profile: { deception_score: 10 },
          },
        }),
      });
    });

    // Navigate to a YouTube video
    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    // Wait for the analysis button to appear
    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible({ timeout: 10000 });

    // Click the analysis button
    await analysisButton.click();

    // Verify loading state (button should indicate loading or panel should open)
    // Assuming panel opens and shows loading
    const panel = page.locator("#pp-analysis-panel"); // Shadow host
    // Access shadow DOM
    // Note: Playwright handles shadow DOM automatically with locators if configured,
    // but sometimes we need to be explicit.

    // Wait for panel to appear
    await expect(panel).toBeAttached();

    // Check for results
    // Since we mocked the response to be immediate, we might skip loading state check if it's too fast
    // But we should see the claim
    await expect(page.locator('text="This is a test claim."')).toBeVisible();

    // Verify cache hit on second analysis (this might be harder to test with mocks unless we track requests)
    // We can check if the button says "View Results" or similar if that's the UI behavior
  });
});
