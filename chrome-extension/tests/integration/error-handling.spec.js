import { test, expect } from "./fixtures";

test.describe("Error Handling", () => {
  test("should handle backend timeout gracefully", async ({
    page,
    context,
  }) => {
    // Mock backend timeout
    await context.route("**/analyze/jobs", async (route) => {
      // Simulate a long delay or just abort
      // Or return 504
      await route.fulfill({ status: 504, body: "Gateway Timeout" });
    });

    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible();
    await analysisButton.click();

    // Verify error message
    // Assuming error state shows in panel or toast
    await expect(page.locator('text="Analysis failed"')).toBeVisible(); // Adjust text based on actual error message
  });

  test("should handle invalid backend URL", async ({ page, extensionId }) => {
    // Navigate to options page using fixture-provided extensionId
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.fill("#backendUrl", "invalid-url");
    await page.click("#saveSettings");

    // Verify validation error
    await expect(page.locator(".error-message")).toBeVisible();
  });

  test("should cancel in-progress analysis", async ({ page, context, extensionId }) => {
    // Mock the backend API with a delay to allow cancellation
    await context.route("**/analyze/jobs", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ job_id: "test-job-cancel" }),
      });
    });

    // Mock polling status - keep it "processing" indefinitely or for a long time
    await context.route("**/analyze/jobs/test-job-cancel", async (route) => {
       await new Promise(resolve => setTimeout(resolve, 500)); // Add delay
       await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "test-job-cancel",
          status: "processing",
        }),
      });
    });

    // Note: cancelAnalysis() aborts the AbortController to cancel the in-flight fetch
    // and performs local state cleanup. It does NOT call a backend cancellation endpoint,
    // so this test only asserts the UI effect (spinner hidden, cancel button gone, etc.).

    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=dQw4w9WgXcQ`;
    await page.goto(fixtureUrl);

    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible();
    await analysisButton.click();

    // Wait for panel and spinner
    const panel = page.locator("#pp-analysis-panel");
    await expect(panel).toBeVisible();
    
    // Find cancel button (it is initially hidden, then shown via class 'visible' or display block)
    // In panel-styles.js: .cancel-btn.visible { display: inline-block; }
    // We need to wait for it to become visible
    const cancelButton = panel.locator(".cancel-btn");
    await expect(cancelButton).toBeVisible({ timeout: 5000 });

    // Verify spinner is visible during processing (before cancel)
    const spinner = panel.locator(".spinner");
    await expect(spinner).toBeVisible();

    // Click cancel
    await cancelButton.click();

    // Verify UI state after cancellation:
    // Current behavior: panel is removed entirely and button reverts to idle state.
    // (No toast/message is displayed - the UI simply clears.)

    // 1. The entire panel should be removed from the DOM (not just hidden)
    await expect(panel).toHaveCount(0, { timeout: 5000 });

    // 3. Analysis button should revert to idle state (text: "Analyze Claims")
    await expect(analysisButton).toBeVisible();
    await expect(analysisButton).toContainText("Analyze Claims");

    // 4. Spinner should be gone from the page (not orphaned elsewhere)
    await expect(page.locator(".spinner")).toHaveCount(0);

    // TODO: Currently no user-facing "Analysis cancelled" toast/message is shown.
    // Consider adding explicit cancellation feedback (e.g., a temporary toast)
    // for better UX. When implemented, add assertion here:
    // await expect(page.locator('.toast')).toContainText('Analysis cancelled');
  });
});
