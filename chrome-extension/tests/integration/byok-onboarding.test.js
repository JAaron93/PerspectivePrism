import { test, expect, getBackgroundWorker, buildMockResult } from "./fixtures";

test.describe("BYOK Supadata Onboarding & Quota Acceptance Tests", () => {
  test("US1: Initial Onboarding - shows onboarding panel when no key stored, saves key, and transitions away", async ({
    page,
    context,
    extensionId,
  }) => {
    // Open YouTube watch page
    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=PBSNewsHour`;
    await page.goto(fixtureUrl);

    // Open side panel in a new page
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html?v=PBSNewsHour`);

    // Verify #state-onboarding-key is visible
    const onboardingContainer = sidepanelPage.locator("#state-onboarding-key");
    await expect(onboardingContainer).toBeVisible();

    // Verify 100/mo text and "Get Free Key" link
    await expect(onboardingContainer).toContainText("100 transcript fetches per month");
    const getKeyLink = sidepanelPage.locator("#supadata-get-key-btn");
    await expect(getKeyLink).toBeVisible();
    await expect(getKeyLink).toHaveAttribute("href", "https://supadata.ai");

    // Enter key and save
    await sidepanelPage.fill("#supadata-key-input", "onboarding-free-key-123");
    await sidepanelPage.click("#supadata-key-save");

    // Verify onboarding panel transitions away
    await expect(onboardingContainer).toBeHidden();

    // Verify key is saved in chrome.storage.local
    const background = await getBackgroundWorker(context);
    const storedConfig = await background.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.storage.local.get("config", (res) => resolve(res.config));
      });
    });
    expect(storedConfig.supadataApiKey).toBe("onboarding-free-key-123");
  });

  test("US3 Browser: Quota Exhausted UI - renders supadata-quota state and transitions to onboarding on Change API Key", async ({
    page,
    context,
    extensionId,
  }) => {
    // Pre-populate a key so onboarding state doesn't block analysis
    const background = await getBackgroundWorker(context);
    await background.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.storage.local.set(
          {
            config: {
              backendUrl: "http://localhost:8000",
              supadataApiKey: "preconfigured-quota-key",
            },
          },
          resolve
        );
      });
    });

    // Mock backend returning 402 / SUPADATA_QUOTA_EXHAUSTED
    await context.route("**/analyze/jobs", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ job_id: "test-quota-job" }),
        });
      }
    });

    await context.route("**/analyze/jobs/test-quota-job", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "test-quota-job",
          status: "failed",
          error: "Supadata monthly transcript quota reached.",
          error_code: "SUPADATA_QUOTA_EXHAUSTED",
        }),
      });
    });

    // Open YouTube watch page
    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=PBSNewsHour`;
    await page.goto(fixtureUrl);
    const analysisBtn = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisBtn).toBeVisible({ timeout: 10000 });

    // Open Side Panel page and wait for idle state to be ready
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html?v=PBSNewsHour`);
    await expect(sidepanelPage.locator("#state-idle")).toBeVisible({ timeout: 10000 });

    // Trigger analysis from YouTube watch page
    await analysisBtn.click();

    // Verify #state-supadata-quota is rendered in Side Panel
    const quotaContainer = sidepanelPage.locator("#state-supadata-quota");
    await expect(quotaContainer).toBeVisible({ timeout: 10000 });

    // Verify upgrade plan link
    const upgradeLink = sidepanelPage.locator("#pp-quota-upgrade-btn");
    await expect(upgradeLink).toBeVisible();
    await expect(upgradeLink).toHaveAttribute("href", "https://supadata.ai/pricing");

    // Click "Change API Key" and verify transition to #state-onboarding-key
    const changeKeyBtn = sidepanelPage.locator("#pp-quota-change-key-btn");
    await expect(changeKeyBtn).toBeVisible();
    await changeKeyBtn.click();

    await expect(sidepanelPage.locator("#state-onboarding-key")).toBeVisible();
    await expect(quotaContainer).toBeHidden();
  });

  test("US4: Active Key Sync Across Pages - updates key without reload and forwards new key header", async ({
    page,
    context,
    extensionId,
  }) => {
    // 1. Pre-configure initial key "key-1"
    const background = await getBackgroundWorker(context);
    await background.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.storage.local.set(
          {
            config: {
              backendUrl: "http://localhost:8000",
              supadataApiKey: "key-1",
            },
          },
          resolve
        );
      });
    });

    // 2. Open YouTube watch page
    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=PBSNewsHour`;
    await page.goto(fixtureUrl);
    const analysisBtn = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisBtn).toBeVisible({ timeout: 10000 });

    // 3. Open Side Panel tab and wait for ready
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html?v=PBSNewsHour`);
    await expect(sidepanelPage.locator("#state-idle")).toBeVisible({ timeout: 10000 });

    // 4. Open Options page in a second tab and save key "key-2"
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

    await optionsPage.fill("#options-supadata-key", "key-2");
    await optionsPage.click("#options-save-keys");
    await expect(optionsPage.locator("#options-key-status")).toHaveText("Saved.");

    // 5. Intercept outbound POST /analyze/jobs to verify the X-Supadata-Key header
    let capturedHeader = null;
    await context.route("**/analyze/jobs", async (route) => {
      if (route.request().method() === "POST") {
        capturedHeader = route.request().headers()["x-supadata-key"];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ job_id: "test-sync-job" }),
        });
      }
    });

    await context.route("**/analyze/jobs/test-sync-job", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "test-sync-job",
          status: "completed",
          result: buildMockResult("PBSNewsHour", "Sync test claim", "Scientific"),
        }),
      });
    });

    // 6. Return to Side Panel without reloading and trigger analysis
    await sidepanelPage.bringToFront();
    await analysisBtn.click();

    // Verify analysis completes and intercepted header is "key-2"
    await expect(sidepanelPage.locator("#state-results")).toBeVisible({ timeout: 10000 });
    expect(capturedHeader).toBe("key-2");
  });
});
