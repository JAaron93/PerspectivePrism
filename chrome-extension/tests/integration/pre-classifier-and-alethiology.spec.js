import { test, expect } from "./fixtures";

test.describe("Pre-Classifier Guardrail Gate & Alethiology Side Panel Integration", () => {
  const VIDEO_ID = "pbsNews0123"; // Realistic journalism test fixture (11 chars)

  test("should display ineligible disclaimer and transition to full analysis with Epistemic Lens on Analyze Anyway", async ({
    page,
    context,
    extensionId,
  }) => {
    let overrideRequested = false;

    // 1. Mock backend API for Pre-Classifier and Force Override
    await context.route("**/analyze/jobs", async (route) => {
      if (route.request().method() === "POST") {
        const postData = JSON.parse(route.request().postData() || "{}");
        if (postData.force_override) {
          overrideRequested = true;
          await route.fulfill({
            status: 202,
            contentType: "application/json",
            body: JSON.stringify({ job_id: "job-override-456" }),
          });
        } else {
          await route.fulfill({
            status: 202,
            contentType: "application/json",
            body: JSON.stringify({ job_id: "job-ineligible-123" }),
          });
        }
      }
    });

    // Ineligible initial response
    await context.route("**/analyze/jobs/job-ineligible-123", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "job-ineligible-123",
          status: "completed",
          result: {
            video_id: VIDEO_ID,
            metadata: { analyzed_at: "2026-09-02T12:00:00Z" },
            eligibility: {
              is_analysable: false,
              confidence_score: 0.95,
              detected_category: "Music / Non-Speech Media",
              disclaimer_title: "Analysis Skipped",
              disclaimer_message:
                "This video appears to be non-political content and does not contain verifiable policy claims.",
              key_topics_found: ["ambient", "lofi"],
            },
            claims: [],
          },
        }),
      });
    });

    // Override response with claims and Alethiology specialist analysis
    await context.route("**/analyze/jobs/job-override-456", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "job-override-456",
          status: "completed",
          result: {
            video_id: VIDEO_ID,
            metadata: { analyzed_at: "2026-09-02T12:05:00Z" },
            eligibility: {
              is_analysable: true,
              confidence_score: 0.92,
              detected_category: "Science Reporting & Analysis",
              disclaimer_title: "",
              disclaimer_message: "",
              key_topics_found: ["microplastics", "health"],
            },
            claims: [
              {
                claim_text:
                  "Raman spectroscopy confirmed a statistically significant microplastic concentration in brain tissue",
                timestamp: "01:23",
                truth_profile: {
                  overall_assessment: "Likely True",
                  perspectives: {
                    Scientific: {
                      stance: "Support",
                      confidence: 0.95,
                      explanation:
                        "Physical spectroscopy measurements verify cross-barrier transport.",
                    },
                  },
                  bias_indicators: {
                    logical_fallacies: [],
                    emotional_manipulation: [],
                    deception_score: 1,
                  },
                  alethiology: {
                    primary_theory: "Correspondence (Empirical)",
                    secondary_theory: "Consensus (Institutional Agreement)",
                    epistemic_summary:
                      "Speaker relies on direct empirical physical measurement and statistical validation.",
                    quote_evidences: [
                      "Raman spectroscopy confirmed a statistically significant microplastic concentration (p < 0.001) in brain tissue",
                    ],
                  },
                },
              },
            ],
          },
        }),
      });
    });

    // 2. Open Side Panel
    const sidePanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    await page.goto(sidePanelUrl);

    // 3. Initiate analysis for the video
    await page.evaluate(async (vid) => {
      if (typeof window.startAnalysis === "function") {
        await window.startAnalysis(vid);
      }
    }, VIDEO_ID);

    // 4. Assert Ineligible State is displayed with disclaimer content
    const ineligibleState = page.locator("#state-ineligible");
    await expect(ineligibleState).toBeVisible({ timeout: 10000 });

    const disclaimerTitle = page.locator("#disclaimer-title");
    await expect(disclaimerTitle).toHaveText("Analysis Skipped");

    const categoryBadge = page.locator("#disclaimer-category-badge");
    await expect(categoryBadge).toContainText("Music / Non-Speech Media");
    await expect(categoryBadge).toContainText("95%");

    const forceBtn = page.locator("#pp-force-analyze-btn");
    await expect(forceBtn).toBeVisible();
    await expect(forceBtn).toHaveText(/Analyze Anyway/);

    // 5. Click "Analyze Anyway" (Force Override)
    await forceBtn.click();

    // 6. Verify backend received force_override: true
    await expect.poll(() => overrideRequested, { timeout: 10000 }).toBe(true);

    // 7. Verify Side Panel transitions to results with Epistemic Lens
    const resultsState = page.locator("#state-results");
    await expect(resultsState).toBeVisible({ timeout: 10000 });

    // Expand the claim card detail view
    const claimHeader = page.locator(".claim-card-header").first();
    await expect(claimHeader).toBeVisible({ timeout: 5000 });
    await claimHeader.click();

    const lensCard = page.locator(".epistemic-lens-card");
    await expect(lensCard).toBeVisible();

    const primaryChip = page.locator(".epistemic-chip-primary");
    await expect(primaryChip).toContainText("Correspondence (Empirical)");

    const secondaryChip = page.locator(".epistemic-chip-secondary");
    await expect(secondaryChip).toContainText("Consensus (Institutional Agreement)");

    const summary = page.locator(".epistemic-summary");
    await expect(summary).toContainText(
      "direct empirical physical measurement and statistical validation",
    );

    // 8. Test collapsible quote evidence drawer
    const quoteToggle = page.locator(".epistemic-quote-toggle");
    await expect(quoteToggle).toBeVisible();
    await expect(quoteToggle).toHaveAttribute("aria-expanded", "false");

    const quotesContent = page.locator(".epistemic-quotes-content");
    await expect(quotesContent).toBeHidden();

    // Expand quotes
    await quoteToggle.click();
    await expect(quoteToggle).toHaveAttribute("aria-expanded", "true");
    await expect(quotesContent).toBeVisible();
    await expect(quotesContent).toContainText("Raman spectroscopy confirmed");

    // Collapse quotes
    await quoteToggle.click();
    await expect(quoteToggle).toHaveAttribute("aria-expanded", "false");
    await expect(quotesContent).toBeHidden();
  });
});
