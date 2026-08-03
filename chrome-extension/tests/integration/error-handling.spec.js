import { test, expect } from "./fixtures";

test.describe("Error Handling", () => {
  test("should handle backend timeout gracefully", async ({
    page,
    context,
    extensionId,
  }) => {
    // Mock backend timeout
    await context.route("**/analyze/jobs", async (route) => {
      // Simulate a long delay or just abort
      // Or return 504
      await route.fulfill({ status: 504, body: "Gateway Timeout" });
    });

    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=dQw4w9WgXcQ`;
    await page.goto(fixtureUrl);
    
    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible();
    await analysisButton.click();

    // Verify error state updates analysis button without in-DOM overlay panel
    await expect(analysisButton).toHaveClass(/pp-state-error/, { timeout: 15000 });
    await expect(page.locator("#pp-analysis-panel")).toHaveCount(0);
  });

  test("should handle invalid backend URL", async ({ page, extensionId }) => {
    // Navigate to options page using fixture-provided extensionId
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.fill("#backend-url", "invalid-url");
    await page.focus("#save-settings"); // Trigger blur validation on backend-url input

    // Verify validation error
    await expect(page.locator("#backend-url-error")).toBeVisible();
  });

  test("should handle in-progress analysis without DOM overlay injection", async ({ page, context, extensionId }) => {
    // Mock backend API
    await context.route("**/analyze/jobs", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ job_id: "test-job-cancel" }),
      });
    });

    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=dQw4w9WgXcQ`;
    await page.goto(fixtureUrl);

    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible();
    await analysisButton.click();

    // Verify button state transitions to loading without inserting #pp-analysis-panel
    await expect(analysisButton).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#pp-analysis-panel")).toHaveCount(0);
  });
});
