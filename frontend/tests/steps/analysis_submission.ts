import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'

const { Given, When, Then } = createBdd()

const NEWS_VIDEO_URL = 'https://www.youtube.com/watch?v=PBSNewsHour_BudgetBriefing'
const JOB_ID = 'bdd-smoke-job-1'

const COMPLETED_JOB_STATUS = {
  job_id: JOB_ID,
  status: 'completed',
  error: null,
  error_code: null,
  result: {
    video_id: 'PBSNewsHour_BudgetBriefing',
    metadata: { analyzed_at: '2026-10-17T12:00:00Z' },
    eligibility: null,
    claims: [
      {
        claim_text: 'The infrastructure bill allocates 500 billion dollars over ten years.',
        video_timestamp_start: 0,
        video_timestamp_end: 8,
        truth_profile: {
          overall_assessment: 'Likely True',
          perspectives: {
            Scientific: { stance: 'Support', confidence: 0.9, explanation: 'Budget documents confirm the allocation.' },
            Journalistic: { stance: 'Support', confidence: 0.85, explanation: 'Multiple outlets report the same figure.' },
            'Partisan (Left)': { stance: 'Refute', confidence: 0.7, explanation: 'Commentators dispute the projection.' },
            'Partisan (Right)': { stance: 'Ambiguous', confidence: 0.6, explanation: 'Coverage is mixed.' },
          },
          bias_indicators: {
            logical_fallacies: [],
            emotional_manipulation: [],
            deception_score: 2.5,
          },
          alethiology: {
            primary_theory: 'Correspondence (Empirical)',
            secondary_theory: null,
            epistemic_summary: 'The speaker grounds the claim in budget documents.',
            quote_evidences: ['allocates 500 billion dollars'],
          },
        },
      },
    ],
  },
}

Given('the analysis API will answer with a completed news-video job', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job_id: JOB_ID }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(COMPLETED_JOB_STATUS),
    })
  })
})

When('the user submits a YouTube news video URL', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('YouTube URL').fill(NEWS_VIDEO_URL)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
})

Then('the results header shows the analyzed video', async ({ page }) => {
  await expect(page.locator('.results-header')).toContainText('Analysis Results')
  await expect(page.locator('.video-id')).toContainText('PBSNewsHour_BudgetBriefing')
})

Then('the claim text is rendered', async ({ page }) => {
  await expect(page.locator('.claim-text')).toContainText('500 billion dollars')
})

Then('the overall assessment verdict is displayed', async ({ page }) => {
  await expect(page.locator('.overall-assessment')).toHaveText('Likely True')
})

Then('all 4 perspectives are rendered with their stances', async ({ page }) => {
  await expect(page.locator('.perspective-card')).toHaveCount(4)
  await expect(page.locator('.stance')).toHaveText(['Support', 'Support', 'Refute', 'Ambiguous'])
})

Then('the deception score is rendered', async ({ page }) => {
  await expect(page.locator('.deception-score')).toHaveText('2.5/10')
})
