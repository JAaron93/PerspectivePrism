import { createServer } from "node:http";
import { test, expect, getBackgroundWorker, buildMockResult } from "./fixtures";

test.describe("Side Panel Integration Flow", () => {
  test("uses live local Supadata keys without reloading the panel", async ({ page, context, extensionId, mockBackendPort }) => {
    const videoId = "science0001";
    const keys = ["track2-browser-key-old", "track2-browser-key-new"];
    const requests = [];
    const logs = [];

    const server = createServer(async (request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Supadata-Key");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Private-Network", "true");
      response.setHeader("Content-Type", "application/json");
      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }
      if (request.method === "POST" && request.url === "/analyze/jobs") {
        let body = "";
        for await (const chunk of request) body += chunk;
        requests.push({ key: request.headers["x-supadata-key"], body: JSON.parse(body) });
        response.end(JSON.stringify({ job_id: `science-job-${requests.length}` }));
      } else if (request.method === "GET" && request.url.startsWith("/analyze/jobs/")) {
        response.end(JSON.stringify({
          status: "completed",
          result: buildMockResult(videoId, "PBS NewsHour examines evidence for climate policy.", "Scientific"),
        }));
      } else {
        response.writeHead(404).end(JSON.stringify({ error: "Unexpected test request" }));
      }
    });

    try {
      // The fixture maps localhost:8000 to this ephemeral port, so the extension's
      // default backend URL reaches this server without clashing with a live backend.
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(mockBackendPort, "127.0.0.1", resolve);
      });
      const background = await getBackgroundWorker(context);
      const captureLog = (message) => logs.push(message.text());
      background.on("console", captureLog);
      page.on("console", captureLog);

      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await page.waitForFunction(() => typeof window.startAnalysis === "function");
      const settingsPage = await context.newPage();
      settingsPage.on("console", captureLog);
      await settingsPage.goto(`chrome-extension://${extensionId}/options.html`);
      const youtubePage = await context.newPage();
      await youtubePage.goto(`https://www.youtube.com/watch?v=${videoId}`);

      for (const key of [...keys, "", null]) {
        await settingsPage.evaluate(async (supadataApiKey) => {
          const { config } = await chrome.storage.local.get("config");
          if (supadataApiKey === null) {
            delete config.supadataApiKey;
          } else {
            config.supadataApiKey = supadataApiKey;
          }
          await chrome.storage.local.set({ config });
        }, key);
        await page.evaluate(async (id) => {
          await window.startAnalysis(id, {
            forceOverride: true,
            metadata: { title: "Climate policy evidence", channel_name: "PBS NewsHour" },
          });
        }, videoId);
        await expect(page.locator("#state-results")).toBeVisible();
        expect(requests.at(-1).key).toBe(key || undefined);
        expect(requests.at(-1).body).toEqual({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          force_override: true,
          metadata: { title: "Climate policy evidence", channel_name: "PBS NewsHour" },
        });
      }
      expect(requests).toHaveLength(4);
      const storage = await background.evaluate(async () => ({
        local: await chrome.storage.local.get(null),
        session: await chrome.storage.session.get(null),
      }));
      for (const key of keys) {
        expect(JSON.stringify(storage)).not.toContain(key);
        expect(logs.join("\n")).not.toContain(key);
      }
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

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

    // 1. Verify onboarding key state is displayed initially when no API key is configured
    await expect(page.locator("#state-onboarding-key")).toBeVisible();
    await expect(page.locator("#supadata-key-input")).toBeVisible();

    // 2. Transition and verify idle state
    await page.evaluate(() => window.showState("idle"));
    const idleState = page.locator("#state-idle");
    await expect(idleState).toBeVisible();
    await expect(page.locator("text=No Video Loaded")).toBeVisible();

    // 3. Transition and verify loading state
    await page.evaluate(() => window.showState("loading"));
    await expect(page.locator("#state-loading")).toBeVisible();
    await expect(page.locator("#pp-cancel-btn")).toBeVisible();

    // 4. Transition and verify error state
    await page.evaluate(() => window.showState("error"));
    await expect(page.locator("#state-error")).toBeVisible();
    await expect(page.locator("#pp-retry-btn")).toBeVisible();

    // 5. Transition and verify results state
    await page.evaluate(() => window.showState("results"));
    await expect(page.locator("#state-results")).toBeVisible();

    // 6. Transition and verify Supadata quota state
    await page.evaluate(() => window.showState("supadata-quota"));
    await expect(page.locator("#state-supadata-quota")).toBeVisible();
  });
});
