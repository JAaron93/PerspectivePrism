/**
 * test-cache.html logging harness security tests
 *
 * Reproduces code-scanning alerts #2 (js/xss-through-exception) and
 * #3 (js/xss-through-dom): the page's console.log/console.error overrides
 * must render captured arguments as plain text, never as HTML.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("test-cache.html console logging harness", () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const payload = '<img src=x onerror="window.__xss=true">';

  beforeAll(() => {
    document.body.innerHTML =
      '<div id="results"></div><div class="log" id="log"></div>';
    const html = fs.readFileSync(
      path.resolve(__dirname, "../../test-cache.html"),
      "utf8"
    );
    const firstScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    new Function("window", firstScript)(globalThis);
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it("renders console.log arguments as plain text, not HTML", () => {
    console.log(payload);
    const log = document.getElementById("log");
    expect(log.querySelector("img")).toBeNull();
    expect(log.textContent).toContain(payload);
  });

  it("renders exception text from console.error as plain text, not HTML", () => {
    console.error(
      "Test failed with exception:",
      new Error('<svg onload="window.__xss=true">')
    );
    const log = document.getElementById("log");
    expect(log.querySelector("svg")).toBeNull();
    expect(log.textContent).toContain('<svg onload="window.__xss=true">');
  });

  it("keeps INFO and ERROR entries distinguishable", () => {
    const entries = [...document.getElementById("log").children];
    const infoEntry = entries.find((el) =>
      el.textContent.startsWith("INFO:")
    );
    const errorEntry = entries.find((el) =>
      el.textContent.startsWith("ERROR:")
    );
    expect(infoEntry).toBeTruthy();
    expect(errorEntry).toBeTruthy();
    expect(errorEntry.style.color).toBe("red");
  });

  it("never executes injected script side effects", () => {
    expect(window.__xss).toBeUndefined();
  });
});
