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

  test("should handle invalid backend URL", async ({ page, context }) => {
    // This might require changing settings first
    // Navigate to options page
    const extensionId = await (await context.serviceWorkers())[0]
      .url()
      .split("/")[2];
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.fill("#backendUrl", "invalid-url");
    await page.click("#saveSettings");

    // Verify validation error
    await expect(page.locator(".error-message")).toBeVisible();
  });
});
