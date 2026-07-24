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

    // Check for consent dialog host
    const consentHost = page.locator("#pp-consent-dialog-host");
    await expect(consentHost).toBeAttached();

    // --- Test "Deny" Flow ---
    await consentHost.locator("#deny-btn").click();
    await expect(consentHost).toBeHidden();

    // Assert NO analysis request was made
    expect(analysisRequestMade).toBe(false);

    // Assert button is still enabled/visible (reset state)
    await expect(analysisButton).toBeEnabled();
    await expect(analysisButton).not.toHaveAttribute("aria-busy", "true");

    // --- Test "Allow" Flow ---
    await analysisButton.click();
    await expect(consentHost).toBeAttached();

    // Click Allow inside shadow DOM
    await consentHost.locator("#allow-btn").click();
    await expect(consentHost).toBeHidden();

    // Assert analysis request WAS made and button transitions to success state
    await expect.poll(() => analysisRequestMade).toBe(true);
    await expect(analysisButton).toHaveClass(/pp-state-success/, { timeout: 10000 });
    await expect(page.locator("#pp-analysis-panel")).toHaveCount(0);
  });
});
