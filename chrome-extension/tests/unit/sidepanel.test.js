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
    await vi.waitFor(() => {
      expect(chrome.tabs.query).toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "GET_ANALYSIS_STATE", videoId: "abcdefghijk" })
      );
    });
  });

  it("should update status UI on receiving state change message", async () => {
    let messageListener;
    chrome.runtime.onMessage.addListener.mockImplementation((listener) => {
      messageListener = listener;
    });

    sidepanelModule = await import("../../sidepanel.js");
    
    await vi.waitFor(() => {
      expect(messageListener).toBeDefined();
    });

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

  it("should handle error state correctly", async () => {
    let messageListener;
    chrome.runtime.onMessage.addListener.mockImplementation((listener) => {
      messageListener = listener;
    });

    sidepanelModule = await import("../../sidepanel.js");
    await vi.waitFor(() => {
      expect(messageListener).toBeDefined();
    });

    const message = {
      type: "ANALYSIS_STATE_CHANGED",
      videoId: "abcdefghijk",
      state: {
        status: "error",
        errorMessage: "Analysis failed due to rate limits"
      }
    };

    messageListener(message, {}, () => {});

    const stateError = document.getElementById("state-error");
    const errorMessage = document.getElementById("error-message");

    expect(stateError.style.display).toBe("flex");
    expect(errorMessage.textContent).toBe("Analysis failed due to rate limits");
  });

  it("should handle complete CHECK_CACHE states and renderResults correctly", async () => {
    let messageListener;
    chrome.runtime.onMessage.addListener.mockImplementation((listener) => {
      messageListener = listener;
    });

    // Mock CHECK_CACHE response from background
    const mockCacheData = {
      overall_assessment: "Likely True",
      claims: [
        {
          claim_text: "Test Claim 1",
          timestamp: "0:10",
          truth_profile: {
            overall_assessment: "Likely True",
            perspectives: {
              Scientific: { confidence: 0.9 }
            },
            bias_indicators: {
              logical_fallacies: ["Cherry Picking"],
              emotional_manipulation: ["Appeal to Fear"],
              deception_score: 2
            }
          }
        }
      ]
    };

    chrome.runtime.sendMessage.mockImplementation((msg) => {
      if (msg.type === "CHECK_CACHE") {
        return Promise.resolve({ success: true, data: mockCacheData });
      }
      return Promise.resolve({ success: true });
    });

    sidepanelModule = await import("../../sidepanel.js");
    await vi.waitFor(() => {
      expect(messageListener).toBeDefined();
    });

    const message = {
      type: "ANALYSIS_STATE_CHANGED",
      videoId: "abcdefghijk",
      state: {
        status: "complete"
      }
    };

    messageListener(message, {}, () => {});

    await vi.waitFor(() => {
      const stateResults = document.getElementById("state-results");
      expect(stateResults.style.display).toBe("flex");
      
      const badge = document.getElementById("overall-assessment-badge");
      expect(badge.textContent).toBe("Likely True");
      expect(badge.classList.contains("badge-true")).toBe(true);

      const claimsContainer = document.getElementById("claims-list-container");
      expect(claimsContainer.children.length).toBe(1);
      
      const claimCard = claimsContainer.querySelector(".claim-card");
      expect(claimCard).toBeDefined();
      expect(claimCard.querySelector(".claim-card-title").textContent).toBe("Test Claim 1");
      expect(claimCard.querySelector(".claim-timestamp").textContent).toBe("0:10");

      // Verify detail section
      const body = claimCard.querySelector(".claim-card-body");
      expect(body.style.display).toBe("none"); // collapsed by default

      const assessmentBadge = body.querySelector(".badge");
      expect(assessmentBadge.textContent).toBe("Likely True");

      const pItem = body.querySelector(".perspective-item");
      expect(pItem.querySelector(".perspective-info").textContent).toContain("Scientific");
      expect(pItem.querySelector(".perspective-fill").style.width).toBe("90%");

      const tags = body.querySelectorAll(".bias-tag");
      expect(tags[0].textContent).toBe("Cherry Picking");
      expect(tags[1].textContent).toBe("Appeal to Fear");

      const deceptionRow = body.querySelector(".deception-score-row");
      expect(deceptionRow.textContent).toContain("Deception Risk");
      expect(deceptionRow.textContent).toContain("2/10");
    });
  });

  it("should trigger cancel and retry buttons successfully", async () => {
    sidepanelModule = await import("../../sidepanel.js");
    await vi.waitFor(() => {
      expect(chrome.tabs.query).toHaveBeenCalled();
    });

    const cancelBtn = document.getElementById("pp-cancel-btn");
    const retryBtn = document.getElementById("pp-retry-btn");

    cancelBtn.click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CANCEL_ANALYSIS", videoId: "abcdefghijk" })
    );

    retryBtn.click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ANALYZE_VIDEO", videoId: "abcdefghijk" })
    );
  });
});
