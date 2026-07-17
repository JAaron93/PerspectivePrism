import { test, expect } from "./fixtures";

test.describe("Side Panel Integration Flow", () => {
  test("should request background to open side panel on button click", async ({
    page,
    context,
    extensionId,
  }) => {
    // 1. Intercept OPEN_SIDE_PANEL message in background worker context
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");

    const messagePromise = background.evaluate(() => {
      return new Promise((resolve) => {
        const listener = (message, sender, sendResponse) => {
          if (message.type === "OPEN_SIDE_PANEL") {
            chrome.runtime.onMessage.removeListener(listener);
            resolve(message);
          }
        };
        chrome.runtime.onMessage.addListener(listener);
      });
    });

    // Navigate to the local YouTube mock fixture
    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=dQw4w9WgXcQ`;
    await page.goto(fixtureUrl);

    // Wait for the analysis button to appear (injected by content script)
    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible({ timeout: 10000 });

    // Click the analysis button
    await analysisButton.click();

    // Verify background received the OPEN_SIDE_PANEL message
    const msg = await messagePromise;
    expect(msg.type).toBe("OPEN_SIDE_PANEL");
    expect(msg.videoId).toBe("dQw4w9WgXcQ");
  });

  test("should render side panel UI states correctly", async ({
    page,
    extensionId,
  }) => {
    // Go directly to the side panel HTML page
    const sidePanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    await page.goto(sidePanelUrl);

    // 1. Verify idle state is displayed initially
    const idleState = page.locator("#state-idle");
    await expect(idleState).toBeVisible();
    await expect(page.locator("text=No Video Loaded")).toBeVisible();

    // 2. Transition and verify loading state
    await page.evaluate(() => window.showState("loading"));
    await expect(page.locator("#state-loading")).toBeVisible();
    await expect(page.locator("#pp-cancel-btn")).toBeVisible();

    // 3. Transition and verify error state
    await page.evaluate(() => window.showState("error"));
    await expect(page.locator("#state-error")).toBeVisible();
    await expect(page.locator("#pp-retry-btn")).toBeVisible();

    // 4. Transition and verify results state
    await page.evaluate(() => window.showState("results"));
    await expect(page.locator("#state-results")).toBeVisible();
  });
});
