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
  });
});
