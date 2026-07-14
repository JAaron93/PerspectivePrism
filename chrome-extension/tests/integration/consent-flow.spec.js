import { test, expect, getBackgroundWorker, buildMockResult } from "./fixtures";

test.describe("Consent Flow", () => {
  test.beforeEach(async ({ context }) => {
    // Clear browser state
    await context.clearCookies();
    await context.clearPermissions();

    // Clear extension storage (sync and local) via service worker
    const background = await getBackgroundWorker(context);

    await background.evaluate(async () => {
      await new Promise((resolve) => chrome.storage.sync.clear(resolve));
      await new Promise((resolve) => chrome.storage.local.clear(resolve));
      await new Promise((resolve) => chrome.storage.sync.set({
        config: { backendUrl: "http://localhost:8000" }
      }, resolve));
    });
  });

  test("should show consent dialog on first analysis and respect user choice", async ({
    page,
    context,
  }) => {
    let analysisRequestMade = false;

    // Mock the backend API
    await context.route("**/analyze/jobs", async (route) => {
      analysisRequestMade = true;
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
          result: buildMockResult("dQw4w9WgXcQ", "Test Claim"),
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

    // --- Test "Deny" Flow ---
    // Click Deny inside shadow DOM
    await consentHost.locator("#deny-btn").click();
    await expect(consentHost).toBeHidden();

    // Assert NO analysis request was made
    expect(analysisRequestMade).toBe(false);

    // Assert button is still enabled/visible (reset state)
    await expect(analysisButton).toBeEnabled();
    await expect(analysisButton).not.toHaveAttribute("aria-busy", "true");

    // --- Test "Allow" Flow ---
    // Trigger analysis again
    await analysisButton.click();
    await expect(consentHost).toBeAttached();

    // Click Allow inside shadow DOM
    await consentHost.locator("#allow-btn").click();
    await expect(consentHost).toBeHidden();

    // Assert analysis request WAS made
    // We might need to wait a bit if it's async, but route handler sets flag immediately on request
    // Better to wait for the response or the UI change
    await expect.poll(() => analysisRequestMade).toBe(true);

    // Verify loading state or results
    // Assuming panel opens
    const panel = page.locator("#pp-analysis-panel");
    await expect(panel).toBeAttached();

    // Verify results eventually appear
    await expect(page.locator('text="Test Claim"')).toBeVisible();
  });
});
