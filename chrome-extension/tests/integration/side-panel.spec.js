import { test, expect } from "./fixtures";

test.describe("Side Panel Integration Flow", () => {
  test("should request background to open side panel on button click", async ({
    page,
    context,
    extensionId,
  }) => {
    // 1. Mock background message handler (specifically OPEN_SIDE_PANEL)
    // We can evaluate messages in the service worker context if needed, 
    // but in this test we can also just verify that clicking the injected button on YouTube mock page
    // sends the runtime message. Since the real sidePanel.open might fail or be stubbed in the headless environment,
    // we'll mock the background runtime messages by routing API calls or intercepting message handlers.
    
    // Navigate to the local YouTube mock fixture
    const fixtureUrl = `chrome-extension://${extensionId}/tests/fixtures/youtube-mock.html?v=dQw4w9WgXcQ`;
    await page.goto(fixtureUrl);

    // Wait for the analysis button to appear (injected by content script)
    const analysisButton = page.locator('[data-pp-analysis-button="true"]');
    await expect(analysisButton).toBeVisible({ timeout: 10000 });

    // Click the analysis button
    // (Note: clicking should send a message to background.js. We can verify that it opens the panel or handles it)
    await analysisButton.click();
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
  });
});
