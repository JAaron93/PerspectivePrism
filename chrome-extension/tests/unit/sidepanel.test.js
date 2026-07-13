import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Side Panel UI & Message Handling", () => {
  let sidepanelModule;

  beforeEach(async () => {
    // Reset module cache so each import runs top-level logic again
    vi.resetModules();

    // Set up a mock DOM layout mirroring sidepanel.html
    document.body.innerHTML = `
      <header>
        <button id="pp-options-btn">⚙️</button>
      </header>
      <div id="state-idle" style="display: flex;">Idle</div>
      <div id="state-loading" style="display: none;">
        <div id="loading-title">Loading</div>
        <div id="loading-submessage">Retrieving transcript...</div>
        <div id="progress-bar-fill" style="width: 0%;"></div>
        <button id="pp-cancel-btn">Cancel</button>
      </div>
      <div id="state-error" style="display: none;">
        <div id="error-title">Error</div>
        <div id="error-message">Error message</div>
        <button id="pp-retry-btn">Retry</button>
      </div>
      <div id="state-results" style="display: none;">
        <span id="overall-assessment-badge">Likely True</span>
        <div id="analysis-metadata">Metadata</div>
        <div id="claims-list-container"></div>
      </div>
    `;

    // Reset chrome runtime messaging
    chrome.runtime.onMessage.addListener.mockClear();
    chrome.runtime.sendMessage.mockClear();
    chrome.tabs.query.mockClear();

    // Default mock behavior
    chrome.tabs.query.mockImplementation((queryInfo, callback) => {
      const tabs = [{ id: 123, url: "https://www.youtube.com/watch?v=abcdefghijk" }];
      if (callback) callback(tabs);
      return Promise.resolve(tabs);
    });

    chrome.runtime.sendMessage.mockImplementation((message) => {
      if (message.type === "GET_ANALYSIS_STATE") {
        return Promise.resolve({
          success: true,
          state: { status: "idle" }
        });
      }
      return Promise.resolve({ success: true });
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("should request the initial analysis state on load", async () => {
    sidepanelModule = await import("../../sidepanel.js");
    
    // Wait for the async initialization (chrome.tabs.query and sendMessage)
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(chrome.tabs.query).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "GET_ANALYSIS_STATE", videoId: "abcdefghijk" })
    );
  });

  it("should update status UI on receiving state change message", async () => {
    let messageListener;
    chrome.runtime.onMessage.addListener.mockImplementation((listener) => {
      messageListener = listener;
    });

    sidepanelModule = await import("../../sidepanel.js");
    
    // Wait for initial tab check to finish
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(messageListener).toBeDefined();

    // Simulate sending an ANALYSIS_STATE_CHANGED message
    const message = {
      type: "ANALYSIS_STATE_CHANGED",
      videoId: "abcdefghijk",
      state: {
        status: "in_progress",
        progress: 50
      }
    };

    messageListener(message, {}, () => {});

    // Check if the DOM updated
    const stateLoading = document.getElementById("state-loading");
    const progressBarFill = document.getElementById("progress-bar-fill");
    
    expect(stateLoading.style.display).toBe("flex");
    expect(progressBarFill.style.width).toBe("50%");
  });
});
