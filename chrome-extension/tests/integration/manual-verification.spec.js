import { test, expect } from "./fixtures";
import path from "node:path";
import fs from "node:fs";

function getScreenshotPath(filename) {
  const customDir = process.env.ARTIFACT_DIR || "/Users/pretermodernist/.gemini/antigravity/brain/2492ab57-fd8a-4fd5-9dfe-193fd82ca654";
  if (fs.existsSync(customDir)) {
    return path.join(customDir, filename);
  }
  const fallbackDir = path.join(process.cwd(), "test-results");
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return path.join(fallbackDir, filename);
}

test.describe("Track 3 Manual Verification Steps via Playwright", () => {
  test("Step 1: Inspect sidepanel.html rendering for both light and dark themes", async ({
    page,
    extensionId,
  }) => {
    const sidePanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    await page.goto(sidePanelUrl);
    await page.setViewportSize({ width: 380, height: 600 });

    // --- Onboarding Key State in Light Mode ---
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("#state-onboarding-key")).toBeVisible();
    await page.screenshot({
      path: getScreenshotPath("step1-onboarding-light.png"),
      fullPage: true,
    });

    // --- Onboarding Key State in Dark Mode ---
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("#state-onboarding-key")).toBeVisible();
    await page.screenshot({
      path: getScreenshotPath("step1-onboarding-dark.png"),
      fullPage: true,
    });

    // --- Quota State in Light Mode ---
    await page.evaluate(() => window.showState("supadata-quota"));
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("#state-supadata-quota")).toBeVisible();
    await page.screenshot({
      path: getScreenshotPath("step1-quota-light.png"),
      fullPage: true,
    });

    // --- Quota State in Dark Mode ---
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("#state-supadata-quota")).toBeVisible();
    await page.screenshot({
      path: getScreenshotPath("step1-quota-dark.png"),
      fullPage: true,
    });
  });

  test("Step 2: Verify keyboard navigation across onboarding controls", async ({
    page,
    extensionId,
  }) => {
    const sidePanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    await page.goto(sidePanelUrl);
    await page.setViewportSize({ width: 380, height: 600 });

    // 1. On onboarding state entry, input is pre-focused
    await expect(page.locator("#state-onboarding-key")).toBeVisible();
    await expect(page.locator("#supadata-key-input")).toBeFocused();

    // 2. Tab to visibility toggle button
    await page.keyboard.press("Tab");
    await expect(page.locator("#supadata-key-toggle")).toBeFocused();

    // 3. Tab to "Get Free Key ↗" link
    await page.keyboard.press("Tab");
    await expect(page.locator("#supadata-get-key-btn")).toBeFocused();

    // 4. Tab to "Save & Continue" button
    await page.keyboard.press("Tab");
    await expect(page.locator("#supadata-key-save")).toBeFocused();

    // Capture screenshot of keyboard focus state
    await page.screenshot({
      path: getScreenshotPath("step2-keyboard-navigation.png"),
      fullPage: true,
    });
  });

  test("Step 3: Verify Enter key and Save button validation with empty input", async ({
    page,
    extensionId,
  }) => {
    const sidePanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    await page.goto(sidePanelUrl);
    await page.setViewportSize({ width: 380, height: 600 });

    // 1. Focus input and press Enter with empty input
    const input = page.locator("#supadata-key-input");
    await input.focus();
    await input.fill("");
    await page.keyboard.press("Enter");

    // Verify error surfaces without exceptions
    const errorMsg = page.locator("#supadata-key-error");
    await expect(errorMsg).toBeVisible();
    expect(await errorMsg.textContent()).toContain("Please enter a valid Supadata API key.");

    await page.screenshot({
      path: getScreenshotPath("step3-validation-error.png"),
      fullPage: true,
    });

    // 2. Typing into the input clears the validation error
    await input.pressSequentially("test-api-key");
    await expect(errorMsg).toBeHidden();

    // 3. Empty the input again and click Save directly
    await input.fill("");
    await page.locator("#supadata-key-save").click();
    await expect(errorMsg).toBeVisible();
    expect(await errorMsg.textContent()).toContain("Please enter a valid Supadata API key.");
  });

  test("Step 4: Verify Change API Key from quota state transitions to onboarding with input focused", async ({
    page,
    extensionId,
  }) => {
    const sidePanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    await page.goto(sidePanelUrl);
    await page.setViewportSize({ width: 380, height: 600 });

    // 1. Transition to quota state
    await page.evaluate(() => window.showState("supadata-quota"));
    await expect(page.locator("#state-supadata-quota")).toBeVisible();
    await expect(page.locator("#state-onboarding-key")).toBeHidden();

    // 2. Click "Change API Key" button
    const changeBtn = page.locator("#pp-quota-change-key-btn");
    await expect(changeBtn).toBeVisible();
    await changeBtn.click();

    // 3. Verify transition to onboarding state with input pre-focused
    await expect(page.locator("#state-onboarding-key")).toBeVisible();
    await expect(page.locator("#state-supadata-quota")).toBeHidden();
    await expect(page.locator("#supadata-key-input")).toBeFocused();

    await page.screenshot({
      path: getScreenshotPath("step4-quota-to-onboarding.png"),
      fullPage: true,
    });
  });
});
