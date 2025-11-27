import { test, expect } from "./fixtures";

test.describe("Consent Flow", () => {
  test.beforeEach(async ({ context }) => {
    // Clear any stored consent
    await context.storageState({ path: undefined });
  });

  test("should show consent dialog on first analysis", async ({
    page,
    context,
  }) => {
    // Mock the backend API to avoid actual calls if consent is given
    await context.route("**/analyze/jobs", async (route) => {
      await route.fulfill({
        status: 202,
        body: JSON.stringify({ job_id: "job-1" }),
      });
    });
    await context.route("**/analyze/jobs/job-1", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "completed",
          result: { video_id: "test", claims: [] },
        }),
      });
    });

    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible();
    await analysisButton.click();

    // Check for consent dialog
    const consentHost = page.locator("#pp-consent-dialog-host");
    await expect(consentHost).toBeAttached();

    // Test "Deny"
    // Access buttons inside shadow DOM
    await consentHost.locator("#deny-btn").click();
    await expect(consentHost).toBeHidden();

    // Verify analysis did not proceed (button state reset or similar)

    // Trigger again
    await analysisButton.click();
    await expect(consentHost).toBeAttached();

    // Test "Allow"
    await consentHost.locator("#allow-btn").click();
    await expect(consentHost).toBeHidden();

    // Verify analysis proceeds (loading state or results)
  });
});
