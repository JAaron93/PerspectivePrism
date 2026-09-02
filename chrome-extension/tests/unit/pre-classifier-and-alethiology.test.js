import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PerspectivePrismClient, ValidationError } from "../../client.js";

describe("Track 5: Pre-Classifier and Alethiology Client & Sidepanel Unit Tests", () => {
  describe("PerspectivePrismClient - T5.1", () => {
    let client;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      client = new PerspectivePrismClient("http://localhost:8000");
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("should create analysis job with force_override and metadata in createAnalysisJob", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ job_id: "test-job-456", status: "pending" }),
      });
      globalThis.fetch = mockFetch;

      const videoUrl = "https://www.youtube.com/watch?v=abcdefghijk";
      const options = {
        forceOverride: true,
        metadata: {
          title: "The Daily Show",
          channel_name: "Comedy Central",
          category_id: "23",
          category_name: "Comedy",
          tags: ["politics", "satire"],
          description_snippet: "Satire breakdown of new bill",
        },
      };

      const result = await client.createAnalysisJob(videoUrl, options);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/analyze/jobs",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: videoUrl,
            force_override: true,
            metadata: options.metadata,
          }),
        }),
      );
      expect(result.job_id).toBe("test-job-456");
    });

    it("should accept force_override snake_case alternative in createAnalysisJob", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ job_id: "test-job-789", status: "pending" }),
      });
      globalThis.fetch = mockFetch;

      const videoUrl = "https://www.youtube.com/watch?v=abcdefghijk";
      await client.createAnalysisJob(videoUrl, { force_override: true });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/analyze/jobs",
        expect.objectContaining({
          body: JSON.stringify({
            url: videoUrl,
            force_override: true,
          }),
        }),
      );
    });

    it("should not deduplicate or reuse non-forced in-flight or persisted request when forceOverride is true", async () => {
      /** @type {any[]} */
      const requestBodies = [];
      const mockFetch = vi.fn().mockImplementation(async (url, opts) => {
        if (opts?.method === "POST") {
          requestBodies.push(JSON.parse(opts.body));
          return {
            ok: true,
            json: async () => ({
              job_id: `job-${requestBodies.length}`,
              status: "pending",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            result: {
              video_id: "abcdefghijk",
              metadata: { analyzed_at: "2026-09-02T12:00:00Z" },
              claims: [],
            },
          }),
        };
      });
      globalThis.fetch = mockFetch;

      const videoId = "abcdefghijk";

      // Start non-forced request (in flight)
      const ordinaryPromise = client.performAnalysis(videoId, { forceOverride: false });

      // Allow ordinaryPromise to pass cache check and enter in-flight state
      await new Promise((resolve) => setTimeout(resolve, 10));

      // While ordinary request is in flight, invoke forced request
      const overridePromise = client.performAnalysis(videoId, { forceOverride: true });

      await Promise.allSettled([ordinaryPromise, overridePromise]);

      // Verify that two distinct requests were made and the second one sent force_override: true
      expect(requestBodies.length).toBe(2);
      expect(requestBodies[0].force_override).toBe(false);
      expect(requestBodies[1].force_override).toBe(true);
    });

    it("should not attach to persisted non-forced request when forceOverride is true", async () => {
      const videoId = "persisted123";
      await chrome.storage.local.set({
        [`pending_request_${videoId}`]: {
          videoId,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          status: "pending",
          startTime: Date.now(),
          options: { forceOverride: false },
        },
      });

      /** @type {any[]} */
      const requestBodies = [];
      const mockFetch = vi.fn().mockImplementation(async (url, opts) => {
        if (opts?.method === "POST") {
          requestBodies.push(JSON.parse(opts.body));
          return {
            ok: true,
            json: async () => ({
              job_id: "override-job-1",
              status: "pending",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            result: {
              video_id: videoId,
              metadata: { analyzed_at: "2026-09-02T12:00:00Z" },
              claims: [],
            },
          }),
        };
      });
      globalThis.fetch = mockFetch;

      await client.performAnalysis(videoId, { forceOverride: true });

      expect(requestBodies.length).toBe(1);
      expect(requestBodies[0].force_override).toBe(true);

      const stored = await chrome.storage.local.get(`pending_request_${videoId}`);
      if (stored[`pending_request_${videoId}`]) {
        expect(Boolean(stored[`pending_request_${videoId}`].options?.forceOverride)).toBe(true);
      }
    });

    it("should ensure cancelled in-flight ordinary request does not corrupt replacement override state", async () => {
      const videoId = "cancelRace1";

      const mockFetch = vi.fn().mockImplementation(async (url, opts) => {
        if (opts?.method === "POST") {
          const body = JSON.parse(opts.body);
          if (!body.force_override) {
            return new Promise((_, reject) => {
              if (opts.signal) {
                opts.signal.addEventListener("abort", () => {
                  reject(new DOMException("The user aborted a request.", "AbortError"));
                });
              }
            });
          }
          return {
            ok: true,
            json: async () => ({
              job_id: "override-job-win",
              status: "pending",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            result: {
              video_id: videoId,
              metadata: { analyzed_at: "2026-09-02T12:00:00Z" },
              claims: [],
            },
          }),
        };
      });
      globalThis.fetch = mockFetch;

      // Start non-forced request
      const ordinaryPromise = client.performAnalysis(videoId, { forceOverride: false });

      // Wait until fetch starts and registers
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Now start override request
      const overridePromise = client.performAnalysis(videoId, { forceOverride: true });

      const [, resOverride] = await Promise.all([
        ordinaryPromise.catch((e) => e),
        overridePromise,
      ]);

      expect(resOverride.success).toBe(true);

      // Verify no retry alarm was scheduled for the cancelled ordinary request
      const alarms = await chrome.alarms.getAll();
      const retryAlarms = alarms.filter((a) => a.name.includes(videoId));
      expect(retryAlarms.length).toBe(0);

      // Verify pending request in-memory is cleared upon completion
      expect(client.pendingRequests.has(videoId)).toBe(false);
    });

    it("should return true when cancelAnalysis cancels request attached via pendingResolvers or persisted state without controller", async () => {
      const videoId = "noCtrlVid11";
      const resolveMock = vi.fn();
      client.pendingResolvers.set(videoId, [{ resolve: resolveMock, timeoutId: 123 }]);

      const cancelled = await client.cancelAnalysis(videoId);
      expect(cancelled).toBe(true);
      expect(resolveMock).toHaveBeenCalledWith(
        expect.objectContaining({ cancelled: true, error: "Analysis cancelled by user" })
      );
    });

    it("should await cleanup of cancelled request before forced replacement persists new state", async () => {
      const videoId = "cleanRace11";
      let cleanupDone = false;
      let persistStartedAfterCleanup = false;

      // Mock storage to simulate delay in cleanup
      const origRemove = chrome.storage.local.remove;
      const origSet = chrome.storage.local.set;

      chrome.storage.local.remove = vi.fn().mockImplementation(async (key) => {
        await new Promise((r) => setTimeout(r, 20));
        cleanupDone = true;
        return origRemove ? origRemove(key) : undefined;
      });

      chrome.storage.local.set = vi.fn().mockImplementation(async (items) => {
        if (items[`pending_request_${videoId}`]?.options?.forceOverride) {
          persistStartedAfterCleanup = cleanupDone;
        }
        return origSet ? origSet(items) : undefined;
      });

      const mockFetch = vi.fn().mockImplementation(async (url, opts) => {
        if (opts?.method === "POST") {
          const body = JSON.parse(opts.body);
          if (!body.force_override) {
            return new Promise((_, reject) => {
              if (opts.signal) {
                opts.signal.addEventListener("abort", () => {
                  reject(new DOMException("Aborted", "AbortError"));
                });
              }
            });
          }
          return {
            ok: true,
            json: async () => ({ job_id: "override-job", status: "pending" }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            result: { video_id: videoId, metadata: { analyzed_at: "2026-09-02T12:00:00Z" }, claims: [] },
          }),
        };
      });
      globalThis.fetch = mockFetch;

      const p1 = client.performAnalysis(videoId, { forceOverride: false });
      await new Promise((r) => setTimeout(r, 10));
      const p2 = client.performAnalysis(videoId, { forceOverride: true });

      await Promise.allSettled([p1, p2]);

      expect(persistStartedAfterCleanup).toBe(true);

      chrome.storage.local.remove = origRemove;
      chrome.storage.local.set = origSet;
    });

    it("should validate analysis data containing eligibility payload and empty claims", () => {
      const payload = {
        video_id: "abcdefghijk",
        metadata: {
          analyzed_at: "2026-09-02T12:00:00Z",
        },
        eligibility: {
          is_analysable: false,
          confidence_score: 0.96,
          detected_category: "Anime Music Video (AMV)",
          disclaimer_title: "Analysis Skipped",
          disclaimer_message: "This video appears to be non-political content.",
          key_topics_found: ["music", "lofi"],
        },
        claims: [],
      };

      expect(() => client.validateAnalysisData(payload)).not.toThrow();
    });

    it("should validate analysis data containing alethiology in truth_profile", () => {
      const payload = {
        video_id: "abcdefghijk",
        metadata: {
          analyzed_at: "2026-09-02T12:00:00Z",
        },
        claims: [
          {
            claim_text: "Microplastics detected in brain tissue",
            truth_profile: {
              overall_assessment: "Likely True",
              perspectives: {},
              bias_indicators: {
                logical_fallacies: [],
                emotional_manipulation: [],
              },
              alethiology: {
                primary_theory: "Correspondence (Empirical)",
                secondary_theory: "Consensus (Institutional Agreement)",
                epistemic_summary: "Physical measurement and statistical verification.",
                quote_evidences: ["Raman spectroscopy confirmed microplastic concentration"],
              },
            },
          },
        ],
      };

      expect(() => client.validateAnalysisData(payload)).not.toThrow();
    });

    it("should reject invalid alethiology or eligibility schemas", () => {
      const invalidEligibility = {
        video_id: "abcdefghijk",
        metadata: { analyzed_at: "2026-09-02T12:00:00Z" },
        eligibility: {
          is_analysable: "not-a-bool",
        },
        claims: [],
      };

      expect(() => client.validateAnalysisData(invalidEligibility)).toThrow(ValidationError);
    });
  });

  describe("Side Panel Controller - T5.2, T5.3, T5.4", () => {
    let sidepanelModule;

    beforeEach(() => {
      vi.resetModules();

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
          <div id="skeleton-container"></div>
        </div>
        <div id="state-error" style="display: none;">
          <div id="error-title">Error</div>
          <div id="error-message">Error message</div>
          <button id="pp-retry-btn">Retry</button>
        </div>
        <div id="state-ineligible" style="display: none;">
          <h2 id="disclaimer-title">Analysis Skipped</h2>
          <div id="disclaimer-category-badge"></div>
          <p id="disclaimer-message"></p>
          <button id="pp-force-analyze-btn">⚡ Analyze Anyway</button>
        </div>
        <div id="state-results" style="display: none;">
          <span id="overall-assessment-badge">Likely True</span>
          <div id="analysis-metadata">Metadata</div>
          <div id="claims-list-container"></div>
        </div>
      `;

      chrome.runtime.onMessage.addListener.mockClear();
      chrome.runtime.sendMessage.mockClear();
      chrome.tabs.query.mockClear();

      chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        const tabs = [{ id: 123, url: "https://www.youtube.com/watch?v=abcdefghijk" }];
        if (callback) callback(tabs);
        return Promise.resolve(tabs);
      });

      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "GET_ANALYSIS_STATE") {
          return Promise.resolve({
            success: true,
            state: { status: "idle" },
          });
        }
        return Promise.resolve({ success: true });
      });
    });

    afterEach(() => {
      document.body.innerHTML = "";
      vi.restoreAllMocks();
    });

    it("should render #state-ineligible when eligibility.is_analysable is false", async () => {
      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        expect(chrome.tabs.query).toHaveBeenCalled();
      });

      const ineligiblePayload = {
        is_analysable: false,
        confidence_score: 0.96,
        detected_category: "Anime Music Video (AMV)",
        disclaimer_title: "Analysis Skipped",
        disclaimer_message: "This video appears to be non-political media.",
        key_topics_found: ["amv"],
      };

      sidepanelModule.renderIneligibleDisclaimer(ineligiblePayload);

      const stateIneligible = document.getElementById("state-ineligible");
      const disclaimerTitle = document.getElementById("disclaimer-title");
      const categoryBadge = document.getElementById("disclaimer-category-badge");
      const disclaimerMessage = document.getElementById("disclaimer-message");

      expect(stateIneligible.style.display).toBe("flex");
      expect(disclaimerTitle.textContent).toBe("Analysis Skipped");
      expect(categoryBadge.textContent).toContain("Anime Music Video (AMV)");
      expect(categoryBadge.textContent).toContain("96%");
      expect(disclaimerMessage.textContent).toBe("This video appears to be non-political media.");
    });

    it("should dispatch forceOverride analysis when clicking #pp-force-analyze-btn", async () => {
      sidepanelModule = await import("../../sidepanel.js");

      await vi.waitFor(() => {
        expect(chrome.tabs.query).toHaveBeenCalled();
      });

      const forceBtn = document.getElementById("pp-force-analyze-btn");
      expect(forceBtn).toBeDefined();

      forceBtn.click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ANALYZE_VIDEO",
          videoId: "abcdefghijk",
          forceOverride: true,
        }),
      );

      const stateLoading = document.getElementById("state-loading");
      expect(stateLoading.style.display).toBe("flex");
    });

    it("should render Epistemic Lens card with chips and collapsible quotes", async () => {
      sidepanelModule = await import("../../sidepanel.js");

      const analysisData = {
        video_id: "abcdefghijk",
        metadata: { analyzed_at: "2026-09-02T12:00:00Z" },
        claims: [
          {
            claim_text: "Statistically significant microplastic concentration in brain tissue",
            truth_profile: {
              overall_assessment: "Likely True",
              perspectives: {},
              bias_indicators: {
                logical_fallacies: [],
                emotional_manipulation: [],
              },
              alethiology: {
                primary_theory: "Correspondence (Empirical)",
                secondary_theory: "Consensus (Institutional Agreement)",
                epistemic_summary: "Physical measurement and statistical verification.",
                quote_evidences: [
                  "Raman spectroscopy confirmed a statistically significant microplastic concentration",
                ],
              },
            },
          },
        ],
      };

      sidepanelModule.renderResults(analysisData);

      const lensCard = document.querySelector(".epistemic-lens-card");
      expect(lensCard).not.toBeNull();

      const primaryChip = lensCard.querySelector(".epistemic-chip-primary");
      expect(primaryChip.textContent).toContain("Correspondence (Empirical)");

      const secondaryChip = lensCard.querySelector(".epistemic-chip-secondary");
      expect(secondaryChip.textContent).toContain("Consensus (Institutional Agreement)");

      const summary = lensCard.querySelector(".epistemic-summary");
      expect(summary.textContent).toContain("Physical measurement and statistical verification.");

      const quoteToggle = lensCard.querySelector(".epistemic-quote-toggle");
      expect(quoteToggle).not.toBeNull();
      expect(quoteToggle.getAttribute("aria-expanded")).toBe("false");

      const quotesContent = lensCard.querySelector(".epistemic-quotes-content");
      expect(quotesContent.style.display).toBe("none");

      // Click toggle to expand
      quoteToggle.click();
      expect(quotesContent.style.display).toBe("block");
      expect(quoteToggle.getAttribute("aria-expanded")).toBe("true");
      expect(quotesContent.textContent).toContain("Raman spectroscopy confirmed");

      // Click again to collapse
      quoteToggle.click();
      expect(quotesContent.style.display).toBe("none");
      expect(quoteToggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("should discard stale analysis response when user initiates newer analysis on same video", async () => {
      sidepanelModule = await import("../../sidepanel.js");

      let resolveFirstAnalysis;
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "ANALYZE_VIDEO") {
          if (!message.forceOverride) {
            // First slow request returns ineligible disclaimer
            return new Promise((resolve) => {
              resolveFirstAnalysis = () =>
                resolve({
                  success: true,
                  data: {
                    video_id: message.videoId,
                    eligibility: {
                      is_analysable: false,
                      confidence_score: 0.95,
                      detected_category: "Music",
                      disclaimer_title: "Stale Ineligible",
                      disclaimer_message: "This should be discarded",
                    },
                    claims: [],
                  },
                });
            });
          }
          // Second forced request returns results
          return Promise.resolve({
            success: true,
            data: {
              video_id: message.videoId,
              claims: [{ claim_text: "Forced result" }],
            },
          });
        }
        return Promise.resolve({ success: true });
      });

      // 1. Initial analysis for video A (slow)
      const p1 = sidepanelModule.startAnalysis("videoA11char");

      // 2. User starts a new forced analysis for the same video A
      const p2 = sidepanelModule.startAnalysis("videoA11char", { forceOverride: true });
      await p2;

      const stateResults = document.getElementById("state-results");
      expect(stateResults.style.display).toBe("flex");

      // 3. First request resolves late
      resolveFirstAnalysis();
      await p1;

      // 4. Verify that results state was NOT overwritten by the stale disclaimer
      expect(stateResults.style.display).toBe("flex");
      const stateIneligible = document.getElementById("state-ineligible");
      expect(stateIneligible.style.display).toBe("none");
    });

    it("should discard stale analysis response when user navigates A -> B -> A before first request resolves", async () => {
      sidepanelModule = await import("../../sidepanel.js");

      let resolveVideoA1;
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "ANALYZE_VIDEO") {
          if (message.videoId === "videoA11char" && !message.forceOverride) {
            return new Promise((resolve) => {
              resolveVideoA1 = () =>
                resolve({
                  success: true,
                  data: {
                    video_id: "videoA11char",
                    eligibility: {
                      is_analysable: false,
                      confidence_score: 0.99,
                      detected_category: "Music",
                      disclaimer_title: "Stale Ineligible",
                      disclaimer_message: "Stale message",
                    },
                    claims: [],
                  },
                });
            });
          }
          return Promise.resolve({
            success: true,
            data: {
              video_id: message.videoId,
              claims: [{ claim_text: "Fresh result" }],
            },
          });
        }
        if (message.type === "GET_ANALYSIS_STATE") {
          return Promise.resolve({ success: true, state: { status: "idle" } });
        }
        return Promise.resolve({ success: true });
      });

      // 1. User starts analysis on Video A
      const p1 = sidepanelModule.startAnalysis("videoA11char");

      // 2. User navigates to Video B
      chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        const tabs = [{ id: 123, url: "https://www.youtube.com/watch?v=videoB11char" }];
        if (callback) callback(tabs);
        return Promise.resolve(tabs);
      });
      await sidepanelModule.checkCurrentTabState();

      // 3. User navigates back to Video A
      chrome.tabs.query.mockImplementation((queryInfo, callback) => {
        const tabs = [{ id: 123, url: "https://www.youtube.com/watch?v=videoA11char" }];
        if (callback) callback(tabs);
        return Promise.resolve(tabs);
      });
      await sidepanelModule.checkCurrentTabState();

      // 4. User starts fresh forced analysis on Video A
      const p2 = sidepanelModule.startAnalysis("videoA11char", { forceOverride: true });
      await p2;

      const stateResults = document.getElementById("state-results");
      expect(stateResults.style.display).toBe("flex");

      // 5. Video A1 resolves late
      resolveVideoA1();
      await p1;

      // 6. State should still be results, not overwritten by stale ineligible disclaimer
      expect(stateResults.style.display).toBe("flex");
      const stateIneligible = document.getElementById("state-ineligible");
      expect(stateIneligible.style.display).toBe("none");
    });

    it("should discard stale completion CHECK_CACHE response if newer analysis starts for the same video", async () => {
      sidepanelModule = await import("../../sidepanel.js");

      let resolveCheckCache;
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "CHECK_CACHE") {
          return new Promise((resolve) => {
            resolveCheckCache = () =>
              resolve({
                success: true,
                data: {
                  video_id: message.videoId,
                  eligibility: {
                    is_analysable: false,
                    confidence_score: 0.9,
                    detected_category: "Music",
                    disclaimer_title: "Stale Cache Result",
                    disclaimer_message: "Should be discarded",
                  },
                  claims: [],
                },
              });
          });
        }
        if (message.type === "ANALYZE_VIDEO") {
          return Promise.resolve({
            success: true,
            data: {
              video_id: message.videoId,
              claims: [{ claim_text: "Newer analysis result" }],
            },
          });
        }
        return Promise.resolve({ success: true });
      });

      // 1. Start on video A
      await sidepanelModule.startAnalysis("videoA11char");

      // 2. Trigger message complete for video A, invoking CHECK_CACHE
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0];
      if (messageListener) {
        messageListener({
          type: "ANALYSIS_STATE_CHANGED",
          videoId: "videoA11char",
          state: { status: "complete" },
        });
      }

      // 3. User triggers a newer analysis on video A before CHECK_CACHE resolves
      const pNew = sidepanelModule.startAnalysis("videoA11char", { forceOverride: true });
      await pNew;

      const stateResults = document.getElementById("state-results");
      expect(stateResults.style.display).toBe("flex");

      // 4. Now older CHECK_CACHE resolves late
      if (resolveCheckCache) resolveCheckCache();
      await new Promise((r) => setTimeout(r, 10));

      // 5. Results should remain displayed and not overwritten by stale cache disclaimer
      expect(stateResults.style.display).toBe("flex");
      const stateIneligible = document.getElementById("state-ineligible");
      expect(stateIneligible.style.display).toBe("none");
    });

    it("should advance activeAnalysisToken and discard stale CHECK_CACHE response when external in_progress state is received", async () => {
      sidepanelModule = await import("../../sidepanel.js");

      let resolveCheckCache;
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === "CHECK_CACHE") {
          return new Promise((resolve) => {
            resolveCheckCache = () =>
              resolve({
                success: true,
                data: {
                  video_id: message.videoId,
                  eligibility: {
                    is_analysable: false,
                    confidence_score: 0.95,
                    detected_category: "Music",
                    disclaimer_title: "Stale Cache Result",
                    disclaimer_message: "Should be discarded",
                  },
                  claims: [],
                },
              });
          });
        }
        return Promise.resolve({ success: true });
      });

      // 1. Video A completes, triggering CHECK_CACHE
      await sidepanelModule.startAnalysis("videoA11char");
      const messageListener = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0];
      messageListener({
        type: "ANALYSIS_STATE_CHANGED",
        videoId: "videoA11char",
        state: { status: "complete" },
      });

      // 2. Content script starts an external analysis for video A: broadcasts ANALYSIS_STATE_CHANGED in_progress
      messageListener({
        type: "ANALYSIS_STATE_CHANGED",
        videoId: "videoA11char",
        state: { status: "in_progress", submessage: "External analyzing..." },
      });

      const stateLoading = document.getElementById("state-loading");
      expect(stateLoading.style.display).toBe("flex");

      // 3. The older CHECK_CACHE resolves late
      if (resolveCheckCache) resolveCheckCache();
      await new Promise((r) => setTimeout(r, 10));

      // 4. Stale cache disclaimer must be discarded; loading state must remain intact
      expect(stateLoading.style.display).toBe("flex");
      const stateIneligible = document.getElementById("state-ineligible");
      expect(stateIneligible.style.display).toBe("none");
    });
  });
});
